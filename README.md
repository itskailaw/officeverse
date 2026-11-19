# OfficeVerse

**Your Business. Your People. Your Universe.**

OfficeVerse is a 3D virtual headquarters, inspired by life-simulation games, where you manage your companies through AI employees.
This repository contains **Phase 1: the functional virtual office**. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architecture, schema, layout, movement design, AI task pipeline, marketplace strategy and the phased plan.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Without any environment variables the app runs in **local mode**: all data lives in your browser, and business metrics appear only as clearly labelled **demo data**. You can turn demo mode off in Settings → Data & system.

### Enable accounts & cloud sync (Supabase)

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`, either in the SQL editor or with `supabase db push`.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the older `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Restart. `/office` now requires sign-in. On first sign-in your workspace is created and seeded, and every change after that syncs automatically under row-level security.

Deploy to Vercel as a standard Next.js app with the same env vars.

## What works in Phase 1

- Isometric 3D office: 11 areas, automatic sliding doors, glass partitions, three wall modes, and day, evening, night and auto (MYT) lighting.
- 22 AI employees plus your CEO avatar. They walk on an A*-pathfound navigation grid with collision against walls and furniture, sit at their own desks, take breaks in the Kopitiam pantry, library nook, game room (half-court, ping-pong, foosball, arcade) and garden, and recover if stuck.
- Click the floor to walk. Click an employee to open their profile and use **Visit**, **Summon**, **Break** or **To desk**. Press and drag an employee to pick them up; drop them on a free desk to reassign it.
- Click your desk for the **Executive Dashboard**: company and department filters, KPIs, revenue chart, tasks, meetings, notifications, activity and audit log.
- Tasks are persisted and queued. AI execution arrives in Phase 2, and nothing pretends to run before then.
- **Meetings**: pick attendees and they walk to the meeting table. Record notes, decisions and action items (which become tasks); ending the meeting saves a summary.
- Create, rename, deactivate or delete companies and departments. Hire, edit or deactivate employees.
- **Build mode**: drag and rotate furniture; employees re-route. Change wall, trim and floor colours, the CEO avatar and the photo frames. Everything persists and can be reset to default.
- Phones and browsers without WebGL get a simplified dashboard.
- **Visual upgrade:** ribbon windows that glow at night, department colour branding (floor bands, entrance mats, standees), lamps and pendants, a street with cars, a parking lot, lamp posts and hedges, and a sky gradient.
- **Livelier staff:** outfits (shirt, polo, blazer, hoodie, baju kurung, dress), new hairstyles, hands and faces, waves when clicked, nods in meetings, stretches and coffee on breaks, laptops in meetings, and honest activity bubbles. Avatars also grow slightly when you zoom out.
- **Interface:** dark mode (or match office lighting), company switcher with colours, a live floor-plan minimap, a "what needs you today" dashboard greeting, department-coloured employee cards, company logo upload, and a first-visit tour (the ? button replays it).

**Controls:** left-drag pans · right-drag rotates · scroll zooms · Q/E rotate 90° · WASD/arrows pan · R rotates furniture in build mode · Esc deselects.

### Profit, returns & Telegram (run `supabase/migrations/0005_profit_returns.sql` once)

- **Profit (month to date):** each sync stores per-order marketplace fees and the net payout (Shopee `payment.get_escrow_detail`, Lazada `/finance/transaction/details/get`). Enter unit costs under Dashboard → Profit → Product costs; estimated profit = net payout − product cost − tracked ad spend (Lazada).
- **Returns & refunds:** Shopee `returns.get_return_list` and Lazada `/reverse/getreverseordersforseller` sync with the orders; the dashboard lists open requests and Mei Ling can review them (read-only — decisions stay in Seller Centre).
- **Telegram alerts** after every sync: parcels due within 6 h, Shopee ads balance below RM 50, cancellation spikes (3/5/10 a day), new return requests. Each alert is sent once; non-urgent alerts wait out quiet hours (23:00–07:00).
- **Chat from Telegram:** any message goes to Sophia; "ask Daniel …" / "Priya, …" picks someone else. Replies use the same live data and permissions, and appear in the app's chat. `/approvals`, `/briefing`, `/team`, `/help`.
- **Approvals in Telegram:** new approval requests are posted with ✅ / ❌ buttons; a decision there updates the app live.

### Arrange shipment & print labels (owner only)

Dashboard → **To process** → *Arrange drop-off*: tick packed orders and confirm. Shopee uses `logistics.get_shipping_parameter` + `logistics.ship_order` (drop-off); Lazada `/order/fulfill/pack` (dropship) + `/order/package/rts`. **To ship** → *Print labels* opens the AWB PDF (Shopee `create/get_result/download_shipping_document`; Lazada package document / AWB). Labels are streamed from the marketplace and never stored. Every action is written to the audit log.

### Farid — Order Processing Executive

- **Auto-confirm (owner switch + hours, Dashboard → To process):** after every order update (instant push, manual sync, nightly cron) new paid orders are arranged for drop-off. Each order is tried once automatically; anything that fails (e.g. a courier needing extra details) is reported on Telegram and left for the CEO.
- **Buyer cancellation requests:** Shopee orders in `IN_CANCEL` become approvals (`cancel-shopee-<order_sn>`) with *Accept cancellation / Reject — ship it* in the app and on Telegram; the decision calls `order.handle_buyer_cancellation`. Lazada cancellation requests are alerted only (no API to answer them).

