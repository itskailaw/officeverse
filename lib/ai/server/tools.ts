import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ApprovalKind, Permission } from "@/lib/data/types";
import type { ApprovalRequest, EmployeeBrief, OfficeContext } from "@/lib/ai/protocol";
import { DEMO_LABEL, demoAmare, demoArtides, demoEcommerce } from "@/lib/data/demo";

type Tool = Anthropic.Beta.BetaTool;

/** Which permission each business metric needs. */
const METRICS: Record<string, { label: string; perms: Permission[] }> = {
  revenue: { label: "Daily / monthly revenue by platform", perms: ["finance:read", "orders:read"] },
  orders_and_parcels: { label: "Orders awaiting packing, deadlines, cancellations", perms: ["orders:read"] },
  advertising: { label: "Ad balances, spend, ROAS", perms: ["ads:read"] },
  inventory: { label: "Stock levels and low-stock products", perms: ["inventory:read"] },
  best_sellers: { label: "Best-selling products", perms: ["orders:read", "finance:read", "inventory:read", "listings:read"] },
  artides_projects: { label: "Artides Home projects and quotations", perms: ["projects:read"] },
  amare_jobs: { label: "Amare Localization translation jobs", perms: ["projects:read", "files:read"] },
};

const APPROVAL_KINDS: ApprovalKind[] = ["payment", "ad_campaign", "product_update", "customer_message", "record_deletion", "other"];

export interface ToolState {
  approvals: ApprovalRequest[];
  missingData: string | null;
}

export function allowedMetrics(e: EmployeeBrief) {
  return Object.entries(METRICS)
    .filter(([, m]) => m.perms.some((p) => e.permissions.includes(p)))
    .map(([k]) => k);
}

export function buildTools(e: EmployeeBrief, mode: "task" | "chat"): Tool[] {
  const tools: Tool[] = [];
  const metrics = allowedMetrics(e);
  if (metrics.length) {
    tools.push({
      name: "get_business_metrics",
      description:
        "Read business data this employee is authorised to see. Returns live data only when a marketplace/business integration is connected; " +
        "otherwise returns either clearly labelled DEMO sample data (demo mode) or an 'unavailable' notice. Always state which of these you used.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          metric: { type: "string", enum: metrics, description: metrics.map((m) => `${m}: ${METRICS[m].label}`).join("; ") },
        },
        required: ["metric"],
        additionalProperties: false,
      },
    });
  }
  tools.push(
    {
      name: "get_team_overview",
      description: "List the AI employees in the company with their title, department and current status.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "get_recent_tasks",
      description: "Recent tasks across the team with their status and (shortened) results. Useful for briefings and avoiding duplicate work.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  );
  if (mode === "task") {
    tools.push(
      {
        name: "request_approval",
        description:
          "Use BEFORE any sensitive action: paying money, changing ad campaigns or budgets, changing product listings/prices, sending a message to a customer, or deleting records. " +
          "You cannot perform these actions yourself; submit the prepared draft for the CEO to approve. Call once per action.",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            kind: { type: "string", enum: APPROVAL_KINDS },
            summary: { type: "string", description: "One sentence: what you want approved and why." },
            draft: { type: "string", description: "The exact draft (message text, campaign change, purchase order, etc.)." },
          },
          required: ["kind", "summary", "draft"],
          additionalProperties: false,
        },
      },
      {
        name: "report_missing_data",
        description:
          "Use when the task cannot be completed properly because required data is not available to you (no integration connected, no file attached, or no permission). " +
          "Describe exactly what is missing and how the CEO can provide it.",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            what: { type: "string", description: "What data is missing and how to provide it (e.g. 'upload last month's Shopee order export as CSV')." },
          },
          required: ["what"],
          additionalProperties: false,
        },
      },
    );
  }
  return tools;
}

type PInfo = { connected: boolean; shopName?: string | null; lastSync?: string | null };
type Live = {
  platforms: { shopee: PInfo; lazada: PInfo };
  byPlatform?: unknown;
  definition: string;
  today: unknown;
  yesterday: unknown;
  monthToDate: unknown;
  days: unknown;
  toPack: unknown;
  cancelledToday: number;
  bestSellers30d: unknown;
  ads: { shopee: unknown; lazada?: unknown };
};

