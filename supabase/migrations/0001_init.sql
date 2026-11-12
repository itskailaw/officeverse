-- OfficeVerse — initial schema (Phase 1, with tables reserved for Phases 2–3)
-- Every business row belongs to a workspace; RLS restricts access to members.
-- Entity ids are text (client-generated) and unique per workspace.

create extension if not exists pgcrypto;

-- ───────────────────────────── tenancy ─────────────────────────────
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  timezone    text not null default 'Asia/Kuala_Lumpur',
  currency    text not null default 'MYR',
  created_at  timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'manager', 'viewer');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- owner becomes a member automatically
create function public.add_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger trg_workspace_owner after insert on public.workspaces
  for each row execute function public.add_owner_membership();

create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create function public.has_role(ws uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- ───────────────────────────── organisation ─────────────────────────────
create table public.companies (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  color        text not null default '#1e3a5f',
  logo_url     text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.departments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  company_id   text,               -- null = shared service department
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, company_id) references public.companies(workspace_id, id) on delete cascade
);

create table public.employees (
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  id                 text not null,
  name               text not null check (char_length(name) between 1 and 80),
  gender             text not null default 'unspecified',
  appearance         jsonb not null,
  department_id      text not null,
  company_id         text,
  title              text not null,
  personality        text not null default '',
  responsibilities   text[] not null default '{}',
  workstation_id     text,
  working_hours      jsonb not null default '{"start":"09:00","end":"18:00","days":[1,2,3,4,5]}',
  ai                 jsonb not null default '{}',     -- provider/model only; never credentials
  permissions        text[] not null default '{}',
  reporting_schedule text not null default '',
  status             text not null default 'available'
                     check (status in ('available','working','waiting_data','waiting_approval','in_meeting','task_completed','error')),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, department_id) references public.departments(workspace_id, id)
);
create unique index employees_unique_workstation on public.employees (workspace_id, workstation_id)
  where active and workstation_id is not null;

-- ───────────────────────────── work ─────────────────────────────
create table public.tasks (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  employee_id  text not null,
  company_id   text,
  title        text not null check (char_length(title) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  status       text not null default 'queued'
               check (status in ('queued','validating','running','waiting_data','waiting_approval','completed','failed','cancelled')),
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  source       text not null default 'ceo' check (source in ('ceo','meeting','schedule')),
  meeting_id   text,
  result       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, employee_id) references public.employees(workspace_id, id) on delete cascade
);
create index tasks_status_idx on public.tasks (workspace_id, status);