### Office extras

- Quick-jump camera buttons (Work · Fun · CEO) next to the camera controls.
- Neon signs (KOPI ☕, PLAY, CREATE) and garden fairy lights that glow at night.
- CEO suite "Mamba corner": sneaker wall, framed #8 / #24 jerseys, trophy & ring cabinet with a quote plaque, court-floor lounge, clickable mini hoop, aquarium. Click the displays to zoom in.
- Kobe Day (24 August, Malaysia time): purple & gold confetti, a banner, and the game-room neon reads "MAMBA FOREVER 8·24". Preview any day with `/office?kobeday=1`.

## Phase 2 — AI employees

- **Chat** with any employee (Profile panel → Chat). Each answers in role, with their personality and data permissions.
- **Tasks run for real:** assign a task (optionally attach PDF, Word, Excel, CSV, text or image files). The employee goes to their desk, types while working, and saves a Markdown report. Statuses: Working → Task Completed / Waiting for Approval / Waiting for Data / Error.
- **Approval inbox:** customer messages, payments, ad or listing changes and deletions are only ever *drafted*, then wait in Dashboard → Approvals (the employee walks to your office to tell you, outside quiet hours).
- **Meetings:** "Ask someone" puts a question to an attendee and records the answer; action items start automatically.
- **Honest data:** business tools return live data only from integrations (Phase 3); otherwise clearly labelled DEMO data, or "unavailable". Uploaded files are treated as data, never as instructions.
- **Safety & cost:** AI calls are server-side only (`/api/ai/task`, `/api/ai/chat`), require sign-in when Supabase is configured, are rate-limited and validated, and capped by each employee's token budget. Model per employee: Claude Opus 5.5 (default), Sonnet 5.5 or Haiku 5.5. Settings → Data shows a usage/cost estimate.

Setup: add `AI_API_KEY` (your Anthropic key) as a **Secret** environment variable in Vercel, and run `supabase/migrations/0002_ai_employees.sql` in the Supabase SQL Editor.

## Phase 3 — Shopee Malaysia (live)

Connect your Shopee shop through the official Shopee Open Platform (v2). OfficeVerse then syncs orders (incremental, in 15-day windows, de-duplicated by order number), parcels to pack and ship-by deadlines, revenue in MYR (Malaysia time) and the Shopee Ads credit balance. No buyer personal data is stored. Tokens are encrypted (AES-256-GCM) and only ever handled on the server.

Vercel environment variables (all **Secret**): `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`. Optional `SHOPEE_ENV=sandbox` for a test shop. Run `supabase/migrations/0003_shopee.sql`, then Settings → Integrations → **Connect Shopee shop**. In the Shopee Open Platform console set the app's Live Redirect URL Domain to your site's domain.

`npm run check:shopee` verifies request signing against a local mock.

### Lazada Malaysia (live)

Same model as Shopee: Settings → Integrations → **Connect Lazada store**. Vercel environment variables (Secret): `LAZADA_APP_KEY`, `LAZADA_APP_SECRET`. In the Lazada Open Platform console set the app's Callback URL to `https://<your-domain>/api/integrations/lazada/callback`. Orders sync incrementally (`/orders/get` by update time, items via `/orders/items/get`), de-duplicated by order number; the dashboard shows Shopee and Lazada side by side. `npm run check:lazada` verifies signing against a mock that re-implements Lazada's official SDK signature.

### Instant updates (push)

Both marketplaces can notify OfficeVerse the moment an order changes. Each push is signature-checked and only triggers an incremental sync from the official API (the push body itself is never trusted as data). Open dashboards refresh every 30 seconds.

- Lazada: App Console → **Push Mechanism** → Push URL `https://<your-domain>/api/integrations/lazada/push`, enable the Trade Order message, Verify.
- Shopee: Open Platform → App → **Push Mechanism** → Live Call Back URL `https://<your-domain>/api/integrations/shopee/push`, tick order status / tracking number pushes. Set `SHOPEE_PUSH_URL` if the signed URL differs from the deployed one.

### Telegram morning briefing

1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Vercel → Environment Variables (Secret): `TELEGRAM_BOT_TOKEN`, and `CRON_SECRET` (any long random text) if not set. Redeploy.
3. Supabase → SQL Editor: run `supabase/migrations/0004_telegram.sql`.
4. OfficeVerse → Settings → Integrations → Telegram → **Connect Telegram** → press **Start** in Telegram.

Sophia (Executive Assistant) sends the briefing — the figures come straight from the data, followed by 2–4 short AI notes on what stands out (skipped if the AI isn't configured). It covers (yesterday's sales per platform, orders to process/ship, urgent parcels, ads, best seller) is sent daily around 8:30am Malaysia time by Vercel Cron (`/api/cron/briefing`); **Send briefing now** sends it on demand. Linking uses a signed 30-minute `/start` code; the webhook checks Telegram's secret token header.

## Scripts

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build / serve |
| `npm run typecheck` | TypeScript |
| `npm test` | navigation & simulation tests (Node test runner) |
