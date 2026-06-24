-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Баг (не в коде, а в дизайне): кэшбэк Олигарха прибавлялся к total_points
-- сразу, в момент одобрения награды. total_points виден всем участникам
-- трипа в реалтайме через лидерборд — скачок чужого счёта сразу после
-- одобренной награды легко связать по таймингу с конкретным игроком и
-- спалить Олигарха, хотя его роль по дизайну должна быть скрытой.
--
-- Чиним: кэшбэк больше не идёт в total_points сразу, а копится в
-- role_metadata->>'pending_cashback' — поле видно только самому Олигарху
-- (как и весь остальной role_metadata: useTripMembers фронтенда не
-- запрашивает role_metadata чужих игроков, только total_points/nickname).
-- Когда роль Олигарха сгорает — либо сам игрок на следующий день
-- перезаходит и крутит колесо заново, либо кто-то другой триггерит lazy
-- expiry его протухшей вчерашней роли (см. 0012) — накопленный
-- pending_cashback одним разом переливается в total_points, и публикуется
-- открытая запись в новой таблице oligarch_reveals ("игрок X был
-- Олигархом и заработал N баллов кэшбэка"), чтобы скачок баллов не
-- выглядел как взявшийся из ниоткуда.

create table public.oligarch_reveals (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null,
  revealed_at timestamptz not null default now()
);

alter table public.oligarch_reveals enable row level security;

create policy "oligarch_reveals_select_trip_members"
  on public.oligarch_reveals for select
  to authenticated
  using (public.is_trip_member(trip_id, auth.uid()));

-- INSERT/UPDATE/DELETE не разрешены пользователям — пишет только
-- assign_trip_role() (security definer обходит RLS).

create or replace function public.close_proposal_if_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal       record;
  v_expected_votes integer;
  v_total_votes    integer;
  v_zero_weight    numeric;
  v_total_weight   numeric;
  v_weighted_avg   numeric;
  v_final_score    integer;
  v_oligarch       jsonb;
  v_reward_count   integer;
  v_reward_limit   integer;
  v_cashback_pct   numeric;
  v_cashback       integer;
begin
  select trip_id, creator_id, target_id, type, status, creator_role
  into v_proposal
  from public.proposals
  where id = new.proposal_id
  for update;

  if v_proposal.status <> 'pending' then
    return new;
  end if;

  select count(*) into v_expected_votes
  from public.trip_members
  where trip_id = v_proposal.trip_id
    and user_id not in (v_proposal.creator_id, v_proposal.target_id);

  select count(*) into v_total_votes
  from public.votes
  where proposal_id = new.proposal_id;

  if v_total_votes < v_expected_votes then
    return new;
  end if;

  select coalesce(sum(weight), 0) into v_zero_weight
  from public.votes
  where proposal_id = new.proposal_id and score = 0;

  select coalesce(sum(weight), 0) into v_total_weight
  from public.votes
  where proposal_id = new.proposal_id;

  if v_zero_weight * 2 >= v_total_weight then
    update public.proposals set status = 'rejected' where id = new.proposal_id;

    if v_proposal.type = 'fine' and v_proposal.creator_role <> 'ghost' then
      update public.trip_members
      set total_points = total_points - 1
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;
  else
    select sum(score * weight)::numeric / sum(weight) into v_weighted_avg
    from public.votes
    where proposal_id = new.proposal_id and score <> 0;

    v_final_score := round(v_weighted_avg);

    update public.trip_members
    set total_points = total_points + v_final_score
    where trip_id = v_proposal.trip_id and user_id = v_proposal.target_id;

    if v_proposal.type = 'reward' and v_proposal.creator_role = 'oligarch' then
      select role_metadata into v_oligarch
      from public.trip_members
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id
      for update;

      v_reward_count := coalesce((v_oligarch ->> 'reward_create_count')::integer, 0);
      v_reward_limit := coalesce((v_oligarch ->> 'reward_limit')::integer, 3);
      v_cashback_pct := coalesce((v_oligarch ->> 'cashback_pct')::numeric, 25);

      if v_reward_count < v_reward_limit then
        v_cashback := ceil(v_final_score * v_cashback_pct / 100);
      else
        v_cashback := 0;
      end if;

      -- Кэшбэк не идёт в total_points сразу: скачок видимого счёта в момент
      -- одобрения чужой награды по таймингу выдал бы Олигарха остальным.
      -- Копим в pending_cashback (виден только самому Олигарху через его
      -- role_metadata) — переливается в total_points и раскрывается всем
      -- только когда роль сгорает, см. flush в assign_trip_role().
      update public.trip_members
      set role_metadata = jsonb_set(
        jsonb_set(role_metadata, '{reward_create_count}', to_jsonb(v_reward_count + 1)),
        '{pending_cashback}',
        to_jsonb(coalesce((v_oligarch ->> 'pending_cashback')::integer, 0) + v_cashback)
      )
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;

    update public.trip_members tm
    set role_metadata = jsonb_set(
      tm.role_metadata, '{super_verdict_remaining}',
      to_jsonb(coalesce((tm.role_metadata ->> 'super_verdict_remaining')::integer, 0) - 1)
    )
    from public.votes v
    where v.proposal_id = new.proposal_id
      and abs(v.score) > 10
      and tm.trip_id = v_proposal.trip_id
      and tm.user_id = v.voter_id;

    update public.proposals
    set status = 'approved', final_score = v_final_score
    where id = new.proposal_id;
  end if;

  return new;
end;
$$;

create or replace function public.assign_trip_role(
  p_trip_id uuid,
  p_user_id uuid,
  p_forced_role text default null,
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
