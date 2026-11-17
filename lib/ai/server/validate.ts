import "server-only";
import type { Permission } from "@/lib/data/types";
import type { ChatRequest, EmployeeBrief, OfficeContext, TaskRunRequest, UploadedFile } from "@/lib/ai/protocol";
import { MAX_FILES, MAX_FILE_BYTES } from "@/lib/ai/protocol";
import { HttpError, str } from "./guard";

const PERMS: Permission[] = [
  "orders:read",
  "ads:read",
  "inventory:read",
  "customers:read",
  "listings:read",
  "suppliers:read",
  "finance:read",
  "reports:write",
  "files:read",
  "projects:read",
  "audit:read",
  "integrations:read",
  "drafts:write",
];

function arr<T>(v: unknown, field: string, max: number, map: (x: unknown, i: number) => T): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, `Invalid ${field}.`);
  return v.slice(0, max).map(map);
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, `Invalid ${field}.`);
  return v as Record<string, unknown>;
}

export function parseEmployee(v: unknown): EmployeeBrief {
  const o = obj(v, "employee");
  return {
    id: str(o.id, "employee.id", 80),
    name: str(o.name, "employee.name", 80),
    title: str(o.title, "employee.title", 120),
    department: str(o.department, "employee.department", 120, false),
    company: str(o.company, "employee.company", 120, false) || null,
    personality: str(o.personality, "employee.personality", 1000, false),
    responsibilities: arr(o.responsibilities, "responsibilities", 30, (x) => str(x, "responsibility", 300)),
    permissions: arr(o.permissions, "permissions", 20, (x) => {
      const p = str(x, "permission", 40) as Permission;
      if (!PERMS.includes(p)) throw new HttpError(400, "Unknown permission.");
      return p;
    }),
    model: str(o.model, "employee.model", 60, false) || "default",
    maxTokensPerTask: Math.min(64000, Math.max(4000, Number(o.maxTokensPerTask) || 16000)),
  };
}

export function parseContext(v: unknown): OfficeContext {
  const o = obj(v, "context");
  return {
    ceoName: str(o.ceoName, "ceoName", 80, false) || "CEO",
    demoMode: o.demoMode === true,
    companies: arr(o.companies, "companies", 20, (x) => {
      const c = obj(x, "company");
      return { name: str(c.name, "company.name", 120), description: str(c.description, "company.description", 400, false), active: c.active !== false };
    }),
    team: arr(o.team, "team", 60, (x) => {
      const t = obj(x, "team member");
      return {
        name: str(t.name, "team.name", 80),
        title: str(t.title, "team.title", 120),
        department: str(t.department, "team.department", 120, false),
        status: str(t.status, "team.status", 30) as OfficeContext["team"][number]["status"],
      };
    }),
    recentTasks: arr(o.recentTasks, "recentTasks", 30, (x) => {
      const t = obj(x, "task");
      return {
        employee: str(t.employee, "task.employee", 80),
        title: str(t.title, "task.title", 200),
        status: str(t.status, "task.status", 30) as OfficeContext["recentTasks"][number]["status"],
        result: str(t.result, "task.result", 3000, false) || null,
        createdAt: str(t.createdAt, "task.createdAt", 40),
      };
    }),
  };
}

function parseFiles(v: unknown): UploadedFile[] {
  if (Array.isArray(v) && v.length > MAX_FILES) throw new HttpError(400, `Attach at most ${MAX_FILES} files per task.`);
  return arr(v, "files", MAX_FILES, (x) => {
    const f = obj(x, "file");
    const data = str(f.data, "file.data", Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8);
    return { name: str(f.name, "file.name", 200), type: str(f.type, "file.type", 120, false), data };
  });
}

export function parseTaskRequest(body: unknown): TaskRunRequest {
  const o = obj(body, "request");
  const t = obj(o.task, "task");
  return {
    employee: parseEmployee(o.employee),
    context: parseContext(o.context),
    task: {
      id: str(t.id, "task.id", 80),
      title: str(t.title, "task.title", 200),
      instructions: str(t.instructions, "task.instructions", 4000, false),
      priority: str(t.priority, "task.priority", 10, false) || "normal",
    },
    files: parseFiles(o.files),
  };
}

export function parseChatRequest(body: unknown): ChatRequest {
  const o = obj(body, "request");
  return {
    employee: parseEmployee(o.employee),
    context: parseContext(o.context),
    history: arr(o.history, "history", 30, (x) => {
      const m = obj(x, "message");
      const role = m.role === "ceo" ? "ceo" : "employee";
      return { role, content: str(m.content, "message.content", 8000) };
    }),
    message: str(o.message, "message", 4000),
    situation: str(o.situation, "situation", 1500, false) || undefined,
  };
}
