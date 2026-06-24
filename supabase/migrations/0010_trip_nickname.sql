-- Запусти в Supabase SQL Editor (или через psql "$SUPABASE_DB_URL").
--
-- До сих пор имя/аватар при создании или входе в поездку писались прямо в
-- profiles, то есть глобально перезатирали профиль пользователя на всех его
-- поездках сразу. Теперь profiles.username — официальное имя профиля,
-- задаётся один раз при регистрации, а trip_members.nickname/avatar_url —
-- необязательный per-trip override (можно вписать что угодно несерьёзное в
-- конкретной поездке без изменения официального имени). NULL = используем
-- profiles.username/avatar_url как есть.

alter table public.trip_members
  add column nickname   text,
  add column avatar_url text;
