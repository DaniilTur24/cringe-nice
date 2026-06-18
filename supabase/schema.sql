-- ============================================================================
-- Le Grand Суд — схема базы данных для Supabase (PostgreSQL)
-- ============================================================================
-- Голосование по предложению (proposal) считается ЗАВЕРШЁННЫМ, когда отдало
-- голос ожидаемое число участников поездки (все, кроме creator_id и target_id).
--
-- Механика ввода голоса (согласована с фронтендом):
--   - "Отклонить"            -> votes.score = 0
--   - "Согласен" + слайдер   -> fine:   score от -10 до -1
--                                reward: score от  1 до 10
--
-- Правило закрытия (большинство):
--   - zero_votes  = голоса со score = 0   ("отклонить")
--   - nonzero_votes = голоса со score <> 0 ("согласен")
--   - если zero_votes >= 50% от всех голосов  -> status = 'rejected'
--       fine:   1 балл creator_id сгорает (был списан при создании)
--       reward: ничего не происходит (баллы не списывались)
--   - иначе (nonzero_votes > 50%)              -> status = 'approved'
--       target_id получает ROUND(AVG(score)) по ненулевым голосам, это же
--       значение сохраняется в proposals.final_score для UI (попап вердикта)
--       fine:   creator_id получает обратно 1 балл (возврат залога)
--       reward: ничего дополнительно не происходит
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  avatar_url    text,
  -- quoted: current_role is a reserved keyword (built-in CURRENT_ROLE function)
  "current_role" text
);

-- ----------------------------------------------------------------------------
-- trips
-- ----------------------------------------------------------------------------
create table public.trips (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  admin_id  uuid not null references public.profiles (id) on delete restrict,
  settings  jsonb not null default '{}'::jsonb,
  -- 'active' until the creator explicitly Finishes or Cancels it.
  status    text not null default 'active' check (status in ('active', 'finished', 'cancelled'))
);

-- Без этой таблицы невозможно определить "всех участников поездки" для
-- закрытия голосования — добавлена как необходимая инфраструктура.
create table public.trip_members (
  trip_id       uuid not null references public.trips (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  -- per-trip score: a user in several trips has an independent total in each.
  total_points  integer not null default 0,
  primary key (trip_id, user_id)
);

-- ----------------------------------------------------------------------------
-- proposals
-- ----------------------------------------------------------------------------
create table public.proposals (
  id           uuid primary key default gen_random_uuid(),
  -- нужен, чтобы знать круг голосующих (участники именно этой поездки)
  trip_id      uuid not null references public.trips (id) on delete cascade,
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('fine', 'reward')),
  description  text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- ROUND(AVG(score)) по ненулевым голосам в момент approved; null пока pending/rejected
  final_score  integer,
  created_at   timestamptz not null default now(),
  constraint proposals_creator_not_target check (creator_id <> target_id)
);

create index proposals_trip_id_idx on public.proposals (trip_id);
create index proposals_status_idx on public.proposals (status);

-- ----------------------------------------------------------------------------
-- votes
-- ----------------------------------------------------------------------------
create table public.votes (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  voter_id     uuid not null references public.profiles (id) on delete cascade,
  score        integer not null check (score between -10 and 10),
  created_at   timestamptz not null default now(),
  unique (proposal_id, voter_id)
);

create index votes_proposal_id_idx on public.votes (proposal_id);

-- ============================================================================
-- БИЗНЕС-ЛОГИКА: триггеры и функции
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. При создании жалобы ('fine') у creator_id сразу списывается 1 балл
--    в рамках этой поездки (залог, который либо вернётся при approved,
--    либо сгорит при rejected). trip_members не имеет UPDATE-политики RLS
--    вовсе, так что обычный пользователь не может подделать total_points
--    напрямую — это может сделать только security definer функция.
-- ----------------------------------------------------------------------------
create function public.handle_new_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'fine' then
    update public.trip_members
    set total_points = total_points - 1
    where trip_id = new.trip_id and user_id = new.creator_id;
  end if;
  return new;
end;
$$;

create trigger on_proposal_created
  after insert on public.proposals
  for each row
  execute function public.handle_new_proposal();

-- ----------------------------------------------------------------------------
-- 2. Валидация голоса: запрещаем голосовать creator_id/target_id, голосовать
--    повторно после закрытия, голосовать не из этой поездки, и следим, чтобы
--    score соответствовал типу предложения (см. механику ввода выше).
-- ----------------------------------------------------------------------------
create function public.validate_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
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

  if not exists (
    select 1 from public.trip_members
    where trip_id = v_proposal.trip_id and user_id = new.voter_id
  ) then
    raise exception 'Голосующий не состоит в этой поездке';
  end if;

  if v_proposal.type = 'fine' and not (new.score = 0 or new.score between -10 and -1) then
    raise exception 'Для штрафа допустимы значения 0 или от -10 до -1';
  end if;

  if v_proposal.type = 'reward' and not (new.score = 0 or new.score between 1 and 10) then
    raise exception 'Для награды допустимы значения 0 или от 1 до 10';
  end if;

  return new;
end;
$$;

create trigger before_vote_insert
  before insert on public.votes
  for each row
  execute function public.validate_vote();

