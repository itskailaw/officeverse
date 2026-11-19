# OfficeVerse — Architecture & Plan

_Your Business. Your People. Your Universe._

This document covers the eight planning items requested before implementation. Phase 1 is implemented in this repository; later phases are designed here so they slot in without rebuilding.

---

## 1. System architecture

```
┌──────────────────────────── Browser (Next.js client) ────────────────────────────┐
│  3D Office (React Three Fiber + Drei)      HUD (React + Tailwind + shadcn/ui)    │
│   ├─ Building / Furniture / Characters      ├─ Executive Dashboard (Recharts)    │
│   ├─ CameraRig (iso ortho, orbit, keys)     ├─ Employee panel, Meeting panel     │
│   └─ reads agent transforms every frame     └─ Settings, Hire/Edit, Companies    │
│                    ▲                                     │                       │
│        OfficeSim (pure TS: nav grid, A*, seats, doors,   │ actions               │
│        breaks, meetings, pick-up/drop, stuck recovery)   ▼                       │
│                    ▲──── useSimBridge ──── Zustand store (persisted)             │
│                                                 │  diff-based sync (lib/data/sync)│
└─────────────────────────────────────────────────┼────────────────────────────────┘
                                                  ▼
           Supabase: Postgres (RLS per workspace) · Auth · Storage · Realtime
                                                  ▲
┌──────────────── Server (Next.js route handlers / Vercel functions) ──────────────┐
│ /api/health (P1) · /api/tasks/run (P2) · /api/ai/chat (P2) · /api/integrations/* │
│ (P3) · cron: briefings & proactive checks (P4). Holds AI + marketplace secrets,  │
│ decrypts integration credentials, writes task_events / approvals / notifications │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Key decisions:

- **Simulation is outside React.** `lib/office/sim.ts` is plain TypeScript with no DOM or three.js dependency. It is unit-tested in Node and could move to a Web Worker. React components only read agent transforms inside `useFrame`, so 20+ animated avatars don't cause re-renders.
- **Local-first state.** The Zustand store is the UI's source of truth and is persisted to `localStorage`. When Supabase is configured and the user is signed in, `startSync` loads the workspace, then diffs each collection by reference and upserts or deletes changed rows in the background. Realtime merges server-written tasks and notifications back in. Without Supabase the app runs fully in local mode.
- **Secrets only on the server.** The browser holds only the Supabase anon key (RLS-enforced). AI keys, the service-role key and the integration encryption key are server env vars (`.env.example`). `/api/health` reports *whether* each one is configured, never its value.
- **Honesty by construction.** Demo data comes only from `lib/data/demo.ts`, is gated by `settings.demoMode`, and every surface showing it carries a DEMO label. With demo mode off, every business metric renders "Data Unavailable · last sync: never". Employee status changes only for things that really happen (meetings now; task execution in Phase 2). Typing animation is tied to the `working` status.

## 2. Database schema

See `supabase/migrations/0001_init.sql`. Summary:

| Table | Purpose | Phase |
|---|---|---|
| `workspaces`, `workspace_members` (role: owner/admin/manager/viewer) | tenancy + RBAC | 1 |
| `companies`, `departments` (company_id null = shared service) | organisation | 1 |
| `employees` (appearance, ai, permissions, working_hours jsonb; unique active workstation) | AI staff | 1 |
| `tasks` (+ `task_events` state log) | delegated work, persistent | 1 / 2 |
| `approvals` (payment, ad_campaign, product_update, customer_message, record_deletion) | approval workflow | 2 |
| `meetings` (attendees, items jsonb, summary) | meeting room | 1 |
| `notifications` (critical/important/info, demo flag), `activity_log`, `audit_logs` (append-only) | feeds & audit | 1 |
| `office_layouts` (furniture + settings jsonb) | customisation | 1 |
| `chat_messages`, `files` (+ private Storage bucket `workspace-files`) | chat, uploads | 2 / 4 |
| `integrations` (encrypted `credentials_enc`, no client access) + `integration_status` view | marketplace connections | 3 |
| `sync_runs`, `marketplace_orders` (PK = workspace, platform, external_order_id) | sync history, de-duplicated orders | 3 |

RLS: members can read their workspace. Owner, admin and manager can write. Only owner and admin can delete. Audit logs are insert-only. Integration credentials are never selectable by clients.

## 3. Folder structure

```
app/
  layout.tsx, globals.css, page.tsx (→ /office)
  office/page.tsx          3D office + HUD
  login/page.tsx           Supabase Auth (or local-mode entry)
  api/health/route.ts      capability report (no secrets)
