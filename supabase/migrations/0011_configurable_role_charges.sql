-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Два независимых исправления:
--
-- 1) Заряды ролей (% кэшбэка и лимит наград Олигарха, дневные лимиты
--    Прокурора и Детектива) были хардкодом в функциях ниже. Теперь админ
--    задаёт их при создании поездки в trips.settings (jsonb), например:
--      { "oligarch_cashback_pct": 25, "oligarch_reward_limit": 3,
--        "prosecutor_daily_charges": 3, "detective_daily_charges": 2 }
--    Отсутствующий ключ = старое поведение (coalesce на старые константы),
--    так что у уже существующих поездок (settings = '{}') ничего не меняется.
--    assign_trip_role() снимает снапшот этих чисел в role_metadata в момент
--    розыгрыша роли — фронтенду не нужен отдельный фетч trips.settings,
--    чтобы показать "осталось X/лимит".
--
--    Заодно для Олигарха попытка (reward_create_count) теперь тратится
--    только при approved — точно так же, как уже исправили для заряда
--    Судьи в 0009. Раньше handle_new_proposal() инкрементировал счётчик и
--    решал cashback-элигибилити сразу при создании жалобы/награды, то есть
--    отклонённая большинством награда впустую жгла одну из первых 3 попыток.
--    Теперь решение и инкремент переехали в close_proposal_if_complete(),
--    в ветку 'approved'. proposals.oligarch_cashback_eligible больше не
--    нужен — дропаем колонку.
--
-- 2) close_proposal_if_complete() сравнивал zero_votes/total_votes ПО
--    ЛЮДЯМ, а не по весу голоса. Из-за этого при равном расколе голосующих
--    50/50 предложение всегда уходило в rejected, даже если один из
--    "согласен"-голосов был удвоен Прокурором и по баллам выигрывал. Порог
--    approved/rejected теперь считается по сумме weight, а не count(*) —
--    кворум (дождались ли всех ожидаемых голосов) как и раньше считается
--    по числу людей, это не связано с весом.

alter table public.proposals drop column if exists oligarch_cashback_eligible;

create or replace function public.handle_new_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_metadata jsonb;
  v_creator_role     text;
begin
  select role_metadata into v_creator_metadata
  from public.trip_members
  where trip_id = new.trip_id and user_id = new.creator_id;

  v_creator_role := coalesce(v_creator_metadata ->> 'role', 'civilian');
  new.creator_role := v_creator_role;

  return new;
end;
$$;

create or replace function public.validate_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal       record;
  v_voter_metadata jsonb;
  v_voter_role     text;
  v_max_abs        integer := 10;
  v_double_limit   integer;
begin
  select trip_id, creator_id, target_id, type, status
  into v_proposal
  from public.proposals
  where id = new.proposal_id;

  if v_proposal.status <> 'pending' then
    raise exception 'Голосование по этому предложению уже закрыто';
  end if;

  if new.voter_id = v_proposal.creator_id or new.voter_id = v_proposal.target_id then
    raise exception 'Создатель и цель предложения не могут голосовать';
  end if;

  select role_metadata into v_voter_metadata
  from public.trip_members
  where trip_id = v_proposal.trip_id and user_id = new.voter_id;

  if v_voter_metadata is null then
    raise exception 'Голосующий не состоит в этой поездке';
  end if;

  v_voter_role := coalesce(v_voter_metadata ->> 'role', 'civilian');

  if v_voter_role = 'judge'
     and coalesce((v_voter_metadata ->> 'super_verdict_remaining')::integer, 0) > 0 then
    v_max_abs := 20;
  end if;

  if v_proposal.type = 'fine' and not (new.score = 0 or new.score between -v_max_abs and -1) then
    raise exception 'Для штрафа допустимы значения 0 или от -% до -1', v_max_abs;
  end if;

  if v_proposal.type = 'reward' and not (new.score = 0 or new.score between 1 and v_max_abs) then
    raise exception 'Для награды допустимы значения 0 или от 1 до %', v_max_abs;
  end if;

  if new.weight = 2 then
    if v_voter_role <> 'prosecutor' then
      raise exception 'Только Прокурор может удвоить вес голоса';
    end if;
    -- double_vote_limit снят в role_metadata при розыгрыше роли
    -- (assign_trip_role) из trips.settings; 3 — фолбэк для старых ролей,
    -- разыгранных до этой миграции.
    v_double_limit := coalesce((v_voter_metadata ->> 'double_vote_limit')::integer, 3);
    if coalesce((v_voter_metadata ->> 'double_vote_count')::integer, 0) >= v_double_limit then
      raise exception 'Лимит удвоений на сегодня исчерпан';
    end if;
    update public.trip_members
    set role_metadata = jsonb_set(
      role_metadata, '{double_vote_count}',
      to_jsonb(coalesce((role_metadata ->> 'double_vote_count')::integer, 0) + 1)
    )
    where trip_id = v_proposal.trip_id and user_id = new.voter_id;
  end if;

  return new;
end;
$$;

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

  -- Порог approved/rejected считаем по сумме weight, а не по числу
  -- голосовавших — удвоенный голос Прокурора должен тянуть вдвое и здесь,
  -- не только в финальном среднем балле ниже.
  select coalesce(sum(weight), 0) into v_zero_weight
  from public.votes
  where proposal_id = new.proposal_id and score = 0;

  select coalesce(sum(weight), 0) into v_total_weight
  from public.votes
  where proposal_id = new.proposal_id;

  if v_zero_weight * 2 >= v_total_weight then
    -- большинство (>=50% по весу) отклонило предложение
    update public.proposals set status = 'rejected' where id = new.proposal_id;

    -- Штраф списывается ТОЛЬКО сейчас (не при создании) и автор раскрывается
    -- всем по имени через buildVerdictMessage на фронтенде — кроме Призрака,
    -- который ни штрафа не платит, ни раскрытия не получает.
    if v_proposal.type = 'fine' and v_proposal.creator_role <> 'ghost' then
      update public.trip_members
      set total_points = total_points - 1
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;
  else
    -- большинство (>50% по весу) согласилось с предложением — взвешенное
    -- среднее (вес 2 у удвоенного голоса Прокурора, иначе вес 1 у всех)
    select sum(score * weight)::numeric / sum(weight) into v_weighted_avg
    from public.votes
    where proposal_id = new.proposal_id and score <> 0;

    v_final_score := round(v_weighted_avg);

    update public.trip_members
    set total_points = total_points + v_final_score
    where trip_id = v_proposal.trip_id and user_id = v_proposal.target_id;

    -- Кэшбэк Олигарха: попытка (reward_create_count) тратится только сейчас,
    -- при реальном approved — отклонённая награда не жжёт лимит впустую
    -- (та же логика, что у заряда суперголоса Судьи ниже).
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
        update public.trip_members
        set total_points = total_points + v_cashback
        where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
      end if;

      update public.trip_members
      set role_metadata = jsonb_set(role_metadata, '{reward_create_count}', to_jsonb(v_reward_count + 1))
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;

    -- Заряд суперголоса Судьи сгорает только сейчас, при реальном одобрении.
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

  -- Настраиваемые админом при создании поездки заряды (trips.settings);
  -- отсутствующий ключ = старое хардкодное значение.
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
      'role', 'oligarch', 'reward_create_count', 0,
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