function liveData(metric: string, live: Live) {
  const desc = (name: string, p: PInfo) =>
    p.connected ? { connected: true, shop: p.shopName ?? null, lastSuccessfulSync: p.lastSync ?? null } : { connected: false, note: `${name} not connected — no data available.` };
  const meta = {
    source: "LIVE",
    marketplaces: { shopee: desc("Shopee", live.platforms.shopee), lazada: desc("Lazada", live.platforms.lazada) },
    note: "Totals combine all connected marketplaces; byPlatform gives the split.",
    byPlatform: live.byPlatform ?? null,
  };
  switch (metric) {
    case "revenue":
      return { ...meta, currency: "MYR", definition: live.definition, today: live.today, yesterday: live.yesterday, monthToDate: live.monthToDate, last30Days: live.days };
    case "orders_and_parcels":
      return {
        ...meta,
        toPack: live.toPack,
        parcelsNote:
          "Use the CEO's terms: readyToShip = 'To process' (new orders not accepted / shipment not arranged yet); processed = 'To ship' (accepted, waiting to be packed and picked up by the courier). total = both. urgentToProcess / urgentToShip = ship-by deadline within 24h in each group.",
        cancelledToday: live.cancelledToday,
      };
    case "advertising":
      return {
        ...meta,
        currency: "MYR",
        shopeeAdsBalance: live.ads.shopee ?? "Unavailable (Ads permission not granted on the Shopee app)",
        lazadaAds:
          live.ads.lazada ??
          (live.platforms.lazada.connected ? "Unavailable (Sponsor Solution permission missing or not re-connected)" : "Lazada not connected"),
        lazadaAdsNote:
          "Lazada Sponsored Solutions: spend, revenue (ad-attributed sales) and ROI = revenue / spend, for today, yesterday and month to date; combined Sponsored Discovery + Sponsored Max. Lazada exposes no wallet balance, only auto top-up settings.",
        shopeeDailySpend: "Not tracked yet",
      };
    case "best_sellers":
      return { ...meta, currency: "MYR", last30Days: live.bestSellers30d };
    default:
      return null;
  }
}

function metricData(metric: string, ctx: OfficeContext) {
  if (ctx.live) {
    const d = liveData(metric, ctx.live as unknown as Live);
    if (d) return d;
    return { source: "unavailable", message: `No live data for ${metric} yet (only marketplace orders, revenue and ads figures are connected). Do not estimate.` };
  }
  if (!ctx.demoMode) {
    return {
      source: "unavailable",
      message:
        "Data unavailable: no marketplace or business integration is connected yet, and demo mode is off. Do not estimate or invent figures. " +
        "Ask the CEO to upload an export (CSV/Excel) or wait for the integration (Phase 3).",
    };
  }
  const label = { source: "DEMO", warning: DEMO_LABEL };
  switch (metric) {
    case "revenue": {
      const d = demoEcommerce();
      return {
        ...label,
        currency: "MYR",
        note: "Gross sales before marketplace fees, refunds and cancellations.",
        today: d.today,
        yesterday: d.yesterday,
        monthToDate: d.mtd,
        last30Days: d.days,
        estimatedGrossProfit30d: Math.round(d.grossProfitEst),
        estimatedNetProfit30d: Math.round(d.netProfitEst),
      };
    }
    case "orders_and_parcels":
      return { ...label, parcelsToPack: demoEcommerce().parcels };
    case "advertising":
      return { ...label, currency: "MYR", accounts: demoEcommerce().ads };
    case "inventory":
      return { ...label, lowStock: demoEcommerce().lowStock };
    case "best_sellers":
      return { ...label, currency: "MYR", last30Days: demoEcommerce().bestSellers };
    case "artides_projects":
      return { ...label, currency: "MYR", ...demoArtides() };
    case "amare_jobs":
      return { ...label, ...demoAmare() };
    default:
      return { error: "Unknown metric." };
  }
}

/** Execute one tool call. Returns the tool_result content (JSON text) and whether it is an error. */
export function runTool(name: string, input: unknown, e: EmployeeBrief, ctx: OfficeContext, state: ToolState): { content: string; isError?: boolean } {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "get_business_metrics": {
      const metric = String(args.metric ?? "");
      const m = METRICS[metric];
      if (!m) return { content: "Unknown metric.", isError: true };
      if (!m.perms.some((p) => e.permissions.includes(p)))
        return { content: `Permission denied: ${e.name} is not authorised to read ${metric}. Tell the CEO which permission is needed.`, isError: true };
      return { content: JSON.stringify(metricData(metric, ctx)) };
    }
    case "get_team_overview":
      return { content: JSON.stringify(ctx.team) };
    case "get_recent_tasks":
      return { content: JSON.stringify(ctx.recentTasks) };
    case "request_approval": {
      const kind = String(args.kind ?? "other") as ApprovalKind;
      const summary = String(args.summary ?? "").slice(0, 500);
      const draft = String(args.draft ?? "").slice(0, 8000);
      if (!summary || !draft) return { content: "summary and draft are required.", isError: true };
      if (state.approvals.length >= 5) return { content: "Too many approval requests in one task (max 5).", isError: true };
      state.approvals.push({ kind: APPROVAL_KINDS.includes(kind) ? kind : "other", summary, draft });
      return { content: "Submitted to the CEO's approval inbox. Nothing will happen until the CEO approves. Mention this in your report." };
    }
    case "report_missing_data": {
      state.missingData = String(args.what ?? "").slice(0, 1000) || "Required data is missing.";
      return { content: "Recorded. The CEO will be told what is missing. Finish with a short report of what you could and could not do." };
    }
    default:
      return { content: `Unknown tool ${name}.`, isError: true };
  }
}
