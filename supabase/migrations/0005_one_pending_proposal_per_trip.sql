-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- Пока одно предложение (иск/награда) в поездке ещё pending, второе никому
-- отправить нельзя — это теперь гарантирует сама база, а не только фронтенд:
-- partial unique index ловит и гонку из двух одновременных INSERT.

create unique index proposals_one_pending_per_trip
  on public.proposals (trip_id)
  where status = 'pending';
