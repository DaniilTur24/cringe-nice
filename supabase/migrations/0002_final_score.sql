-- Запусти в Supabase SQL Editor (база уже содержит исходную схему из schema.sql,
-- этот файл — только разница: final_score + обновлённый close_proposal_if_complete).

alter table public.proposals add column final_score integer;

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

  perform set_config('app.internal_update', 'true', true);

  if v_zero_votes * 2 >= v_total_votes then
    update public.proposals set status = 'rejected' where id = new.proposal_id;
  else
    select avg(score) into v_avg_score
    from public.votes
    where proposal_id = new.proposal_id and score <> 0;

    update public.profiles
    set total_points = total_points + round(v_avg_score)
    where id = v_proposal.target_id;

    if v_proposal.type = 'fine' then
      update public.profiles
      set total_points = total_points + 1
      where id = v_proposal.creator_id;
    end if;

    update public.proposals
    set status = 'approved', final_score = round(v_avg_score)
    where id = new.proposal_id;
  end if;

  return new;
end;
$$;
