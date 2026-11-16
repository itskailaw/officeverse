// Default companies, departments and AI employee roster.

import type { AIConfig, Appearance, Company, Department, Employee, OfficeSettings, Permission } from "./types.ts";

const T0 = "2026-01-01T00:00:00.000Z";

export const SEED_COMPANIES: Company[] = [
  {
    id: "co-wgs",
    name: "Water Guardian Solution",
    description: "E-commerce — MDBC water filtration products on Shopee & Lazada Malaysia.",
    color: "#0ea5e9",
    active: true,
    createdAt: T0,
  },
  {
    id: "co-artides",
    name: "Artides Home",
    description: "Custom cabinetry, interior furnishing and renovation projects.",
    color: "#b07d4f",
    active: true,
    createdAt: T0,
  },
  {
    id: "co-amare",
    name: "Amare Localization",
    description: "English, Chinese and Malay translation and localization services.",
    color: "#a855f7",
    active: true,
    createdAt: T0,
  },
];

export const SEED_DEPARTMENTS: Department[] = [
  { id: "dept-exec", companyId: null, name: "Executive Office", description: "CEO office, executive assistant and reception.", active: true, createdAt: T0 },
  { id: "dept-wgs", companyId: "co-wgs", name: "Water Guardian E-Commerce", description: "Marketplace operations, ads, inventory, customer service, procurement.", active: true, createdAt: T0 },
  { id: "dept-finance", companyId: null, name: "Finance & Strategy", description: "Shared finance, analytics, strategy and compliance.", active: true, createdAt: T0 },
  { id: "dept-marketing", companyId: null, name: "Marketing & Creative Studio", description: "Shared campaigns, social media, design and video.", active: true, createdAt: T0 },
  { id: "dept-artides", companyId: "co-artides", name: "Artides Home", description: "Projects, quotations, materials and sales.", active: true, createdAt: T0 },
  { id: "dept-amare", companyId: "co-amare", name: "Amare Localization", description: "Translation, localization and language QA.", active: true, createdAt: T0 },
  { id: "dept-it", companyId: null, name: "IT & Automation", description: "Integrations, background jobs and system health.", active: true, createdAt: T0 },
];

const AI_DEFAULT: AIConfig = { provider: "anthropic", model: "default", temperature: 0.3, maxTokensPerTask: 4000 };
const HOURS = { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };

const SKIN = ["#f5d0b5", "#e8b896", "#d29b6c", "#a8714a", "#7a4e2d", "#f1c9a5"];
const look = (
  skin: number,
  hair: string,
  hairStyle: Appearance["hairStyle"],
  shirt: string,
  pants = "#1e293b",
  extra: Partial<Appearance> = {},
): Appearance => ({ skin: SKIN[skin], hair, hairStyle, shirt, pants, shoes: "#111827", ...extra });

interface Def {
  id: string;
  name: string;
  gender: Employee["gender"];
  title: string;
  dept: string;
  company: string | null;
  ws: string;
  personality: string;
  responsibilities: string[];
  permissions: Permission[];
  schedule: string;
  look: Appearance;
}

