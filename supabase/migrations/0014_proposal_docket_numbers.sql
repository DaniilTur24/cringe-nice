-- Stable per-trip numbering for fines and rewards.
-- fine   -> "Уголовное дело №N"
-- reward -> "Акт святости №N"

alter table public.proposals add column if not exists docket_number integer;

with numbered as (
  select
    id,
    row_number() over (partition by trip_id, type order by created_at, id)::integer as docket_number
  from public.proposals
)
update public.proposals p
set docket_number = numbered.docket_number
from numbered
where p.id = numbered.id
  and p.docket_number is null;

alter table public.proposals
  alter column docket_number set not null;

create unique index if not exists proposals_trip_type_docket_number_key
  on public.proposals (trip_id, type, docket_number);

create or replace function public.handle_new_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_metadata jsonb;
  v_creator_role     text;
begin
  select role_metadata into v_creator_metadata
  from public.trip_members
  where trip_id = new.trip_id and user_id = new.creator_id;

  v_creator_role := coalesce(v_creator_metadata ->> 'role', 'civilian');
  new.creator_role := v_creator_role;

  if new.docket_number is null then
    select coalesce(max(docket_number), 0) + 1
    into new.docket_number
    from public.proposals
    where trip_id = new.trip_id and type = new.type;
  end if;

  return new;
end;
$$;
