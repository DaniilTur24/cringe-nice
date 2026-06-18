-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- 5 уникальных скрытых ролей на поездку, 6-й+ участник — "Гражданин" без
-- перков. Роль + счётчики перков живут в trip_members.role_metadata (jsonb),
-- сгорают каждые сутки (role_metadata.assigned_at) — при новом заходе в трип
-- рулетка крутится заново, все лимиты перков пересобираются с нуля.
--
-- Анонимность жалоб: залог больше не списывается при создании
-- (handle_new_proposal), только при отклонении (close_proposal_if_complete),
-- и в этот момент автор раскрывается всем — кроме Призрака, который вообще
-- исключён из истории. Одобренные жалобы анонимны навсегда, кроме как через
-- Детектива.
--
-- Голос Прокурора (weight=2) входит только во взвешенное среднее итогового
-- балла; кворум считается по числу голосов как раньше. Диапазон score в БД
-- расширен до ±20 для Судьи, validate_vote всё равно ограничивает ±10 всем
-- остальным.

alter table public.trip_members
  add column role_metadata jsonb not null default '{}'::jsonb;

alter table public.proposals
  add column creator_role text,
  add column oligarch_cashback_eligible boolean not null default false,
  add column creator_revealed_to_all boolean not null default false;

alter table public.votes
  add column weight integer not null default 1;

