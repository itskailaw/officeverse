-- OfficeVerse Phase 2 — AI employees
-- Reshapes the placeholder approvals / chat tables to the app's sync format
-- (text ids unique per workspace) and adds AI fields to tasks.
-- Safe to run once after 0001_init.sql. Both tables were unused before Phase 2.

drop table if exists public.approvals cascade;
drop table if exists public.chat_messages cascade;

create table public.approvals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  task_id      text,
  employee_id  text not null,
  kind         text not null check (kind in ('payment','ad_campaign','product_update','customer_message','record_deletion','other')),
  summary      text not null check (char_length(summary) <= 500),
  draft        text not null check (char_length(draft) <= 8000),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  primary key (workspace_id, id)
);

create table public.chat_messages (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id           text not null,
  employee_id  text not null,
  role         text not null check (role in ('ceo','employee')),
  content      text not null check (char_length(content) <= 20000),
  usage        jsonb,
  model        text,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index chat_messages_employee_idx on public.chat_messages (workspace_id, employee_id, created_at);

alter table public.tasks add column if not exists file_names text[] not null default '{}';
alter table public.tasks add column if not exists usage jsonb;
alter table public.tasks add column if not exists model text;

-- Row level security: members read; owner/admin/manager write; owner/admin delete.
do $$
declare t text;
begin
  foreach t in array array['approvals','chat_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(workspace_id))', t || '_read', t);
    execute format($p$create policy %I on public.%I for insert with check (public.has_role(workspace_id, array['owner','admin','manager']::public.member_role[]))$p$, t || '_ins', t);
    execute format($p$create policy %I on public.%I for update using (public.has_role(workspace_id, array['owner','admin','manager']::public.member_role[]))$p$, t || '_upd', t);
    execute format($p$create policy %I on public.%I for delete using (public.has_role(workspace_id, array['owner','admin']::public.member_role[]))$p$, t || '_del', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.approvals;
