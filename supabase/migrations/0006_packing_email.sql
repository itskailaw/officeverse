-- OfficeVerse 0006: daily packing-list email log (which orders were emailed, so each is sent once).
-- Safe to run more than once.
create table if not exists public.packing_emails (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  sent_at       timestamptz not null default now(),
  status        text not null check (status in ('sending','sent','empty','failed')),
  recipient     text,
  orders        jsonb not null default '[]'::jsonb,   -- [{ "platform": "shopee", "id": "2511..." }]
  error         text,
  manual        boolean not null default false
);
create index if not exists packing_emails_ws_time on public.packing_emails (workspace_id, sent_at desc);
alter table public.packing_emails enable row level security;
-- written by the server only; members may read the log
drop policy if exists packing_emails_read on public.packing_emails;
create policy packing_emails_read on public.packing_emails for select using (public.is_member(workspace_id));
