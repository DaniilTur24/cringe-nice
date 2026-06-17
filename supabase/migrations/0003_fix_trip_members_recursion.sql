-- Запусти в Supabase SQL Editor.
--
-- Баг: "trip_members_select_members" проверяла членство через подзапрос
-- SELECT ... FROM trip_members внутри RLS-политики ДЛЯ САМОЙ trip_members.
-- Postgres детектит это как бесконечную рекурсию и роняет любой SELECT из
-- trip_members с ошибкой "infinite recursion detected in policy for
-- relation trip_members" (PostgREST показывает это как 500).
--
-- Фикс: членство проверяется через SECURITY DEFINER функцию — она выполняется
-- с правами владельца функции и не подчиняется RLS, поэтому внутренний
-- SELECT из trip_members не вызывает повторное применение этой же политики.

create or replace function public.is_trip_member(p_trip_id uuid, p_user_id uuid)
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

drop policy if exists "trip_members_select_members" on public.trip_members;

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
