-- Безопасный тест: всё происходит в одной транзакции и откатывается в конце
-- (rollback) — реальные данные не меняются. Используются 4 любых
-- существующих profiles, временно привязанных к тестовому trip.
begin;

do $$
declare
  ids uuid[];
  v_trip_id uuid;
  v_creator uuid; v_target uuid; v_judge uuid; v_voter2 uuid;
  v_proposal_id uuid;
  v_before int; v_after int;
  v_status text;
begin
  select array_agg(id) into ids from (select id from public.profiles limit 4) s;
  if array_length(ids, 1) < 4 then
    raise exception 'Нужно хотя бы 4 профиля в БД для теста, найдено %', coalesce(array_length(ids,1), 0);
  end if;

  v_creator := ids[1]; v_target := ids[2]; v_judge := ids[3]; v_voter2 := ids[4];

  insert into public.trips (name, admin_id)
  values ('TEST_judge_charge', v_creator)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role_metadata) values
    (v_trip_id, v_creator, '{}'::jsonb),
    (v_trip_id, v_target,  '{}'::jsonb),
    (v_trip_id, v_judge,   '{"role":"judge","super_verdict_remaining":1}'::jsonb),
    (v_trip_id, v_voter2,  '{}'::jsonb);

  insert into public.proposals (trip_id, creator_id, target_id, type, description, creator_role)
  values (v_trip_id, v_creator, v_target, 'fine', 'TEST', 'civilian')
  returning id into v_proposal_id;

  select (role_metadata ->> 'super_verdict_remaining')::int into v_before
  from public.trip_members where trip_id = v_trip_id and user_id = v_judge;

  -- voter2 голосует 0, судья голосует с зарядом (|score| > 10) — половина
  -- нулей (1 из 2) должна отклонить иск несмотря на голос судьи.
  insert into public.votes (proposal_id, voter_id, score) values (v_proposal_id, v_voter2, 0);
  insert into public.votes (proposal_id, voter_id, score) values (v_proposal_id, v_judge, -15);

  select status into v_status from public.proposals where id = v_proposal_id;
  select (role_metadata ->> 'super_verdict_remaining')::int into v_after
  from public.trip_members where trip_id = v_trip_id and user_id = v_judge;

  raise notice 'proposal status = %', v_status;
  raise notice 'judge super_verdict_remaining: before=% after=%', v_before, v_after;

  if v_status <> 'rejected' then
    raise exception 'FAIL: ожидался status=rejected, получено %', v_status;
  elsif v_before <> v_after then
    raise exception 'FAIL: заряд изменился (% -> %) хотя иск был отклонён', v_before, v_after;
  else
    raise notice 'OK: иск отклонён, заряд судьи не тронут (% -> %)', v_before, v_after;
  end if;
end $$;

rollback;
