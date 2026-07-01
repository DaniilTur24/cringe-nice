-- Returns aggregate vote counts for a proposal without exposing individual
-- scores or voter identities (score != 0 = approve, score = 0 = reject).
create or replace function public.get_vote_counts(p_proposal_id uuid)
returns table(approve_count integer, reject_count integer, total_count integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) filter (where score != 0)::integer as approve_count,
    count(*) filter (where score = 0)::integer  as reject_count,
    count(*)::integer                            as total_count
  from public.votes
  where proposal_id = p_proposal_id;
$$;
