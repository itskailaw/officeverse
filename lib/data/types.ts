// Core domain types for OfficeVerse. These mirror the Supabase schema in
// supabase/migrations/0001_init.sql (snake_case there, camelCase here).

export type ID = string;

export type EmployeeStatus =
  | "available"
  | "working"
  | "waiting_data"
  | "waiting_approval"
  | "in_meeting"
  | "task_completed"
  | "error";

export const STATUS_META: Record<EmployeeStatus, { label: string; color: string }> = {
  available: { label: "Available", color: "#22c55e" },
  working: { label: "Working", color: "#3b82f6" },
  waiting_data: { label: "Waiting for Data", color: "#f59e0b" },
  waiting_approval: { label: "Waiting for Approval", color: "#a855f7" },
  in_meeting: { label: "In Meeting", color: "#06b6d4" },
  task_completed: { label: "Task Completed", color: "#10b981" },
  error: { label: "Error / Needs Attention", color: "#ef4444" },
};

export interface Company {
  id: ID;
  name: string;
  description: string;
  color: string;
  logoUrl?: string | null;
  active: boolean;
  createdAt: string;
}

export interface Department {
  id: ID;
  /** null = shared service department serving every company */
  companyId: ID | null;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export type Gender = "female" | "male" | "unspecified";
export type HairStyle = "short" | "long" | "bun" | "bob" | "buzz" | "hijab" | "ponytail";

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  shoes: string;
  glasses?: boolean;
}

export interface AIConfig {
  provider: "anthropic" | "openai" | "none";
  model: string;
  temperature: number;
  maxTokensPerTask: number;
}

export type Permission =
  | "orders:read"
  | "ads:read"
  | "inventory:read"
  | "customers:read"
  | "listings:read"
  | "suppliers:read"
  | "finance:read"
  | "reports:write"
  | "files:read"
  | "projects:read"
  | "audit:read"
  | "integrations:read"
  | "drafts:write";

export interface Employee {
  id: ID;
  name: string;
  gender: Gender;
  appearance: Appearance;
  departmentId: ID;
  companyId: ID | null;
  title: string;
  personality: string;
  responsibilities: string[];
  workstationId: ID | null;
  workingHours: { start: string; end: string; days: number[] };
  ai: AIConfig;
  permissions: Permission[];
  reportingSchedule: string;
  status: EmployeeStatus;
  active: boolean;
  createdAt: string;
}

export type TaskStatus =
  | "queued"
  | "validating"
  | "running"
  | "waiting_data"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface Task {
  id: ID;
  employeeId: ID;
  companyId: ID | null;
  title: string;
  instructions: string;
  status: TaskStatus;
  priority: "low" | "normal" | "high";
  source: "ceo" | "meeting" | "schedule";
  meetingId?: ID | null;
  result?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingItem {
  id: ID;
  kind: "note" | "decision" | "action";
  text: string;
  assigneeId?: ID | null;
  taskId?: ID | null;
  createdAt: string;
}

export interface Meeting {
  id: ID;
  topic: string;
  attendeeIds: ID[];
  status: "scheduled" | "in_progress" | "ended";
  scheduledFor?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  items: MeetingItem[];
  summary?: string | null;
  createdAt: string;
}

export type NotificationPriority = "critical" | "important" | "info";

export interface AppNotification {
  id: ID;
  priority: NotificationPriority;
  title: string;
  body: string;
  employeeId?: ID | null;
  companyId?: ID | null;
  /** true when generated from demo/sample data */
  demo: boolean;
  read: boolean;
  createdAt: string;
}

export interface ActivityEntry {
  id: ID;
  employeeId: ID | null;
  text: string;
  at: string;
}

export interface AuditEntry {
  id: ID;
  actor: string;
  action: string;
  entity: string;
  entityId: ID | null;
  detail?: string;
  at: string;
}

export type LightingMode = "day" | "evening" | "night" | "auto";
export type WallMode = "full" | "cutaway" | "hidden";

export interface OfficeSettings {
  lighting: LightingMode;
  walls: WallMode;
  wallColor: string;
  accentColor: string;
  floorWood: string;
  photoFrames: (string | null)[];
  ceoName: string;
  ceoAppearance: Appearance;
  demoMode: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  briefingTime: string;
  showNameTags: boolean;
  ambientLife: boolean;
}

// ---------- Office layout ----------

export type FurnitureType =
  | "workstation"
  | "exec_desk"
  | "meeting_table"
  | "sofa"
  | "armchair"
  | "coffee_table"
  | "plant"
  | "bookshelf"
  | "trophy_cabinet"
  | "perf_screen"
  | "reception_desk"
  | "server_rack"
  | "filing_cabinet"
  | "whiteboard"
  | "kitchen_counter"
  | "water_cooler"
  | "round_table"
  | "packing_table"
  | "product_shelf"
  | "photo_set"
  | "visitor_chair"
  | "rug"
  | "tv_screen"
  | "photo_frames";

export interface FurnitureItem {
  id: ID;
  type: FurnitureType;
  roomId: ID;
  x: number;
  z: number;
  /** rotation around Y in radians; the item's "front" faces (sin r, cos r) */
  rot: number;
  /** optional size override [width, depth] */
  size?: [number, number];
  color?: string;
  locked?: boolean;
}

export interface Room {
  id: ID;
  name: string;
  departmentId?: ID | null;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floor: "wood" | "carpet" | "tile" | "dark";
  floorColor?: string;
}

export interface WallLine {
  a: [number, number];
  b: [number, number];
  kind: "exterior" | "interior" | "glass";
}

export interface Door {
  id: ID;
  x: number;
  z: number;
  /** axis the wall runs along */
  axis: "x" | "z";
  width: number;
  /** open archway (no panels) */
  open?: boolean;
}

export interface Seat {
  id: ID;
  kind: "workstation" | "meeting" | "lounge" | "visitor" | "ceo";
  roomId: ID;
  x: number;
  z: number;
  facing: number;
  /** walkable point from which the agent glides into the seat */
  ax: number;
  az: number;
  furnitureId: ID;
  sit: boolean;
}

export interface OfficeLayout {
  width: number;
  depth: number;
  rooms: Room[];
  walls: WallLine[];
  doors: Door[];
  furniture: FurnitureItem[];
}
