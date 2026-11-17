// Request/response shapes shared by the browser and the /api/ai/* routes.
// The browser sends a *snapshot* of the context the employee may use; the
// server decides which tools (data) the employee may touch from its permissions.

import type { AIUsage, ApprovalKind, Employee, EmployeeStatus, Permission, TaskStatus } from "../data/types.ts";

export interface EmployeeBrief {
  id: string;
  name: string;
  title: string;
  department: string;
  company: string | null;
  personality: string;
  responsibilities: string[];
  permissions: Permission[];
  model: string;
  maxTokensPerTask: number;
}

export interface OfficeContext {
  ceoName: string;
  demoMode: boolean;
  companies: { name: string; description: string; active: boolean }[];
  team: { name: string; title: string; department: string; status: EmployeeStatus }[];
  recentTasks: { employee: string; title: string; status: TaskStatus; result: string | null; createdAt: string }[];
}

export interface UploadedFile {
  name: string;
  type: string;
  /** base64 (no data: prefix) */
  data: string;
}

export interface TaskRunRequest {
  employee: EmployeeBrief;
  task: { id: string; title: string; instructions: string; priority: string };
  context: OfficeContext;
  files: UploadedFile[];
}

export interface ApprovalRequest {
  kind: ApprovalKind;
  summary: string;
  draft: string;
}

export interface TaskRunResponse {
  status: Extract<TaskStatus, "completed" | "waiting_approval" | "waiting_data" | "failed">;
  result: string;
  approvals: ApprovalRequest[];
  missingData: string | null;
  usage: AIUsage;
  model: string;
}

export interface ChatRequest {
  employee: EmployeeBrief;
  context: OfficeContext;
  history: { role: "ceo" | "employee"; content: string }[];
  message: string;
  /** optional extra framing, e.g. "You are in a meeting about X" */
  situation?: string;
}

export interface ChatResponse {
  reply: string;
  usage: AIUsage;
  model: string;
}

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FILES = 3;
export const ACCEPTED_FILE_TYPES = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
  ".md",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

export function briefFrom(e: Employee, department: string, company: string | null): EmployeeBrief {
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    department,
    company,
    personality: e.personality,
    responsibilities: e.responsibilities,
    permissions: e.permissions,
    model: e.ai.model,
    maxTokensPerTask: e.ai.maxTokensPerTask,
  };
}
