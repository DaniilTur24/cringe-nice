-- Let an authenticated invite recipient resolve a trip link before they are a
-- member. Direct SELECT on trips stays protected by RLS; this function exposes
-- only the status needed to decide whether the invite can be joined.

create or replace function public.get_trip_invite_status(p_trip_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status
  from public.trips
  where id = p_trip_id;
$$;

revoke execute on function public.get_trip_invite_status(uuid) from public, anon;
grant execute on function public.get_trip_invite_status(uuid) to authenticated;
