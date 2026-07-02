-- Avoid RLS recursion when PostgREST embeds trips from trip_members.
-- trips_select_members used to query public.trip_members directly, while
-- trip_members_select_members can also reference public.trips. Selecting
-- trip_members with trips(...) may therefore recurse through both policies.
-- Use the SECURITY DEFINER membership helper instead.

drop policy if exists "trips_select_members" on public.trips;

create policy "trips_select_members"
  on public.trips for select
  to authenticated
  using (
    admin_id = auth.uid()
    or public.is_trip_member(id, auth.uid())
  );