create table public.proposal_reveals (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  viewer_id   uuid not null references public.profiles (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (proposal_id, viewer_id)
);

alter table public.proposal_reveals enable row level security;

create policy "proposal_reveals_select_own"
  on public.proposal_reveals for select
  to authenticated
  using (viewer_id = auth.uid());
-- INSERT/UPDATE/DELETE не разрешены клиенту — пишет только detective_reveal().

alter table public.votes
  drop constraint votes_score_check;
alter table public.votes
  add constraint votes_score_check check (score between -20 and 20);

-- Уникальность роли в пределах одной поездки (civilian/unassigned свободны).
create unique index trip_members_unique_special_role_per_trip
  on public.trip_members (trip_id, (role_metadata ->> 'role'))
  where (role_metadata ->> 'role') is not null
    and (role_metadata ->> 'role') <> 'civilian';

-- ----------------------------------------------------------------------------
-- handle_new_proposal — теперь BEFORE INSERT (мутирует NEW), без списания
-- залога. Снимает снапшот creator_role и считает кэшбэк-элигибилити Олигарха.
-- ----------------------------------------------------------------------------
drop trigger on_proposal_created on public.proposals;
drop function public.handle_new_proposal();

create function public.handle_new_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_metadata jsonb;
  v_creator_role     text;
  v_reward_count     integer;
begin
  select role_metadata into v_creator_metadata
  from public.trip_members
  where trip_id = new.trip_id and user_id = new.creator_id;

  v_creator_role := coalesce(v_creator_metadata ->> 'role', 'civilian');
  new.creator_role := v_creator_role;

  if new.type = 'reward' and v_creator_role = 'oligarch' then
    v_reward_count := coalesce((v_creator_metadata ->> 'reward_create_count')::integer, 0);

    if v_reward_count < 3 then
      new.oligarch_cashback_eligible := true;
    end if;

    update public.trip_members
    set role_metadata = jsonb_set(role_metadata, '{reward_create_count}', to_jsonb(v_reward_count + 1))
    where trip_id = new.trip_id and user_id = new.creator_id;
  end if;

  return new;
end;
$$;

create trigger on_proposal_created
  before insert on public.proposals
  for each row
  execute function public.handle_new_proposal();

-- ----------------------------------------------------------------------------
-- validate_vote — диапазон зависит от роли (Судья ±20 с зарядом), weight=2
-- только для Прокурора с дневным зарядом (он же = "за один день в роли").
-- ----------------------------------------------------------------------------
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
    if coalesce((v_voter_metadata ->> 'double_vote_count')::integer, 0) >= 3 then
      raise exception 'Лимит удвоений на сегодня исчерпан';
    end if;
    update public.trip_members
    set role_metadata = jsonb_set(
      role_metadata, '{double_vote_count}',
      to_jsonb(coalesce((role_metadata ->> 'double_vote_count')::integer, 0) + 1)
    )
    where trip_id = v_proposal.trip_id and user_id = new.voter_id;
  end if;

  if v_voter_role = 'judge' and abs(new.score) > 10 then
    update public.trip_members
    set role_metadata = jsonb_set(
      role_metadata, '{super_verdict_remaining}',
      to_jsonb(coalesce((v_voter_metadata ->> 'super_verdict_remaining')::integer, 0) - 1)
    )
    where trip_id = v_proposal.trip_id and user_id = new.voter_id;
  end if;

  return new;
end;
$$;
-- (триггер before_vote_insert уже существует и уже указывает на validate_vote
-- по имени — create or replace function достаточно, drop/recreate не нужен)

-- ----------------------------------------------------------------------------
-- close_proposal_if_complete — взвешенное среднее, отложенный штраф (с
-- исключением для Призрака) + авто-раскрытие при отклонении, кэшбэк Олигарха
-- при одобрении.
-- ----------------------------------------------------------------------------
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
  v_zero_votes     integer;
  v_weighted_avg   numeric;
  v_final_score    integer;
  v_cashback       integer;
begin
  select trip_id, creator_id, target_id, type, status, creator_role,
         oligarch_cashback_eligible
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

  select count(*) into v_zero_votes
  from public.votes
  where proposal_id = new.proposal_id and score = 0;

  if v_zero_votes * 2 >= v_total_votes then
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

    if v_proposal.type = 'reward' and v_proposal.oligarch_cashback_eligible then
      v_cashback := ceil(v_final_score * 0.25);
      update public.trip_members
      set total_points = total_points + v_cashback
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;

    update public.proposals
    set status = 'approved', final_score = v_final_score
    where id = new.proposal_id;
  end if;

  return new;
end;
$$;
-- (триггер after_vote_insert уже существует и уже указывает на
-- close_proposal_if_complete по имени — drop/recreate не нужен)

-- ----------------------------------------------------------------------------
-- assign_trip_role — рулетка + dev-панель + ежедневный реролл.
-- Идемпотентна В ПРЕДЕЛАХ ОДНОГО ДНЯ (assigned_at = today -> возврат как
-- есть), но p_force_reassign=true (только dev-панель) обходит это и всегда
-- пересобирает role_metadata с нуля. При просрочке даты — то же самое, без
-- необходимости в force_reassign.
-- ----------------------------------------------------------------------------
create function public.assign_trip_role(
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

  v_metadata := case v_chosen_role
    when 'prosecutor' then jsonb_build_object('role', 'prosecutor', 'double_vote_count', 0)
    when 'judge'       then jsonb_build_object('role', 'judge', 'super_verdict_remaining', 2)
    when 'ghost'        then jsonb_build_object('role', 'ghost')
    when 'oligarch'     then jsonb_build_object('role', 'oligarch', 'reward_create_count', 0)
    when 'detective'    then jsonb_build_object('role', 'detective', 'reveals_remaining', 2)
    else jsonb_build_object('role', 'civilian')
  end;
  v_metadata := v_metadata || jsonb_build_object('assigned_at', v_today);

  update public.trip_members
  set role_metadata = v_metadata
  where trip_id = p_trip_id and user_id = p_user_id;

  return v_metadata;
end;
$$;

grant execute on function public.assign_trip_role(uuid, uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- detective_reveal — раскрытие автора закрытой жалобы. Блокирует строку
-- trip_members Детектива ПЕРЕД чтением остатка зарядов (иначе два почти
-- одновременных вызова на разные proposal_id могут оба прочитать remaining=1
-- и оба списать в 0 — настоящая гонка, в отличие от голосования, которое
-- сериализуется уникальным (proposal_id, voter_id) и кнопкой submit).
-- ----------------------------------------------------------------------------
create function public.detective_reveal(
  p_proposal_id uuid,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal  record;
  v_detective jsonb;
  v_remaining integer;
begin
  if p_scope not in ('self', 'all') then
    raise exception 'Некорректный scope разоблачения: %', p_scope;
  end if;

  select trip_id, type, status, creator_role, creator_revealed_to_all
  into v_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if v_proposal is null then
    raise exception 'Предложение не найдено';
  end if;
  if v_proposal.status = 'pending' then
    raise exception 'Нельзя разоблачить автора пока дело не закрыто';
  end if;
  if v_proposal.type <> 'fine' then
    raise exception 'Разоблачение применимо только к жалобам';
  end if;
  if v_proposal.creator_role = 'ghost' then
    raise exception 'Призрака нельзя разоблачить';
  end if;
  if v_proposal.creator_revealed_to_all then
    raise exception 'Автор уже публично известен';
  end if;

  if p_scope = 'self' and exists (
    select 1 from public.proposal_reveals
    where proposal_id = p_proposal_id and viewer_id = auth.uid()
  ) then
    raise exception 'Ты уже разоблачил(а) этого автора';
  end if;

  select role_metadata into v_detective
  from public.trip_members
  where trip_id = v_proposal.trip_id and user_id = auth.uid()
  for update;

  if v_detective is null or (v_detective ->> 'role') <> 'detective' then
    raise exception 'Только Детектив может разоблачать авторов';
  end if;

  v_remaining := coalesce((v_detective ->> 'reveals_remaining')::integer, 0);
  if v_remaining <= 0 then
    raise exception 'Заряды разоблачения исчерпаны';
  end if;

  if p_scope = 'all' then
    update public.proposals set creator_revealed_to_all = true where id = p_proposal_id;
  else
    insert into public.proposal_reveals (proposal_id, viewer_id)
    values (p_proposal_id, auth.uid())
    on conflict do nothing;
  end if;

  update public.trip_members
  set role_metadata = jsonb_set(role_metadata, '{reveals_remaining}', to_jsonb(v_remaining - 1))
  where trip_id = v_proposal.trip_id and user_id = auth.uid();
end;
$$;

grant execute on function public.detective_reveal(uuid, text) to authenticated;
