-- RLS policies for trips and trip_members were defined earlier but RLS was
-- never actually enabled on the tables, so the policies were never enforced.
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