components/
  OfficeApp.tsx            boot, auth gate, sync, mobile/WebGL fallback, HUD composition
  office/                  OfficeScene, Building, Furniture, Character, screens, materials
  hud/                     Chrome (top bar, toolbar, camera, toasts, build panel), EmployeePanel,
                           ExecutiveDashboard, CompaniesManager, TeamTable, EmployeeEditor,
                           Meeting, SettingsDialog, MobileDashboard, Avatar
  ui/                      shadcn-style primitives (button, badge, card, dialog, tabs, input, switch)
lib/
  data/                    types, seed (companies/departments/22 employees), demo (labelled samples), sync
  office/                  layout (floor plan), catalog (furniture footprints & seats), navgrid (A*),
                           sim (agents), runtime (singleton), useSimBridge
  store/                   office-store (persisted business state), ui-store (transient UI)
  supabase/                browser + server clients
supabase/migrations/       SQL schema + RLS
tests/                     node:test suites for nav grid and simulation
```

## 4. 3D office layout plan

52 m × 30 m (floor plan v3: CEO suite, boardroom, open work floor for WGS · Finance · Marketing, Main Street, Kopitiam pantry, game room, Artides & Amare glass studios, IT Lab, library nook, garden), metres, x east and z south. An orthographic isometric camera looks from the south-east.

```
z 0 ┌──────────┬───────────────┬────────────┬───────────────┐
    │ CEO      │ Water Guardian│ Finance &  │ Marketing &   │
    │ Office   │ (6 desks,     │ Strategy   │ Creative      │
    │          │ packing, shelf│ (4 desks)  │ (4 desks, set)│
z10 ├──door────┴────door───────┴───door─────┴────door───────┤
    │                      main corridor                    │
z13 ├─arch─────┬──door───┬arch──┬──door───┬─door─┬──door───┤
    │Reception │ Meeting │Lounge│ Artides │Amare │ IT &    │
    │(EA desk) │ (10     │      │ Home    │(2)   │ Server  │
    │          │  seats) │      │ (4)     │      │ (racks) │
z23 └──entrance┴─────────┴──────┴─────────┴──────┴─────────┘
```

- Every room opens onto the corridor through a 1.6 m automatic sliding door, or an archway for the reception, pantry and game room. Saved furniture from an older floor plan is replaced on load (`LAYOUT_VERSION`); desk ids are kept so everyone keeps their seat.
- Desks come in facing pods with chairs on the walkable side. The meeting table has 4 + 4 side seats plus two ends; the east end is reserved for the CEO.
- Furniture is data (`lib/office/layout.ts`). Each type in `catalog.ts` declares its footprint, whether it blocks movement, and its seats. Every seat has an *approach point*: agents path-find there, then glide into the seat.
- Wall modes: walls up (2.7 m), cut-away (1.05 m, default), walls down. Lighting: day, evening, night (room lamps) and auto (by MYT clock).

## 5. Movement & interaction design

- **Navigation grid**: 0.5 m cells. A cell is blocked if it is within 0.32 m of a wall segment (door gaps are carved out of walls) or inside a blocking furniture footprint grown by 0.18 m. It is rebuilt whenever the layout changes.
- **Pathfinding**: 8-way A* with octile heuristic and no corner cutting, then string-pulling with a *thick* line-of-sight check (centre + ±0.14 m), so paths are smooth without grazing corners.
- **Agents**: pose (stand/walk/sit/held), intent (desk/meeting/break/free/visit/summoned), seat reservation, heading smoothing, fixed 50 ms substeps so speed is frame-rate independent.
- **Doors**: open when a walking agent comes within 2.3 m. Agents wait if the door is less than 75% open, so nobody walks through closed glass.
- **Stuck recovery**: if an agent moves less than 0.2 m in 2.5 s it snaps to the nearest walkable cell and re-paths. Agents dropped inside furniture also snap out.
- **Life**: seated employees with no work occasionally take 25–50 s breaks at lounge or play spots in the break rooms (`BREAK_ROOMS`), then return to their desks.
- **Meetings**: attendees reserve meeting seats and walk over. The panel shows live "n/m seated". Ending the meeting saves a summary (decisions, action items → tasks, notes) and sends everyone back to their desks.
- **CEO**: click the floor to walk. Click your desk or the performance screen to sit down and open the dashboard. "Visit" walks to an employee and both switch to talking gestures. "Summon" sends an employee to a visitor chair in your office.
- **Pick-up**: press and drag an employee. They lift and dangle while held. Drop them on a free workstation to reassign it (persisted), on any free seat to sit, or anywhere else to stand briefly and then walk home.
- **Build mode**: drag furniture on a 0.25 m snap, rotate with R, reset the layout. The nav grid rebuilds and walking agents re-path.

Verified by `tests/sim.test.ts`: every seat is reachable, no path crosses a wall, walking agents never stand on blocked cells, and full meeting round-trips work.

## 6. AI task execution architecture (Phase 2)

```
CEO assigns task ──► tasks(status=queued) ──► POST /api/tasks/run (server, auth-checked)
  1 validate   : employee.permissions ⊇ tools required? data source connected? → waiting_data
  2 plan       : LLM (server key) with employee role + personality + tool schemas
  3 execute    : read-only tools only (orders, ads, inventory, files…) scoped by RLS & permissions;
                 uploaded file text is passed as quoted DATA, never as instructions
  4 sensitive? : payment / campaign / listing / customer message / deletion → approvals row,
                 task.status = waiting_approval (nothing happens until CEO approves)
  5 save       : result + task_events + notification → Realtime → avatar status & bubble
```

- Employee status is derived from real task state: `running`/`validating` → Working (typing animation), `waiting_*` → the matching status, a completed task → Task Completed, failure → Error.
- Cost control: per-task `maxTokensPerTask`, model chosen per employee, per-workspace rate limiting on the run endpoint, and caching of tool results within a run.
- Chat uses the same server endpoint with `chat_messages` persistence. No scripted fake replies.

## 7. Marketplace integration strategy (Phase 3)

- Use the **official** Shopee Open Platform and Lazada Open Platform. Before writing each adapter, confirm the endpoint exists for Malaysian sellers and that the account's app permissions cover it (orders, logistics, products and ads APIs differ by region and partner tier). Ad balance in particular may be unavailable; the UI then shows "Data Unavailable".
- OAuth tokens are stored encrypted in `integrations.credentials_enc` (AES-GCM with `INTEGRATION_ENCRYPTION_KEY`). They are refreshed server-side and never sent to the browser or to LLM prompts.
- Scheduled sync jobs write `sync_runs`. Each report shows `last_success_at`.
- **CSV/Excel import** as a first-class fallback: rows land in the same tables with `source = 'manual_upload'` and are labelled "Manually uploaded" in the UI. `(platform, external_order_id)` is the primary key, so API and CSV imports can't double-count.
- Revenue reporting separates gross sales, net sales (after cancellations and refunds), payouts and estimated profit. All figures are in MYR and Asia/Kuala_Lumpur time.

## 8. Step-by-step implementation plan

**Phase 1 — Functional virtual office (this delivery)**
1. Domain types, seed roster (22 employees across 7 departments), floor plan, furniture catalog ✅
2. Nav grid + A* + smoothing, with tests ✅
3. Agent simulation: seats, doors, breaks, meetings, pick-up/drop, stuck recovery, with tests ✅
4. Procedural avatars with walk, sit, type, talk and carried animations; status badges; name tags ✅
5. Building: floors, walls (3 modes), glass partitions, sliding doors, exterior; lighting modes ✅
6. CEO office: exec desk, trophy cabinet, performance wall screen, photo frames with uploadable images ✅
7. HUD: top bar, toolbar, camera controls, notifications, toasts, help ✅
8. Employee panel: profile, responsibilities, permissions, quick actions, task queue, activity ✅
9. Executive dashboard: filters, demo-labelled KPIs/chart or "Data Unavailable", tasks, meetings, notifications, activity, audit ✅
10. Company and department CRUD with deletion guards; hire, edit and deactivate employees ✅
11. Meeting room flow with saved summaries and action items → tasks ✅
12. Settings: lighting, walls, colours, CEO avatar, quiet hours, briefing time, demo mode, reset, export ✅
13. Persistence: localStorage plus Supabase schema, RLS, auth, sync and realtime ✅
14. Mobile/WebGL-less dashboard fallback ✅

**Phase 2 ✅** — `/api/ai/task` and `/api/ai/chat` (Anthropic SDK, manual bounded tool loop, permission-scoped tools, server-side refusal fallback), approvals inbox, status derivation from task state, chat persistence, file analysis, meeting Q&A (migration `0002_ai_employees.sql`).
**Phase 3** — Integration center, Shopee/Lazada adapters, CSV/Excel importer with dedupe, ads monitor with thresholds, inventory tracking, sync history.
**Phase 4** — Vercel Cron briefings by the Executive Assistant, proactive alerts (employee walks to the CEO office for critical alerts, respecting quiet hours), stock forecasting, file workflows.
**Phase 5** — Artides/OnTime and Amare workflows, more employees, deeper customisation.