-- Phase 2: every state transition of a task, written by the server-side runner
create table public.task_events (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      text not null,
  from_status  text,
  to_status    text not null,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

-- Phase 2: sensitive actions wait here for CEO approval
create table public.approvals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      text,
  employee_id  text,
  kind         text not null check (kind in ('payment','ad_campaign','product_update','customer_message','record_deletion','other')),
  summary      text not null,
  payload      jsonb not null default '{}',
  status       text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.meetings (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  id            text not null,
  topic         text not null check (char_length(topic) between 1 and 200),
  attendee_ids  text[] not null default '{}',
  status        text not null default 'scheduled' check (status in ('scheduled','in_progress','ended')),
  scheduled_for timestamptz,
  started_at    timestamptz,
  ended_at      timestamptz,
  items         jsonb not null default '[]',   -- notes / decisions / action items
  summary       text,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.notifications (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  priority     text not null check (priority in ('critical','important','info')),
  title        text not null,
  body         text not null default '',
  employee_id  text,
  company_id   text,
  demo         boolean not null default false,
  read         boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.activity_log (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  employee_id  text,
  text         text not null,
  at           timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.audit_logs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  actor        text not null,
  action       text not null,
  entity       text not null,
  entity_id    text,
  detail       text,
  at           timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- office layout + customisation (one row per workspace)
create table public.office_layouts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  furniture    jsonb not null,
  settings     jsonb not null,
  updated_at   timestamptz not null default now()
);

-- Phase 4: chat transcripts with AI employees
create table public.chat_messages (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id  text not null,
  role         text not null check (role in ('ceo','employee','system')),
  content      text not null check (char_length(content) <= 20000),
  task_id      text,
  created_at   timestamptz not null default now()
);

-- uploaded files (bytes live in Supabase Storage bucket "workspace-files")
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes <= 26214400),
  assigned_to  text,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ───────────────────────────── integrations (Phase 3) ─────────────────────────────
create table public.integrations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  company_id       text,
  provider         text not null check (provider in ('shopee','lazada','tiktok','ontime','csv_import')),
  status           text not null default 'disconnected' check (status in ('disconnected','connected','error','expired')),
  shop_id          text,
  -- encrypted server-side with INTEGRATION_ENCRYPTION_KEY; never readable by clients
  credentials_enc  bytea,
  last_success_at  timestamptz,
  last_error       text,
  created_at       timestamptz not null default now()
);

create table public.sync_runs (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete cascade,
  source        text not null check (source in ('api','manual_upload')),
  status        text not null check (status in ('running','succeeded','failed')),
  records_in    int not null default 0,
  records_new   int not null default 0,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- marketplace orders: (platform, external_order_id) dedupes API + CSV imports
create table public.marketplace_orders (
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  company_id        text not null,
  platform          text not null check (platform in ('shopee','lazada','tiktok')),
  external_order_id text not null,
  status            text not null,
  gross_amount      numeric(12,2) not null,
  currency          text not null default 'MYR',
  ship_by           timestamptz,
  ordered_at        timestamptz not null,
  source            text not null check (source in ('api','manual_upload')),
  sync_run_id       bigint references public.sync_runs(id),
  raw               jsonb,
  primary key (workspace_id, platform, external_order_id)
);

-- ───────────────────────────── row level security ─────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy ws_select on public.workspaces for select using (public.is_member(id));
create policy ws_insert on public.workspaces for insert with check (owner_id = auth.uid());
create policy ws_update on public.workspaces for update using (public.has_role(id, array['owner','admin']::public.member_role[]));
create policy ws_delete on public.workspaces for delete using (owner_id = auth.uid());

create policy wm_select on public.workspace_members for select using (public.is_member(workspace_id));
create policy wm_manage on public.workspace_members for all
  using (public.has_role(workspace_id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(workspace_id, array['owner','admin']::public.member_role[]));

-- Generic member policies: members read; owner/admin/manager write.
do $$
declare t text;
begin
  foreach t in array array['companies','departments','employees','tasks','meetings','notifications',
                           'activity_log','office_layouts','chat_messages','files','task_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(workspace_id))', t || '_read', t);
    execute format($p$create policy %I on public.%I for insert with check (public.has_role(workspace_id, array['owner','admin','manager']::public.member_role[]))$p$, t || '_ins', t);
    execute format($p$create policy %I on public.%I for update using (public.has_role(workspace_id, array['owner','admin','manager']::public.member_role[]))$p$, t || '_upd', t);
    execute format($p$create policy %I on public.%I for delete using (public.has_role(workspace_id, array['owner','admin']::public.member_role[]))$p$, t || '_del', t);
  end loop;
end $$;

-- Audit logs: append-only for members, never updated or deleted from clients.
alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select using (public.is_member(workspace_id));
create policy audit_ins on public.audit_logs for insert with check (public.is_member(workspace_id));

-- Approvals: readable by members; decisions only by owner/admin. Created by the server (service role).
alter table public.approvals enable row level security;
create policy appr_read on public.approvals for select using (public.is_member(workspace_id));
create policy appr_decide on public.approvals for update using (public.has_role(workspace_id, array['owner','admin']::public.member_role[]));

-- Integrations & sync data: credentials column is never exposed — clients use the view below.
alter table public.integrations enable row level security;
alter table public.sync_runs enable row level security;
alter table public.marketplace_orders enable row level security;
create policy sync_read on public.sync_runs for select using (public.is_member(workspace_id));
create policy orders_read on public.marketplace_orders for select using (public.is_member(workspace_id));
-- (no client policies on integrations: only the service role touches it)

-- Owner-rights view: exposes connection status (never credentials) to workspace members only.
create view public.integration_status as
  select id, workspace_id, company_id, provider, status, shop_id, last_success_at, last_error, created_at
  from public.integrations
  where public.is_member(workspace_id);
revoke all on public.integrations from anon, authenticated;
grant select on public.integration_status to authenticated;

-- Realtime for live notifications and task status
alter publication supabase_realtime add table public.notifications, public.tasks;

-- Storage bucket for uploads (private; access through signed URLs)
insert into storage.buckets (id, name, public) values ('workspace-files', 'workspace-files', false)
  on conflict (id) do nothing;
create policy files_rw on storage.objects for all
  using (bucket_id = 'workspace-files' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'workspace-files' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager']::public.member_role[]));
