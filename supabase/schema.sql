-- ============================================================================
-- Le Grand Суд — схема базы данных для Supabase (PostgreSQL)
-- ============================================================================
-- Голосование по предложению (proposal) считается ЗАВЕРШЁННЫМ, когда отдало
-- голос ожидаемое число участников поездки (все, кроме creator_id и target_id).
--
-- Механика ввода голоса (согласована с фронтендом):
--   - "Отклонить"            -> votes.score = 0
--   - "Согласен" + слайдер   -> fine:   score от -10 до -1 (±20 для Судьи с зарядом)
--                                reward: score от  1 до 10 (±20 для Судьи с зарядом)
--
-- Правило закрытия (большинство по ВЕСУ голоса, не по числу голосовавших):
--   - zero_weight  = сумма weight у голосов со score = 0   ("отклонить")
--   - total_weight = сумма weight по всем голосам
--   - если zero_weight >= 50% от total_weight  -> status = 'rejected'
--       fine:   1 балл списывается у creator_id ТОЛЬКО СЕЙЧАС (не при создании —
--               анонимность жалобы держится до этого момента), кроме Призрака
--       reward: ничего не происходит (баллы не списывались)
--   - иначе                                     -> status = 'approved'
--       target_id получает ROUND(взвешенного среднего: score*weight) по
--       ненулевым голосам (вес даёт Прокурор-удвоение), это же значение
--       сохраняется в proposals.final_score для UI (попап вердикта)
--       fine:   никакого списания/возврата (залог никогда не брался)
--       reward: Олигарх (создатель) получает доп. кэшбэк (% и лимит наград
--               настраиваются админом при создании поездки — trips.settings,
--               по умолчанию 25% на первые 3 награды), попытка тратится
--               только при approved (как и заряд Судьи)
--
-- Скрытые роли (5 уникальных на trip_id + безлимитный "civilian" для
-- остальных) живут в trip_members.role_metadata (jsonb) и сгорают каждые
-- сутки — assign_trip_role() пересобирает их с нуля при новом дне. Дневные
-- лимиты Прокурора/Детектива и кэшбэк/лимит Олигарха настраиваются админом
-- per-trip (trips.settings), снимаются снапшотом в role_metadata при
-- розыгрыше роли — см. assign_trip_role(). Анонимность автора жалобы: скрыт
-- всегда, кроме (а) автоматического раскрытия при rejected, (б) ручного
-- раскрытия Детективом через detective_reveal(). Призрак исключён из истории
-- полностью — его не раскрыть никогда.
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
  -- Per-trip role config set by the admin at creation, e.g.
  -- { oligarch_cashback_pct, oligarch_reward_limit, prosecutor_daily_charges,
  --   detective_daily_charges }. Missing key = old hardcoded default
  -- (see assign_trip_role()/close_proposal_if_complete()).
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
  -- { role, assigned_at, ...per-role charge counters } — assigned by
  -- assign_trip_role(), sgорает каждые сутки (assigned_at), пересобирается с
  -- нуля при новом розыгрыше. '{}' до первого спина рулетки.
  role_metadata jsonb not null default '{}'::jsonb,
  -- Per-trip override of profiles.username/avatar_url — lets someone use a
  -- joke name in one trip without touching their official profile name.
  -- NULL means "use the profile's name/avatar as-is".
  nickname      text,
  avatar_url    text,
  primary key (trip_id, user_id)
);

-- Уникальность роли в пределах одной поездки — civilian и ещё-не-разыгранные
-- (role отсутствует) свободны от ограничения, остальные 5 ролей не могут
-- повторяться у двух участников одного trip_id одновременно.
create unique index trip_members_unique_special_role_per_trip
  on public.trip_members (trip_id, (role_metadata ->> 'role'))
  where (role_metadata ->> 'role') is not null
    and (role_metadata ->> 'role') <> 'civilian';

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
  -- Снапшот роли автора на момент создания (handle_new_proposal) — нужен,
  -- чтобы знать про Призрака/Олигарха без join по trip_members, который к
  -- моменту чтения истории мог бы уже отражать другую (сегодняшнюю) роль.
  creator_role text,
  -- Жалоба анонимна, пока это не true. Ставится либо автоматически при
  -- rejected (кроме Призрака), либо вручную через detective_reveal(scope='all').
  creator_revealed_to_all boolean not null default false,
  constraint proposals_creator_not_target check (creator_id <> target_id)
);

create index proposals_trip_id_idx on public.proposals (trip_id);
create index proposals_status_idx on public.proposals (status);

