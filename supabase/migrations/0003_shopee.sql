-- OfficeVerse Phase 3 — Shopee integration
-- Run once after 0002. Adds what the Shopee sync needs; nothing existing is removed.

-- integrations: one row per connected shop, tokens encrypted server-side
alter table public.integrations add column if not exists shop_name text;
alter table public.integrations add column if not exists token_expires_at timestamptz;
alter table public.integrations add column if not exists expires_at timestamptz;      -- seller's authorization expiry
alter table public.integrations add column if not exists last_sync_summary jsonb;
create unique index if not exists integrations_ws_provider_shop on public.integrations (workspace_id, provider, shop_id);

-- members may see connection status (never credentials)
drop view if exists public.integration_status;
create view public.integration_status as
  select id, workspace_id, company_id, provider, status, shop_id, shop_name, last_success_at, last_error, expires_at, created_at
  from public.integrations
  where public.is_member(workspace_id);
grant select on public.integration_status to authenticated;

-- orders: fields used for reporting (no buyer personal data is stored)
alter table public.marketplace_orders add column if not exists pay_time timestamptz;
alter table public.marketplace_orders add column if not exists updated_at timestamptz;
alter table public.marketplace_orders add column if not exists items jsonb;
create index if not exists marketplace_orders_ws_time on public.marketplace_orders (workspace_id, ordered_at desc);
create index if not exists marketplace_orders_ws_status on public.marketplace_orders (workspace_id, platform, status);

-- advertising credit snapshots
create table if not exists public.ad_balance_snapshots (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform     text not null check (platform in ('shopee','lazada','tiktok')),
  shop_id      text,
  balance      numeric(12,2) not null,
  captured_at  timestamptz not null default now()
);
create index if not exists ad_balance_ws_time on public.ad_balance_snapshots (workspace_id, platform, captured_at desc);
alter table public.ad_balance_snapshots enable row level security;
drop policy if exists ad_balance_read on public.ad_balance_snapshots;
create policy ad_balance_read on public.ad_balance_snapshots for select using (public.is_member(workspace_id));
