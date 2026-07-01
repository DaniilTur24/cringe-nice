-- Fix "Function Search Path Mutable" on lock_protected_profile_fields.
create or replace function public.lock_protected_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.internal_update', true), 'false') = 'true' then
    return new;
  end if;

  if new.current_role is distinct from old.current_role then
    raise exception 'current_role изменяется только системой';
  end if;

  return new;
end;
$$;

-- Revoke execute from the anon (public) role on every security-definer
-- function. Unauthenticated callers have no business calling any of these.
revoke execute on function public.assign_trip_role(uuid, uuid, text, boolean)  from public;
revoke execute on function public.close_proposal_if_complete()                  from public;
revoke execute on function public.detective_reveal(uuid, text)                  from public;
revoke execute on function public.get_vote_counts(uuid)                         from public;
revoke execute on function public.handle_new_proposal()                         from public;
revoke execute on function public.is_trip_member(uuid, uuid)                   from public;
revoke execute on function public.lock_protected_profile_fields()               from public;
revoke execute on function public.reject_pending_proposals_on_trip_close()      from public;
revoke execute on function public.request_ai_verdict_generation()               from public;
revoke execute on function public.validate_vote()                               from public;

-- Trigger functions are invoked by the DB engine, never by users directly.
-- Revoke execute from authenticated too so they can't be called as RPCs.
revoke execute on function public.close_proposal_if_complete()              from authenticated;
revoke execute on function public.handle_new_proposal()                     from authenticated;
revoke execute on function public.lock_protected_profile_fields()           from authenticated;
revoke execute on function public.reject_pending_proposals_on_trip_close()  from authenticated;
revoke execute on function public.request_ai_verdict_generation()           from authenticated;
revoke execute on function public.validate_vote()                           from authenticated;

-- RPC functions still need to be callable by signed-in users.
grant execute on function public.assign_trip_role(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.detective_reveal(uuid, text)                 to authenticated;
grant execute on function public.get_vote_counts(uuid)                        to authenticated;
grant execute on function public.is_trip_member(uuid, uuid)                  to authenticated;