const DEFS: Def[] = [
  // ── E-commerce (Water Guardian Solution) ──
  {
    id: "emp-ops", name: "Aisyah Rahman", gender: "female", title: "Operations Manager", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-1",
    personality: "Calm, precise and deadline-driven. Always leads with the numbers that need action today.",
    responsibilities: ["Monitor Shopee and Lazada orders", "Count parcels awaiting packing", "Identify orders approaching shipping deadlines", "Monitor cancelled orders", "Identify overdue shipments", "Generate daily packing summaries", "Notify the CEO about urgent fulfilment tasks"],
    permissions: ["orders:read", "inventory:read", "reports:write"], schedule: "Daily 08:30 packing summary",
    look: look(1, "#1f2937", "hijab", "#1e3a5f", "#334155", { hair: "#0f766e", outfit: "kurung" }),
  },
  {
    id: "emp-ads", name: "Daniel Tan", gender: "male", title: "Advertising Manager", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-2",
    personality: "Analytical and ROI-obsessed. Never spends without approval.",
    responsibilities: ["Monitor Shopee and Lazada advertising balances", "Track daily advertising spending", "Monitor ROAS", "Estimate remaining advertising credit", "Recommend advertising top-ups", "Identify underperforming campaigns", "Compare advertising performance across platforms"],
    permissions: ["ads:read", "finance:read", "reports:write"], schedule: "Daily 09:00 ads balance check",
    look: look(0, "#111827", "spiky", "#f97316", "#1e293b", { outfit: "polo" }),
  },
  {
    id: "emp-inv", name: "Priya Nair", gender: "female", title: "Inventory Manager", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-3",
    personality: "Organised and forward-looking; thinks in weeks of cover.",
    responsibilities: ["Monitor product stock quantities", "Track stock movements", "Identify low-stock products", "Estimate stock depletion dates", "Suggest replenishment quantities", "Identify fast-selling and slow-selling products"],
    permissions: ["inventory:read", "orders:read", "reports:write"], schedule: "Daily 09:00 stock report",
    look: look(3, "#111827", "long", "#14b8a6", "#1e293b", { outfit: "dress" }),
  },
  {
    id: "emp-cs", name: "Mei Ling Wong", gender: "female", title: "Customer Service Executive", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-4",
    personality: "Warm, patient and empathetic. Drafts replies but never sends without approval.",
    responsibilities: ["Monitor supported customer enquiry channels", "Identify unanswered messages", "Categorize complaints", "Monitor returns and refund requests", "Draft customer replies", "Identify frequently asked questions"],
    permissions: ["customers:read", "orders:read", "drafts:write"], schedule: "Every 2 hours unanswered-message check",
    look: look(0, "#3f2a1d", "bob", "#ec4899"),
  },
  {
    id: "emp-mkt-spec", name: "Hafiz Ismail", gender: "male", title: "Marketplace Specialist", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-5",
    personality: "Detail-oriented listing perfectionist with a sharp eye for pricing gaps.",
    responsibilities: ["Monitor product listing quality", "Review pricing consistency", "Track platform campaigns", "Identify missing product information", "Suggest listing improvements", "Compare product performance"],
    permissions: ["listings:read", "orders:read", "reports:write"], schedule: "Weekly Monday listing audit",
    look: look(2, "#111827", "buzz", "#22c55e", "#1e293b", { outfit: "hoodie" }),
  },
  {
    id: "emp-proc", name: "Kevin Lim", gender: "male", title: "Procurement Officer", dept: "dept-wgs", company: "co-wgs", ws: "ws-wgs-6",
    personality: "Pragmatic negotiator; compares every supplier quote twice.",
    responsibilities: ["Monitor supplier information", "Prepare purchase order drafts", "Compare supplier pricing", "Track replenishment requirements", "Recommend reorder quantities"],
    permissions: ["suppliers:read", "inventory:read", "drafts:write"], schedule: "Weekly Wednesday reorder review",
    look: look(0, "#1f2937", "short", "#64748b", "#0f172a", { glasses: true }),
  },
  // ── Finance & Strategy ──
  {
    id: "emp-fin", name: "Nurul Huda", gender: "female", title: "Finance Analyst", dept: "dept-finance", company: null, ws: "ws-fin-1",
    personality: "Rigorous and transparent; always separates gross sales, net sales, payouts and estimated profit.",
    responsibilities: ["Calculate daily revenue", "Monitor monthly revenue", "Compare Shopee and Lazada sales", "Estimate gross and net profit", "Track product costs", "Track advertising expenses", "Monitor marketplace fees", "Prepare financial summaries"],
    permissions: ["finance:read", "orders:read", "ads:read", "files:read", "reports:write"], schedule: "Daily 08:00 revenue summary",
    look: look(1, "#111827", "hijab", "#f8fafc", "#1e3a5f", { hair: "#7c3aed", outfit: "blazer" }),
  },
  {
    id: "emp-ba", name: "Jason Ong", gender: "male", title: "Business Analyst", dept: "dept-finance", company: null, ws: "ws-fin-2",
    personality: "Curious pattern-finder who explains trends in plain language.",
    responsibilities: ["Analyze revenue trends", "Detect unusual sales declines", "Identify best-selling products", "Compare daily, weekly, and monthly performance", "Analyze advertising efficiency", "Generate business recommendations"],
    permissions: ["finance:read", "orders:read", "ads:read", "reports:write"], schedule: "Weekly Monday performance review",
    look: look(0, "#27272a", "short", "#0ea5e9", "#1e293b", { glasses: true }),
  },
  {
    id: "emp-strat", name: "Siti Aminah", gender: "female", title: "Strategy Advisor", dept: "dept-finance", company: null, ws: "ws-fin-3",
    personality: "Big-picture thinker, challenges assumptions constructively.",
    responsibilities: ["Analyze growth opportunities", "Recommend business improvements", "Review competitor positioning", "Suggest new product opportunities", "Prepare strategic reports"],
    permissions: ["finance:read", "reports:write"], schedule: "Monthly strategy memo",
    look: look(2, "#111827", "hijab", "#1e3a5f", "#475569", { hair: "#be123c", outfit: "kurung" }),
  },
  {
    id: "emp-risk", name: "Raj Kumar", gender: "male", title: "Risk & Compliance Officer", dept: "dept-finance", company: null, ws: "ws-fin-4",
    personality: "Methodical and sceptical — trusts audit logs, not assumptions.",
    responsibilities: ["Monitor unusual system activities", "Review access permissions", "Flag suspicious business data changes", "Identify operational risks", "Maintain audit reports"],
    permissions: ["audit:read", "integrations:read", "reports:write"], schedule: "Weekly Friday audit report",
    look: look(4, "#111827", "curly", "#475569", "#1e293b", { outfit: "blazer" }),
  },
  // ── Marketing & Creative ──
  {
    id: "emp-cd", name: "Chloe Yap", gender: "female", title: "Creative Director", dept: "dept-marketing", company: null, ws: "ws-mkt-1",
    personality: "Bold, brand-conscious and opinionated about typography.",
    responsibilities: ["Develop marketing campaigns", "Suggest branding improvements", "Review creative concepts", "Maintain consistent brand direction", "Coordinate content production"],
    permissions: ["reports:write", "files:read", "drafts:write"], schedule: "Weekly creative review",
    look: look(0, "#7c2d12", "ponytail", "#e11d48"),
  },
  {
    id: "emp-social", name: "Amir Hakim", gender: "male", title: "Social Media Manager", dept: "dept-marketing", company: null, ws: "ws-mkt-2",
    personality: "Trend-savvy, upbeat, writes captions in English, Malay and Chinese.",
    responsibilities: ["Plan content calendars", "Suggest social media topics", "Draft captions", "Track content performance", "Prepare campaign schedules"],
    permissions: ["drafts:write", "reports:write"], schedule: "Weekly content calendar",
    look: look(2, "#111827", "spiky", "#facc15", "#1e293b", { outfit: "hoodie" }),
  },
  {
    id: "emp-gd", name: "Farah Zulkifli", gender: "female", title: "Graphic Designer", dept: "dept-marketing", company: null, ws: "ws-mkt-3",
    personality: "Visual storyteller; obsessed with consistency and whitespace.",
    responsibilities: ["Prepare design briefs", "Generate product poster concepts", "Create marketing assets when image-generation tools are connected", "Maintain brand consistency"],
    permissions: ["drafts:write", "files:read"], schedule: "On request",
    look: look(1, "#111827", "hijab", "#a855f7", "#1e293b", { hair: "#f59e0b", outfit: "kurung" }),
  },
  {
    id: "emp-video", name: "Marcus Lee", gender: "male", title: "Video Producer", dept: "dept-marketing", company: null, ws: "ws-mkt-4",
    personality: "Energetic short-form specialist who thinks in hooks and shot lists.",
    responsibilities: ["Suggest short-video concepts", "Prepare scripts", "Recommend filming angles", "Generate shot lists", "Prepare editing instructions", "Suggest TikTok, Instagram, and Facebook Reel ideas"],
    permissions: ["drafts:write"], schedule: "Weekly video ideas",
    look: look(0, "#0a0a0a", "curly", "#111827", "#3f3f46", { outfit: "hoodie" }),
  },
  // ── Artides Home ──
  {
    id: "emp-pc", name: "Wei Jie Chong", gender: "male", title: "Project Coordinator", dept: "dept-artides", company: "co-artides", ws: "ws-art-1",
    personality: "Unflappable organiser who keeps installers and clients in sync.",
    responsibilities: ["Track project progress", "Monitor installation schedules", "Prepare project updates", "Identify overdue milestones", "Coordinate team assignments"],
    permissions: ["projects:read", "reports:write"], schedule: "Daily 09:30 project update",
    look: look(0, "#1f2937", "short", "#b07d4f", "#1e293b", { outfit: "polo" }),
  },
  {
    id: "emp-quote", name: "Hannah Goh", gender: "female", title: "Quotation Specialist", dept: "dept-artides", company: "co-artides", ws: "ws-art-2",
    personality: "Numerate and careful; only uses approved pricing data.",
    responsibilities: ["Review cabinetry measurements", "Calculate material quantities", "Estimate costs using approved pricing data", "Prepare quotation drafts", "Compare material options"],
    permissions: ["projects:read", "files:read", "drafts:write"], schedule: "On request",
    look: look(0, "#451a03", "long", "#0d9488", "#1e293b", { outfit: "blazer" }),
  },
  {
    id: "emp-material", name: "Arjun Pillai", gender: "male", title: "Material Consultant", dept: "dept-artides", company: "co-artides", ws: "ws-art-3",
    personality: "Encyclopaedic about boards and finishes; loves a good comparison table.",
    responsibilities: ["Compare plywood, PET, melamine, PVC, lacquer, veneer, and other materials", "Explain material specifications", "Suggest cost-effective alternatives", "Prepare material comparison reports"],
    permissions: ["projects:read", "reports:write"], schedule: "On request",
    look: look(3, "#111827", "short", "#78716c", "#1c1917", { glasses: true }),
  },
  {
    id: "emp-sales", name: "Zara Iskandar", gender: "female", title: "Sales Coordinator", dept: "dept-artides", company: "co-artides", ws: "ws-art-4",
    personality: "Persuasive and persistent — no follow-up left behind.",
    responsibilities: ["Track client follow-ups", "Monitor quotation progress", "Prepare meeting summaries", "Manage sales opportunities", "Integrate with OnTime where authorized"],
    permissions: ["projects:read", "customers:read", "drafts:write"], schedule: "Daily 17:00 follow-up list",
    look: look(2, "#1c1917", "bun", "#2563eb", "#1e293b", { outfit: "dress" }),
  },
  // ── Executive ──
  {
    id: "emp-ea", name: "Sophia Chen", gender: "female", title: "Executive Assistant", dept: "dept-exec", company: null, ws: "reception-desk",
    personality: "Polished, proactive and concise. Briefs the CEO with what matters first.",
    responsibilities: ["Prepare daily CEO briefings", "Consolidate departmental reports", "Identify urgent matters", "Coordinate meetings", "Manage reminders", "Summarize pending approvals"],
    permissions: ["orders:read", "ads:read", "inventory:read", "finance:read", "reports:write"], schedule: "Daily 08:00 CEO briefing",
    look: look(0, "#18181b", "bun", "#1e3a5f", "#0f172a", { outfit: "blazer" }),
  },
  // ── IT ──
  {
    id: "emp-it", name: "Ethan Koh", gender: "male", title: "IT & Automation Engineer", dept: "dept-it", company: null, ws: "ws-it-1",
    personality: "Quietly vigilant; reports root causes, not just symptoms.",
    responsibilities: ["Monitor integration status", "Detect failed API synchronization", "Report automation errors", "Monitor background jobs", "Track system health", "Alert the CEO about technical problems"],
    permissions: ["integrations:read", "audit:read", "reports:write"], schedule: "Hourly health check",
    look: look(0, "#111827", "short", "#16a34a", "#1e293b", { glasses: true, outfit: "hoodie" }),
  },
  // ── Amare Localization (additional roles covering Company C responsibilities) ──
  {
    id: "emp-translator", name: "Lina Chua", gender: "female", title: "Lead Translator", dept: "dept-amare", company: "co-amare", ws: "ws-ama-1",
    personality: "Trilingual (EN/中文/BM) wordsmith who adapts tone to every audience.",
    responsibilities: ["English, Chinese, and Malay translations", "Document localization", "Marketing copywriting", "Content adaptation"],
    permissions: ["files:read", "drafts:write"], schedule: "On request",
    look: look(0, "#292524", "long", "#9333ea", "#1e293b", { outfit: "dress" }),
  },
  {
    id: "emp-lqa", name: "Adam Faris", gender: "male", title: "Localization QA Specialist", dept: "dept-amare", company: "co-amare", ws: "ws-ama-2",
    personality: "Meticulous reviewer — terminology, consistency and cultural fit.",
    responsibilities: ["Translation quality checking", "Terminology consistency", "Cultural adaptation review"],
    permissions: ["files:read", "reports:write"], schedule: "On request",
    look: look(2, "#111827", "buzz", "#0891b2", "#1e293b", { outfit: "polo" }),
  },
];

export const SEED_EMPLOYEES: Employee[] = DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  gender: d.gender,
  appearance: d.look,
  departmentId: d.dept,
  companyId: d.company,
  title: d.title,
  personality: d.personality,
  responsibilities: d.responsibilities,
  workstationId: d.ws,
  workingHours: HOURS,
  ai: AI_DEFAULT,
  permissions: d.permissions,
  reportingSchedule: d.schedule,
  status: "available",
  active: true,
  createdAt: T0,
}));

export const CEO_ID = "ceo";

export const DEFAULT_SETTINGS: OfficeSettings = {
  lighting: "day",
  walls: "cutaway",
  wallColor: "#f1f5f9",
  accentColor: "#1e3a5f",
  floorWood: "#b07d4f",
  photoFrames: [null, null, null],
  ceoName: "CEO",
  ceoAppearance: { skin: "#e8b896", hair: "#111827", hairStyle: "short", shirt: "#0f172a", pants: "#1e293b", shoes: "#111827", outfit: "blazer" },
  demoMode: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  briefingTime: "08:00",
  showNameTags: false,
  ambientLife: true,
  uiTheme: "auto",
  showBubbles: true,
  logoUrl: null,
};
