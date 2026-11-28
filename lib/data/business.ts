/** Artides Home projects & quotations and Amare Localization jobs (pure — unit-tested; used by server and browser). */

// ───────────── Artides Home (cabinetry / interior projects)
export const PROJECT_STAGES = ["measure", "design", "quoted", "confirmed", "production", "installation", "completed", "cancelled"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const STAGE_LABEL: Record<ProjectStage, string> = {
  measure: "Site measure",
  design: "Design",
  quoted: "Quoted",
  confirmed: "Confirmed",
  production: "Production",
  installation: "Installation",
  completed: "Completed",
  cancelled: "Cancelled",
};
export interface Milestone {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  due: string;
  done?: boolean;
}
export interface ArtProject {
  id: string;
  client: string;
  phone?: string;
  site?: string;
  /** Kitchen cabinet, wardrobe, TV cabinet… */
  type?: string;
  /** contract value, RM */
  value: number;
  /** received so far, RM */
  paid: number;
  stage: ProjectStage;
  /** YYYY-MM-DD */
  installDate?: string;
  milestones?: Milestone[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export const QUOTE_STATUSES = ["draft", "sent", "won", "lost"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export interface ArtQuote {
  id: string;
  client: string;
  title: string;
  /** RM */
  amount: number;
  status: QuoteStatus;
  /** YYYY-MM-DD */
  sentAt?: string;
  /** YYYY-MM-DD — when to chase the client */
  followUp?: string;
  createdAt: string;
}
export interface Artides {
  projects: ArtProject[];
  quotes: ArtQuote[];
}

const ACTIVE = new Set<ProjectStage>(["measure", "design", "quoted", "confirmed", "production", "installation"]);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export function artidesSummary(d: Artides | null | undefined, today: string) {
  const projects = d?.projects ?? [];
  const quotes = d?.quotes ?? [];
  const active = projects.filter((p) => ACTIVE.has(p.stage));
  const overdue: { project: string; milestone: string; due: string; daysLate: number }[] = [];
  for (const p of active) for (const m of p.milestones ?? []) if (!m.done && m.due < today) overdue.push({ project: p.client, milestone: m.name, due: m.due, daysLate: dayDiff(today, m.due) });
  const installsThisWeek = active.filter((p) => p.installDate && dayDiff(p.installDate, today) >= 0 && dayDiff(p.installDate, today) < 7);
  const pending = quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const month = today.slice(0, 7);
  const decided = quotes.filter((q) => q.status === "won" || q.status === "lost");
  return {
    activeProjects: active.length,
    activeValue: active.reduce((a, p) => a + (p.value || 0), 0),
    outstanding: active.reduce((a, p) => a + Math.max(0, (p.value || 0) - (p.paid || 0)), 0),
    overdueMilestones: overdue.length,
    overdue: overdue.sort((a, b) => b.daysLate - a.daysLate),
    installationsThisWeek: installsThisWeek.length,
    installs: installsThisWeek.map((p) => ({ client: p.client, date: p.installDate! })).sort((a, b) => a.date.localeCompare(b.date)),
    quotationsPending: pending.length,
    pipelineValue: pending.reduce((a, q) => a + (q.amount || 0), 0),
    followUpsDue: pending.filter((q) => q.followUp && q.followUp <= today).map((q) => ({ client: q.client, title: q.title, amount: q.amount, followUp: q.followUp! })),
    wonThisMonth: quotes.filter((q) => q.status === "won" && (q.sentAt ?? q.createdAt).startsWith(month)).reduce((a, q) => a + q.amount, 0),
    winRate: decided.length ? quotes.filter((q) => q.status === "won").length / decided.length : null,
    byStage: Object.fromEntries(PROJECT_STAGES.map((s) => [s, projects.filter((p) => p.stage === s).length])) as Record<ProjectStage, number>,
  };
}

// ───────────── Amare Localization (translation jobs)
export const JOB_STATUSES = ["new", "translating", "qa", "delivered", "invoiced", "paid", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_LABEL: Record<JobStatus, string> = {
  new: "New",
  translating: "Translating",
  qa: "QA check",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};
export interface AmareJob {
  id: string;
  client: string;
  title: string;
  /** EN, ZH, MS… */
  source: string;
  target: string;
  words: number;
  /** RM per word */
  rate: number;
  /** fixed fee instead of words × rate, RM */
  fee?: number;
  /** YYYY-MM-DD */
  due?: string;
  status: JobStatus;
  /** YYYY-MM-DD */
  deliveredAt?: string;
  createdAt: string;
}
export interface Amare {
  jobs: AmareJob[];
}
export const jobAmount = (j: Pick<AmareJob, "words" | "rate" | "fee">) => Math.round(((j.fee ?? 0) > 0 ? j.fee! : (j.words || 0) * (j.rate || 0)) * 100) / 100;

const OPEN = new Set<JobStatus>(["new", "translating", "qa"]);
export function amareSummary(d: Amare | null | undefined, today: string) {
  const jobs = d?.jobs ?? [];
  const open = jobs.filter((j) => OPEN.has(j.status));
  const month = today.slice(0, 7);
  const deliveredMonth = jobs.filter((j) => ["delivered", "invoiced", "paid"].includes(j.status) && (j.deliveredAt ?? j.createdAt).startsWith(month));
  return {
    jobsInProgress: open.length,
    dueThisWeek: open.filter((j) => j.due && dayDiff(j.due, today) >= 0 && dayDiff(j.due, today) < 7).length,
    overdue: open.filter((j) => j.due && j.due < today).map((j) => ({ client: j.client, title: j.title, due: j.due!, daysLate: dayDiff(today, j.due!) })),
    qaPending: jobs.filter((j) => j.status === "qa").length,
    wordsThisMonth: deliveredMonth.reduce((a, j) => a + (j.words || 0), 0),
    wordsInProgress: open.reduce((a, j) => a + (j.words || 0), 0),
    revenueThisMonth: Math.round(deliveredMonth.reduce((a, j) => a + jobAmount(j), 0) * 100) / 100,
    toInvoice: jobs.filter((j) => j.status === "delivered").reduce((a, j) => a + jobAmount(j), 0),
    unpaid: jobs.filter((j) => j.status === "invoiced").reduce((a, j) => a + jobAmount(j), 0),
    byPair: Object.entries(
      jobs.reduce<Record<string, number>>((acc, j) => {
        const k = `${j.source}→${j.target}`;
        acc[k] = (acc[k] ?? 0) + (j.words || 0);
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]),
  };
}

// ───────────── spreadsheet import
/** Parse CSV text (quotes, commas and newlines inside quotes, ; or tab separators). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/rm|myr|,|\s/gi, ""));
  return Number.isFinite(n) ? n : 0;
};
/** Dates like 2026-11-28, 28/11/2026, 28-11-26, 28 Nov 2026 → YYYY-MM-DD. */
export function toDate(v: string | undefined): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
}
const pick = (head: string[], row: string[], ...names: RegExp[]) => {
  for (const re of names) {
    const i = head.findIndex((h) => re.test(h));
    if (i >= 0 && row[i] !== undefined && row[i] !== "") return row[i];
  }
  return undefined;
};
const stageOf = (v?: string): ProjectStage => {
  const s = (v ?? "").toLowerCase();
  if (/cancel/.test(s)) return "cancelled";
  if (/complete|done|handover|selesai/.test(s)) return "completed";
  if (/install|pasang/.test(s)) return "installation";
  if (/product|fabricat|factory|kilang/.test(s)) return "production";
  if (/confirm|deposit|won|signed/.test(s)) return "confirmed";
  if (/quot|sebut/.test(s)) return "quoted";
  if (/design|drawing|3d/.test(s)) return "design";
  return "measure";
};
const quoteStatusOf = (v?: string): QuoteStatus => {
  const s = (v ?? "").toLowerCase();
  if (/won|accept|confirm|deal|yes/.test(s)) return "won";
  if (/lost|reject|cancel|no\b/.test(s)) return "lost";
  if (/draft/.test(s)) return "draft";
  return "sent";
};
const jobStatusOf = (v?: string): JobStatus => {
  const s = (v ?? "").toLowerCase();
  if (/cancel/.test(s)) return "cancelled";
  if (/paid/.test(s)) return "paid";
  if (/invoice/.test(s)) return "invoiced";
  if (/deliver|done|complete|sent/.test(s)) return "delivered";
  if (/qa|review|check|proof/.test(s)) return "qa";
  if (/progress|translat|working/.test(s)) return "translating";
  return "new";
};

export type ImportKind = "projects" | "quotes" | "jobs";
/** Turn spreadsheet rows (first row = headers, any column order) into records. */
export function importRows(kind: ImportKind, rows: string[][], now = new Date().toISOString(), id = () => Math.random().toString(36).slice(2, 10)) {
  if (rows.length < 2) return { records: [] as (ArtProject | ArtQuote | AmareJob)[], skipped: 0 };
  const head = rows[0].map((h) => h.toLowerCase().trim());
  const out: (ArtProject | ArtQuote | AmareJob)[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const client = pick(head, r, /client|customer|pelanggan/, /company|syarikat/, /^name$|nama/);
    if (!client) {
      skipped++;
      continue;
    }
    if (kind === "projects") {
      out.push({
        id: `pj-${id()}`,
        client,
        phone: pick(head, r, /phone|tel|mobile|hp/),
        site: pick(head, r, /site|address|location|alamat/),
        type: pick(head, r, /type|item|scope|product|category/, /project|description|job/),
        value: num(pick(head, r, /value|amount|contract|total|price/)),
        paid: num(pick(head, r, /paid|deposit|received/)),
        stage: stageOf(pick(head, r, /stage|status|progress/)),
        installDate: toDate(pick(head, r, /install|pasang/)),
        notes: pick(head, r, /note|remark|comment/),
        createdAt: now,
        updatedAt: now,
      });
    } else if (kind === "quotes") {
      out.push({
        id: `qt-${id()}`,
        client,
        title: pick(head, r, /title|item|scope|description|project/) ?? "Quotation",
        amount: num(pick(head, r, /amount|value|total|price/)),
        status: quoteStatusOf(pick(head, r, /status|result|outcome/)),
        sentAt: toDate(pick(head, r, /sent|date|issued/)),
        followUp: toDate(pick(head, r, /follow/)),
        createdAt: now,
      });
    } else {
      const pair = pick(head, r, /pair|language|lang/);
      const [ps, pt] = (pair ?? "").split(/\s*(?:→|->|>|to|\/)\s*/i);
      out.push({
        id: `jb-${id()}`,
        client,
        title: pick(head, r, /title|project|document|file|job/) ?? "Translation",
        source: (pick(head, r, /^source|^from/) ?? ps ?? "EN").toUpperCase().slice(0, 6),
        target: (pick(head, r, /^target|^to\b/) ?? pt ?? "ZH").toUpperCase().slice(0, 6),
        words: Math.round(num(pick(head, r, /word/))),
        rate: num(pick(head, r, /rate|per word/)),
        fee: num(pick(head, r, /fee|fixed|amount|total/)) || undefined,
        due: toDate(pick(head, r, /due|deadline/)),
        status: jobStatusOf(pick(head, r, /status|stage/)),
        deliveredAt: toDate(pick(head, r, /deliver/)),
        createdAt: now,
      });
    }
  }
  return { records: out, skipped };
}
