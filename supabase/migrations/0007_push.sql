-- OfficeVerse 0007: phone / desktop push notifications. Safe to run more than once.
-- Server-only tables (no policies: only the server's service role can read or write them).
create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid,
  keys          jsonb not null,             -- { p256dh, auth }
  device        text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists push_subscriptions_ws on public.push_subscriptions (workspace_id);
alter table public.push_subscriptions enable row level security;

-- app-wide secrets the server generates itself (e.g. the push signing key), stored encrypted
create table if not exists public.app_secrets (
  name        text primary key,
  value_enc   text not null,
  created_at  timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
