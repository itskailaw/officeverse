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
- 22 AI employees plus your CEO avatar. They walk on an A*-pathfound navigation grid with collision against walls and furniture, sit at their own desks, take lounge breaks and recover if stuck.
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

## Phase 2 — AI employees

- **Chat** with any employee (Profile panel → Chat). Each answers in role, with their personality and data permissions.
- **Tasks run for real:** assign a task (optionally attach PDF, Word, Excel, CSV, text or image files). The employee goes to their desk, types while working, and saves a Markdown report. Statuses: Working → Task Completed / Waiting for Approval / Waiting for Data / Error.
- **Approval inbox:** customer messages, payments, ad or listing changes and deletions are only ever *drafted*, then wait in Dashboard → Approvals (the employee walks to your office to tell you, outside quiet hours).
- **Meetings:** "Ask someone" puts a question to an attendee and records the answer; action items start automatically.
- **Honest data:** business tools return live data only from integrations (Phase 3); otherwise clearly labelled DEMO data, or "unavailable". Uploaded files are treated as data, never as instructions.
- **Safety & cost:** AI calls are server-side only (`/api/ai/task`, `/api/ai/chat`), require sign-in when Supabase is configured, are rate-limited and validated, and capped by each employee's token budget. Model per employee: Claude Opus 5.5 (default), Sonnet 5.5 or Haiku 5.5. Settings → Data shows a usage/cost estimate.

Setup: add `AI_API_KEY` (your Anthropic key) as a **Secret** environment variable in Vercel, and run `supabase/migrations/0002_ai_employees.sql` in the Supabase SQL Editor.

## Scripts

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build / serve |
| `npm run typecheck` | TypeScript |
| `npm test` | navigation & simulation tests (Node test runner) |