-- Не больше одного pending-предложения на поездку одновременно — пока
-- текущее не решено (approved/rejected), второй иск или награду никому не
-- отправить. Partial unique index, а не проверка в приложении, потому что
-- так гонка между двумя одновременными INSERT гарантированно ловится самим
-- Postgres, а не отдельно у каждого клиента.
create unique index proposals_one_pending_per_trip
  on public.proposals (trip_id)
  where status = 'pending';

-- ----------------------------------------------------------------------------
-- votes
-- ----------------------------------------------------------------------------
create table public.votes (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  voter_id     uuid not null references public.profiles (id) on delete cascade,
  -- ±20 в БД (для Судьи с зарядом); validate_vote() сужает до ±10 для всех
  -- остальных — диапазон таблицы только верхняя граница, не реальная политика.
  score        integer not null check (score between -20 and 20),
  -- 2 только для голоса Прокурора (удвоение веса в финальном среднем);
  -- validate_vote() проверяет роль/заряд перед тем как разрешить 2.
  weight       integer not null default 1,
  created_at   timestamptz not null default now(),
  unique (proposal_id, voter_id)
);

create index votes_proposal_id_idx on public.votes (proposal_id);

-- ----------------------------------------------------------------------------
-- proposal_reveals — приватное ("только себе") разоблачение автора жалобы
-- Детективом. "Всем" обходится без этой таблицы — просто проставляет
-- proposals.creator_revealed_to_all.
-- ----------------------------------------------------------------------------
create table public.proposal_reveals (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  viewer_id   uuid not null references public.profiles (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (proposal_id, viewer_id)
);

-- ----------------------------------------------------------------------------
-- oligarch_reveals — открытая запись о том, что игрок был Олигархом и сколько
-- скрытого кэшбэка ему перелили в total_points. Кэшбэк копится в
-- role_metadata->>'pending_cashback' (виден только самому Олигарху, как и
-- остальной role_metadata — см. trip_members) и переливается в видимый счёт
-- только когда роль сгорает (см. assign_trip_role) — мгновенное начисление
-- по таймингу выдало бы Олигарха всем ещё во время голосования.
-- ----------------------------------------------------------------------------
create table public.oligarch_reveals (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null,
  revealed_at timestamptz not null default now()
);

-- ============================================================================
-- БИЗНЕС-ЛОГИКА: триггеры и функции
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BEFORE INSERT (не AFTER) — мутирует NEW, чтобы снять снапшот роли автора
--    на proposals.creator_role. Залог больше не списывается здесь вообще —
--    анонимность жалобы держится до отклонения (см. close_proposal_if_complete,
--    секция 3). Олигарх-кэшбэк решается ТАМ ЖЕ, лениво при approved — попытка
--    (reward_create_count) не должна тратиться на отклонённую награду.
-- ----------------------------------------------------------------------------
create function public.handle_new_proposal()
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

create trigger on_proposal_created
  before insert on public.proposals
  for each row
  execute function public.handle_new_proposal();

-- ----------------------------------------------------------------------------
-- 2. Валидация голоса: запрещаем голосовать creator_id/target_id, голосовать
--    повторно после закрытия, голосовать не из этой поездки, следим, чтобы
--    score соответствовал типу предложения — диапазон ±10, кроме Судьи с
--    зарядом (±20). Списание заряда суперголоса перенесено в
--    close_proposal_if_complete (секция 3) — если дело всё равно отклонили
--    большинством, попытка не должна тратить заряд впустую. Вес голоса
--    (weight=2) разрешён только Прокурору с дневным зарядом (double_vote_limit,
--    снят в role_metadata при розыгрыше роли из настроек поездки — см.
--    assign_trip_role — роль и так сгорает каждые сутки).
-- ----------------------------------------------------------------------------
create function public.validate_vote()
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

create trigger before_vote_insert
  before insert on public.votes
  for each row
  execute function public.validate_vote();

-- ----------------------------------------------------------------------------
-- 3. Закрытие голосования: срабатывает после каждого нового голоса, проверяет
--    набралось ли ожидаемое число голосов, и если да — закрывает предложение.
--    Блокировка строки (FOR UPDATE) защищает от гонки при одновременных
--    голосах от нескольких участников в одной транзакции/момент времени.
--    Только один pending proposal на trip_id одновременно (см. индекс
--    proposals_one_pending_per_trip), так что внутри этого триггера нет
--    межпроposal-гонки за total_points в рамках одной поездки. Заряд
--    суперголоса Судьи (|score| > 10, см. validate_vote) и попытка кэшбэка
--    Олигарха (reward_create_count) списываются только в ветке 'approved' —
--    если дело всё равно отклонили большинством, попытка не должна тратить
--    заряд впустую. Порог approved/rejected считается по СУММЕ weight, а не
--    по числу голосовавших — удвоенный голос Прокурора должен тянуть вдвое
--    и здесь, не только в финальном среднем балле ниже (иначе при расколе
--    50/50 по людям дело могло уйти в rejected, даже выигрывая по баллам).
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

  -- Кворум выше считается по числу голосов (1 человек = 1 голос). Порог
  -- approved/rejected ниже — по сумме weight (см. комментарий к секции 3).
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

    -- Кэшбэк Олигарха: % и лимит наград настраиваются админом per-trip,
    -- снапшот лежит в role_metadata (см. assign_trip_role). Попытка
    -- (reward_create_count) тратится только сейчас, при реальном approved.
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

-- ----------------------------------------------------------------------------
-- 6. assign_trip_role — рулетка + dev-панель + ежедневный реролл. Идемпотентна
--    в пределах одного дня (role_metadata.assigned_at = сегодня -> возврат
--    как есть), p_force_reassign=true (только dev-панель) обходит это.
--    pg_advisory_xact_lock защищает от двух одновременных спинов в одном
--    трипе, забирающих одну и ту же роль; unique-индекс — backstop. Перед
--    подсчётом занятых ролей чужие протухшие (assigned_at не сегодня)
--    спецроли сбрасываются на civilian — иначе участник, который ещё не
--    заходил сегодня, продолжал бы блокировать свою вчерашнюю роль для
--    всех остальных. Дневные лимиты Прокурора/Детектива и %/лимит Олигарха
--    настроены админом per-trip в trips.settings — снимаем снапшот в
--    role_metadata здесь, чтобы фронтенду не нужен был отдельный фетч
--    trips.settings для отображения "осталось X/лимит".
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

grant execute on function public.assign_trip_role(uuid, uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. detective_reveal — раскрытие автора закрытой жалобы. Блокирует строку
--    trip_members Детектива ПЕРЕД чтением остатка зарядов, чтобы два почти
--    одновременных вызова на разные proposal_id не оба прочитали один и тот
--    же remaining и не списали в 0 (настоящая гонка — в отличие от
--    голосования, где сериализует unique(proposal_id, voter_id) и кнопка
--    submit).
-- ----------------------------------------------------------------------------
-- Сначала 'self' (тратит 1 заряд, открывает имя только этому Детективу),
-- затем можно эскалировать тот же кейс до 'all' — бесплатная публикация уже
-- узнанного факта, требует, чтобы 'self' по этому делу уже случился.
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
  v_proposal     record;
  v_detective    jsonb;
  v_remaining    integer;
  v_already_self boolean;
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

  select exists (
    select 1 from public.proposal_reveals
    where proposal_id = p_proposal_id and viewer_id = auth.uid()
  ) into v_already_self;

  if p_scope = 'all' then
    if not v_already_self then
      raise exception 'Сначала узнай автора только для себя';
    end if;
    update public.proposals set creator_revealed_to_all = true where id = p_proposal_id;
    return;
  end if;

  -- p_scope = 'self'
  if v_already_self then
    raise exception 'Ты уже узнал(а) автора';
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

  insert into public.proposal_reveals (proposal_id, viewer_id) values (p_proposal_id, auth.uid());

  update public.trip_members
  set role_metadata = jsonb_set(role_metadata, '{reveals_remaining}', to_jsonb(v_remaining - 1))
  where trip_id = v_proposal.trip_id and user_id = auth.uid();
end;
$$;

grant execute on function public.detective_reveal(uuid, text) to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.proposals       enable row level security;
alter table public.votes           enable row level security;
alter table public.proposal_reveals enable row level security;
alter table public.oligarch_reveals enable row level security;

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

-- Удалить можно только закрытую (finished/cancelled) поездку — активную
-- сперва нужно завершить/отменить, это закрывает любое pending-голосование.
-- trip_members/proposals/votes у удаляемой поездки уйдут каскадом по FK.
create policy "trips_delete_admin_closed_only"
  on public.trips for delete
  to authenticated
  using (admin_id = auth.uid() and status <> 'active');

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

-- --------------------------------------------------------- proposal_reveals --
create policy "proposal_reveals_select_own"
  on public.proposal_reveals for select
  to authenticated
  using (viewer_id = auth.uid());

-- INSERT/UPDATE/DELETE не разрешены пользователям — пишет только
-- detective_reveal() (security definer обходит RLS).

-- --------------------------------------------------------- oligarch_reveals --
create policy "oligarch_reveals_select_trip_members"
  on public.oligarch_reveals for select
  to authenticated
  using (public.is_trip_member(trip_id, auth.uid()));

-- INSERT/UPDATE/DELETE не разрешены пользователям — пишет только
-- assign_trip_role() (security definer обходит RLS).
