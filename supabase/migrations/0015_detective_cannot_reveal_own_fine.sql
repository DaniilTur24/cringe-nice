-- A Detective must not reveal the author of their own complaint.

create or replace function public.detective_reveal(
  p_proposal_id uuid,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal     record;
  v_detective    jsonb;
  v_remaining    integer;
  v_already_self boolean;
begin
  if p_scope not in ('self', 'all') then
    raise exception 'Некорректный scope разоблачения: %', p_scope;
  end if;

  select trip_id, creator_id, type, status, creator_role, creator_revealed_to_all
  into v_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if v_proposal is null then
    raise exception 'Предложение не найдено';
  end if;
  if v_proposal.creator_id = auth.uid() then
    raise exception 'Нельзя разоблачить автора своей жалобы';
  end if;
  if v_proposal.status = 'pending' then
    raise exception 'Нельзя разоблачить автора пока дело не закрыто';
  end if;
  if v_proposal.type <> 'fine' then
    raise exception 'Разоблачение применимо только к жалобам';
  end if;
  if v_proposal.creator_role = 'ghost' then
    raise exception 'Призрака нельзя разоблачить';
  end if;
  if v_proposal.creator_revealed_to_all then
    raise exception 'Автор уже публично известен';
  end if;

  select exists (
    select 1 from public.proposal_reveals
    where proposal_id = p_proposal_id and viewer_id = auth.uid()
  ) into v_already_self;

  if p_scope = 'all' then
    if not v_already_self then
      raise exception 'Сначала узнай автора только для себя';
    end if;
    update public.proposals set creator_revealed_to_all = true where id = p_proposal_id;
    return;
  end if;

  -- p_scope = 'self'
  if v_already_self then
    raise exception 'Ты уже узнал(а) автора';
  end if;

  select role_metadata into v_detective
  from public.trip_members
  where trip_id = v_proposal.trip_id and user_id = auth.uid()
  for update;

  if v_detective is null or (v_detective ->> 'role') <> 'detective' then
    raise exception 'Только Детектив может разоблачать авторов';
  end if;

  v_remaining := coalesce((v_detective ->> 'reveals_remaining')::integer, 0);
  if v_remaining <= 0 then
    raise exception 'Заряды разоблачения исчерпаны';
  end if;

  insert into public.proposal_reveals (proposal_id, viewer_id) values (p_proposal_id, auth.uid());

  update public.trip_members
  set role_metadata = jsonb_set(role_metadata, '{reveals_remaining}', to_jsonb(v_remaining - 1))
  where trip_id = v_proposal.trip_id and user_id = auth.uid();
end;
$$;
