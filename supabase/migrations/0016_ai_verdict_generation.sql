-- AI-generated flavor text for closed proposals.
-- The Edge Function writes the generated text here; game logic never depends on it.

alter table public.proposals add column if not exists ai_verdict text;

create or replace function public.request_ai_verdict_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_function_url text;
  v_function_key text;
begin
  if old.status = 'pending'
     and new.status in ('approved', 'rejected')
     and new.ai_verdict is null then
    -- Optional DB-side automation. Configure these in Postgres if you want the
    -- database to invoke the Edge Function directly:
    --   alter database postgres set app.settings.generate_verdict_url = 'https://<project>.functions.supabase.co/generate-verdict';
    --   alter database postgres set app.settings.generate_verdict_key = '<service-role-or-internal-function-key>';
    v_function_url := current_setting('app.settings.generate_verdict_url', true);
    v_function_key := current_setting('app.settings.generate_verdict_key', true);

    if coalesce(v_function_url, '') <> '' and coalesce(v_function_key, '') <> '' then
      perform net.http_post(
        url := v_function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_function_key
        ),
        body := jsonb_build_object('proposal_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_proposal_ai_verdict_request on public.proposals;
create trigger on_proposal_ai_verdict_request
  after update of status on public.proposals
  for each row
  when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function public.request_ai_verdict_generation();
