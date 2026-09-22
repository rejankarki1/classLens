begin;

-- Session G: durable, server-created inbox events. Replaces the low-contrast,
-- repeat-on-every-load "completion card" on Home with one row per notable
-- state transition. The three event types mirror the three notable
-- processing_jobs outcomes named in the plan's data model (§4): 'ready'
-- (completed/filed), 'course_needed', and 'final_failure' (terminal_failed).
-- retryable_failed is intentionally not an inbox event -- it is transient
-- (auto-recoverable via retry or the recovery schedule), not a durable
-- outcome; Home still surfaces it directly from processing_jobs.
create table public.inbox_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  processing_job_id uuid not null references public.processing_jobs(id) on delete cascade,
  event_type text not null check (event_type in ('ready', 'course_needed', 'final_failure')),
  created_at timestamptz not null default now(),
  -- Each of the three transitions happens at most once per job (all three are
  -- terminal or single-entry states in the processing_jobs state machine), so
  -- this also guards against a duplicate row if a trigger ever fires twice.
  unique (processing_job_id, event_type)
);

create index inbox_events_owner_created_idx on public.inbox_events (owner_id, created_at desc);

alter table public.inbox_events enable row level security;
revoke all privileges on table public.inbox_events from public, anon, authenticated;

-- Recipient-only reads; server-only creation (§4). No insert/update/delete
-- grant exists for authenticated at all -- only the security-definer trigger
-- below can write, regardless of which role performed the processing_jobs
-- update that triggered it (worker service-role, or the phone's own
-- owner-scoped write when a retry exhausts and lands on terminal_failed).
grant select on table public.inbox_events to authenticated;

create policy "Users read their own inbox events"
  on public.inbox_events for select to authenticated
  using (owner_id = auth.uid());

-- Fires regardless of caller: the worker's Edge Function REST PATCH calls and
-- SQL functions land here the same as the phone's own owner-scoped retry-
-- exhaustion write (processingJobs.ts's retryProcessingJob), so a single
-- trigger is the only place that reliably sees every path into these three
-- stages -- covering the same ground more robustly than patching each
-- already-deployed write site individually.
create or replace function public.emit_inbox_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = old.stage then
    return new;
  end if;
  if new.stage = 'completed' then
    insert into public.inbox_events (owner_id, processing_job_id, event_type)
    values (new.owner_id, new.id, 'ready')
    on conflict (processing_job_id, event_type) do nothing;
  elsif new.stage = 'course_needed' then
    insert into public.inbox_events (owner_id, processing_job_id, event_type)
    values (new.owner_id, new.id, 'course_needed')
    on conflict (processing_job_id, event_type) do nothing;
  elsif new.stage = 'terminal_failed' then
    insert into public.inbox_events (owner_id, processing_job_id, event_type)
    values (new.owner_id, new.id, 'final_failure')
    on conflict (processing_job_id, event_type) do nothing;
  end if;
  return new;
end;
$$;

create trigger emit_inbox_event_after_update
after update on public.processing_jobs
for each row execute function public.emit_inbox_event();

commit;
