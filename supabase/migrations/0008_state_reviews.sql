-- OfficeVerse 0008: server-side memory for alerts (so phone notifications work without Telegram)
-- and the review watch. Safe to run more than once. Server-only tables (no policies).
create table if not exists public.workspace_state (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  key           text not null,
  value         jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, key)
);
alter table public.workspace_state enable row level security;

create table if not exists public.marketplace_reviews (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  platform      text not null check (platform in ('shopee','lazada')),
  review_id     text not null,
  item_id       text,
  item_name     text,
  rating        int not null,
  comment       text,
  buyer         text,
  created_at    timestamptz,
  reply         text,
  replied_at    timestamptz,
  draft         text,
  status        text not null default 'new' check (status in ('new','drafted','replied','ignored')),
  primary key (workspace_id, platform, review_id)
);
create index if not exists marketplace_reviews_ws_time on public.marketplace_reviews (workspace_id, created_at desc);
alter table public.marketplace_reviews enable row level security;
