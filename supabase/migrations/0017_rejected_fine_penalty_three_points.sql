-- Rejected fine penalty: false/failed complaints now cost 3 points instead of 1.

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
      set total_points = total_points - 3
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