-- ----------------------------------------------------------------------------
-- 3. Закрытие голосования: срабатывает после каждого нового голоса, проверяет
--    набралось ли ожидаемое число голосов, и если да — закрывает предложение.
--    Блокировка строки (FOR UPDATE) защищает от гонки при одновременных
--    голосах от нескольких участников в одной транзакции/момент времени.
-- ----------------------------------------------------------------------------
create function public.close_proposal_if_complete()
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
  v_avg_score      numeric;
begin
  select trip_id, creator_id, target_id, type, status
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
    -- большинство (>=50%) отклонило предложение
    update public.proposals set status = 'rejected' where id = new.proposal_id;
    -- fine: 1 балл creator_id остаётся списанным (сгорел), reward: ничего не менялось
  else
    -- большинство (>50%) согласилось с предложением
    select avg(score) into v_avg_score
    from public.votes
    where proposal_id = new.proposal_id and score <> 0;

    update public.trip_members
    set total_points = total_points + round(v_avg_score)
    where trip_id = v_proposal.trip_id and user_id = v_proposal.target_id;

    if v_proposal.type = 'fine' then
      -- возврат залога creator_id
      update public.trip_members
      set total_points = total_points + 1
      where trip_id = v_proposal.trip_id and user_id = v_proposal.creator_id;
    end if;

    update public.proposals
    set status = 'approved', final_score = round(v_avg_score)
    where id = new.proposal_id;
  end if;

  return new;
end;
$$;

create trigger after_vote_insert
  after insert on public.votes
  for each row
  execute function public.close_proposal_if_complete();

-- ----------------------------------------------------------------------------
-- 4. Защита current_role от прямого изменения пользователем через UPDATE
--    profiles (RLS разрешает обновлять свой профиль, но не эту колонку).
--    total_points больше не живёт на profiles (см. trip_members выше), так
--    что этому триггеру достаточно следить только за current_role.
-- ----------------------------------------------------------------------------
create function public.lock_protected_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.internal_update', true), 'false') = 'true' then
    return new;
  end if;

  if new.current_role is distinct from old.current_role then
    raise exception 'current_role изменяется только системой';
  end if;

  return new;
end;
$$;

create trigger before_profile_update
  before update on public.profiles
  for each row
  execute function public.lock_protected_profile_fields();

-- ----------------------------------------------------------------------------
-- 5. Завершение/отмена поездки создателем (status: active -> finished или
--    cancelled) автоматически отклоняет всё, что всё ещё голосуется в ней —
--    иначе такое предложение осталось бы pending навечно.
-- ----------------------------------------------------------------------------
create function public.reject_pending_proposals_on_trip_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.proposals
  set status = 'rejected'
  where trip_id = new.id and status = 'pending';
  return new;
end;
$$;

create trigger on_trip_status_change
  after update on public.trips
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function public.reject_pending_proposals_on_trip_close();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles     enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.proposals    enable row level security;
alter table public.votes        enable row level security;

-- ---------------------------------------------------------------- profiles --
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------- trips --
create policy "trips_select_members"
  on public.trips for select
  to authenticated
  using (
    admin_id = auth.uid()
    or exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id and trip_members.user_id = auth.uid()
    )
  );

create policy "trips_insert_self_as_admin"
  on public.trips for insert
  to authenticated
  with check (admin_id = auth.uid());

create policy "trips_update_admin_only"
  on public.trips for update
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- ---------------------------------------------------------- trip_members --
-- is_trip_member() is SECURITY DEFINER so the membership check below doesn't
-- re-trigger this same SELECT policy on trip_members — a direct self-join
-- here causes Postgres to report "infinite recursion detected in policy".
create function public.is_trip_member(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_user_id
  );
$$;

create policy "trip_members_select_members"
  on public.trip_members for select
  to authenticated
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id and trips.admin_id = auth.uid()
    )
    or public.is_trip_member(trip_members.trip_id, auth.uid())
  );

create policy "trip_members_insert_self_or_admin"
  on public.trip_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id and trips.admin_id = auth.uid()
    )
  );

create policy "trip_members_delete_self_or_admin"
  on public.trip_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id and trips.admin_id = auth.uid()
    )
  );

-- -------------------------------------------------------------- proposals --
create policy "proposals_select_trip_members"
  on public.proposals for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = proposals.trip_id and trip_members.user_id = auth.uid()
    )
  );

create policy "proposals_insert_trip_members"
  on public.proposals for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.trip_members
      where trip_members.trip_id = proposals.trip_id and trip_members.user_id = auth.uid()
    )
    and exists (
      select 1 from public.trip_members
      where trip_members.trip_id = proposals.trip_id and trip_members.user_id = proposals.target_id
    )
  );

-- UPDATE/DELETE намеренно не разрешены пользователям: статус меняется только
-- триггером close_proposal_if_complete (security definer обходит RLS).

-- ------------------------------------------------------------------ votes --
create policy "votes_select_trip_members"
  on public.votes for select
  to authenticated
  using (
    exists (
      select 1 from public.proposals
      join public.trip_members on trip_members.trip_id = proposals.trip_id
      where proposals.id = votes.proposal_id and trip_members.user_id = auth.uid()
    )
  );

create policy "votes_insert_own"
  on public.votes for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.proposals
      where proposals.id = votes.proposal_id and proposals.status = 'pending'
    )
  );

-- UPDATE/DELETE не разрешены: голос неизменяем после подачи.
