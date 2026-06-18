-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Раньше заряд суперголоса Судьи (super_verdict_remaining) списывался в
-- validate_vote() сразу при отправке голоса с |score| > 10 — то есть до
-- того, как известен исход. Если дело всё равно отклоняли большинством
-- (нулевыми голосами остальных), заряд сгорал впустую. Переносим списание
-- в close_proposal_if_complete(), и только в ветку 'approved'.

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
