-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Multi-trip dashboard: a user can now belong to several trips at once, so
-- a single global total_points on profiles no longer makes sense (it would
-- mix points earned in trip A with trip B). Points move to trip_members,
-- one counter per (trip, user). trips also gets a status so the creator can
-- Finish/Cancel a trip instead of only ever leaving it 'pending' forever.

-- ----------------------------------------------------------------------------
-- 1. New columns
-- ----------------------------------------------------------------------------
alter table public.trips
  add column status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled'));

alter table public.trip_members
  add column total_points integer not null default 0;

-- ----------------------------------------------------------------------------
-- 2. Point-awarding triggers move from profiles.total_points to
--    trip_members.total_points, scoped by trip_id. trip_members has no
--    UPDATE RLS policy at all, so (unlike profiles) no separate lock-trigger
--    is needed to keep users from writing this column themselves — only
--    these security definer functions can touch it.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_proposal()
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

  if v_zero_votes * 2 >= v_total_votes then
    update public.proposals set status = 'rejected' where id = new.proposal_id;
  else
    select avg(score) into v_avg_score
    from public.votes
    where proposal_id = new.proposal_id and score <> 0;

    update public.trip_members
    set total_points = total_points + round(v_avg_score)
    where trip_id = v_proposal.trip_id and user_id = v_proposal.target_id;

    if v_proposal.type = 'fine' then
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

-- ----------------------------------------------------------------------------
-- 3. profiles.total_points is no longer the source of truth — drop it, and
--    stop guarding it in the lock-trigger (current_role is still guarded).
-- ----------------------------------------------------------------------------
create or replace function public.lock_protected_profile_fields()
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

alter table public.profiles drop column total_points;

-- ----------------------------------------------------------------------------
-- 4. Finishing/cancelling a trip mid-vote auto-rejects whatever proposal was
--    still pending in it, instead of leaving it stuck forever.
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
