-- OfficeVerse 0005: marketplace fees (real profit) and return / refund requests.
-- Safe to run more than once.

-- per-order fees and the net amount the marketplace pays out
alter table public.marketplace_orders add column if not exists fees jsonb;          -- { "Commission": -12.30, ... }
alter table public.marketplace_orders add column if not exists net_amount numeric(12,2);
alter table public.marketplace_orders add column if not exists fees_at timestamptz;

-- return / refund requests (no buyer personal data)
create table if not exists public.marketplace_returns (
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  platform          text not null check (platform in ('shopee','lazada','tiktok')),
  external_id       text not null,
  order_id          text,
  status            text not null,
  request_type      text,
  reason            text,
  refund_amount     numeric(12,2),
  items             jsonb,
  due_at            timestamptz,
  requested_at      timestamptz,
  updated_at        timestamptz,
  raw               jsonb,
  primary key (workspace_id, platform, external_id)
);
create index if not exists marketplace_returns_ws_time on public.marketplace_returns (workspace_id, requested_at desc);
alter table public.marketplace_returns enable row level security;
drop policy if exists marketplace_returns_read on public.marketplace_returns;
create policy marketplace_returns_read on public.marketplace_returns for select using (public.is_member(workspace_id));

-- Telegram replies and decisions show up live in the app
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
end $$;
