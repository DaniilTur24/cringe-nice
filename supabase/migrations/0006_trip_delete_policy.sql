-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Раньше у trips не было DELETE-политики вовсе, так что удалить поездку
-- никто не мог (RLS по умолчанию запрещает). Теперь её создатель может
-- удалить поездку навсегда, но только когда она уже закрыта
-- (finished/cancelled) — активную нужно сперва завершить или отменить.
-- trip_members/proposals/votes удаляются каскадом по FK на trips.id.
--
-- "Восстановить" поездку (вернуть status в 'active') отдельной политики не
-- требует — это обычный UPDATE, уже разрешённый существующей
-- trips_update_admin_only.

create policy "trips_delete_admin_closed_only"
  on public.trips for delete
  to authenticated
  using (admin_id = auth.uid() and status <> 'active');
