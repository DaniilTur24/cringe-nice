-- Fix privilege escalation in assign_trip_role: add auth.uid() == p_user_id guard.
-- Previously any authenticated user could call assign_trip_role with any p_user_id
-- to reset another participant's role. Now the function raises if the caller is
-- not the target user.
create or replace function public.assign_trip_role(
  p_trip_id       uuid,
  p_user_id       uuid,
  p_forced_role   text    default null,
  p_force_reassign boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_special_roles text[] := array['prosecutor', 'judge', 'ghost', 'oligarch', 'detective'];
  v_taken_roles   text[];
  v_available     text[];
  v_chosen_role   text;
  v_existing      jsonb;
  v_metadata      jsonb;
  v_today         text := current_date::text;
  v_settings      jsonb;
  v_prosecutor_charges integer;
  v_detective_charges  integer;
  v_oligarch_pct       numeric;
  v_oligarch_limit     integer;
  v_flush_amount       integer;
  v_stale_member       record;
begin
  -- Пользователь может назначать роль только себе.
  if p_user_id <> auth.uid() then
    raise exception 'Можно назначать роль только себе';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_trip_id::text));

  if not exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id
  ) then
    raise exception 'Пользователь не состоит в этой поездке';
  end if;

  select role_metadata into v_existing
  from public.trip_members
  where trip_id = p_trip_id and user_id = p_user_id;

  if not p_force_reassign
     and v_existing is not null
     and (v_existing ->> 'assigned_at') = v_today then
    return v_existing;
  end if;

  -- Роль сейчас будет перезаписана ниже — если это была роль Олигарха,
  -- сначала переливаем накопленный скрытый кэшбэк в видимый total_points и
  -- публикуем открытое раскрытие (oligarch_reveals), иначе баллы тихо
  -- потерялись бы вместе со старым role_metadata.
  if v_existing is not null and (v_existing ->> 'role') = 'oligarch' then
    v_flush_amount := coalesce((v_existing ->> 'pending_cashback')::integer, 0);
    if v_flush_amount > 0 then
      update public.trip_members
      set total_points = total_points + v_flush_amount
      where trip_id = p_trip_id and user_id = p_user_id;

      insert into public.oligarch_reveals (trip_id, user_id, amount)
      values (p_trip_id, p_user_id, v_flush_amount);
    end if;
  end if;

  -- Lazy global expiry: чужая роль со вчера (или раньше), которую владелец
  -- ещё не переразыграл сегодня сам, не должна блокировать пул для
  -- остальных — сбрасываем её на civilian, не трогая assigned_at, чтобы при
  -- собственном визите этот участник всё равно увидел колесо, а не "роль
  -- уже разыграна сегодня". Протухшим Олигархам в этом же проходе флушим
  -- кэшбэк и раскрываем — по той же причине, что и для себя выше.
  for v_stale_member in
    select user_id, role_metadata
    from public.trip_members
    where trip_id = p_trip_id
      and user_id <> p_user_id
      and (role_metadata ->> 'role') is not null
      and (role_metadata ->> 'role') <> 'civilian'
      and (role_metadata ->> 'assigned_at') is distinct from v_today
  loop
    v_flush_amount := 0;
    if (v_stale_member.role_metadata ->> 'role') = 'oligarch' then
      v_flush_amount := coalesce((v_stale_member.role_metadata ->> 'pending_cashback')::integer, 0);
    end if;

    update public.trip_members
    set total_points = total_points + v_flush_amount,
        role_metadata = jsonb_build_object(
          'role', 'civilian', 'assigned_at', v_stale_member.role_metadata ->> 'assigned_at'
        )
    where trip_id = p_trip_id and user_id = v_stale_member.user_id;

    if v_flush_amount > 0 then
      insert into public.oligarch_reveals (trip_id, user_id, amount)
      values (p_trip_id, v_stale_member.user_id, v_flush_amount);
    end if;
  end loop;

  -- Собственная (возможно устаревшая) роль не должна блокировать сама себя
  -- при реролле — исключаем себя из списка "занятых".
  select array_agg(role_metadata ->> 'role') into v_taken_roles
  from public.trip_members
  where trip_id = p_trip_id
    and user_id <> p_user_id
    and (role_metadata ->> 'role') is not null
    and (role_metadata ->> 'role') <> 'civilian';

  v_taken_roles := coalesce(v_taken_roles, array[]::text[]);

  if p_forced_role is not null then
    if p_forced_role <> 'civilian' and p_forced_role = any(v_taken_roles) then
      raise exception 'Роль % уже занята в этой поездке', p_forced_role;
    end if;
    if p_forced_role <> 'civilian' and not (p_forced_role = any(v_special_roles)) then
      raise exception 'Неизвестная роль: %', p_forced_role;
    end if;
    v_chosen_role := p_forced_role;
  else
    select array_agg(r) into v_available
    from unnest(v_special_roles) r
    where not (r = any(v_taken_roles));

    if v_available is null or array_length(v_available, 1) = 0 then
      v_chosen_role := 'civilian';
    else
      v_chosen_role := v_available[1 + floor(random() * array_length(v_available, 1))::int];
    end if;
  end if;

  select settings into v_settings from public.trips where id = p_trip_id;
  v_prosecutor_charges := coalesce((v_settings ->> 'prosecutor_daily_charges')::integer, 3);
  v_detective_charges  := coalesce((v_settings ->> 'detective_daily_charges')::integer, 2);
  v_oligarch_pct        := coalesce((v_settings ->> 'oligarch_cashback_pct')::numeric, 25);
  v_oligarch_limit      := coalesce((v_settings ->> 'oligarch_reward_limit')::integer, 3);

  v_metadata := case v_chosen_role
    when 'prosecutor' then jsonb_build_object(
      'role', 'prosecutor', 'double_vote_count', 0, 'double_vote_limit', v_prosecutor_charges
    )
    when 'judge'       then jsonb_build_object('role', 'judge', 'super_verdict_remaining', 2)
    when 'ghost'        then jsonb_build_object('role', 'ghost')
    when 'oligarch'     then jsonb_build_object(
      'role', 'oligarch', 'reward_create_count', 0, 'pending_cashback', 0,
      'reward_limit', v_oligarch_limit, 'cashback_pct', v_oligarch_pct
    )
    when 'detective'    then jsonb_build_object(
      'role', 'detective', 'reveals_remaining', v_detective_charges, 'reveals_limit', v_detective_charges
    )
    else jsonb_build_object('role', 'civilian')
  end;
  v_metadata := v_metadata || jsonb_build_object('assigned_at', v_today);

  update public.trip_members
  set role_metadata = v_metadata
  where trip_id = p_trip_id and user_id = p_user_id;

  return v_metadata;
end;
$$;
