-- OfficeVerse 0004: allow Telegram as an integration (morning briefing & alerts).
-- The linked chat id is stored in integrations.shop_id; no Telegram messages are stored.
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('shopee','lazada','tiktok','ontime','csv_import','telegram'));
