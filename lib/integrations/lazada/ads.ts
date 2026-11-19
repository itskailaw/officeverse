import "server-only";
import { lazadaAdsGet, LazadaError, type LazadaConfig } from "./api";

// Lazada Sponsored Solutions (read-only). Paths and parameters from the Lazada
// Open Platform API reference (Sponsored Solutions API group):
//   /sponsor/solutions/report/getReportOverview        (bizCode sponsoredSearch = Sponsored Discovery)
//   /sponsor/solution/smax/report/getReportOverview    (Sponsored Max)
//   /sponsor/solutions/wallet/getAutoTopUpOptionOneConfig
// Dates are yyyy-MM-dd (Malaysia time); useRtTable=true includes today's real-time data.
// Lazada has no balance API, so the wallet balance itself is not available.

export interface AdMetrics {
  spend: number;
  revenue: number;
  roi: number | null;
  clicks: number;
  impressions: number;
  unitsSold: number;
  orders: number;
}
export interface LazadaAds {
  at: string;
  today: AdMetrics | null;
  yesterday: AdMetrics | null;
  monthToDate: AdMetrics | null;
  /** per solution (discovery, smax) for today, when available */
  solutions: { discovery: AdMetrics | null; smax: AdMetrics | null };
  autoTopUp: { enabled: boolean; whenBelow: number | null; amount: number | null } | null;
  errors: string[];
}

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

export function parseMetrics(o: unknown): AdMetrics | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const spend = n(pick(r, "spend", "cost"));
  const revenue = n(pick(r, "revenue", "storeRevenue", "gmv"));
  const roiRaw = pick(r, "roi", "storeRoi");
  return {
    spend,
    revenue,
    roi: roiRaw !== undefined ? n(roiRaw) : spend > 0 ? revenue / spend : null,
    clicks: n(pick(r, "clicks")),
    impressions: n(pick(r, "impressions", "impression")),
    unitsSold: n(pick(r, "unitsSold", "storeUnitSold", "productUnitSold")),
    orders: n(pick(r, "storeOrder", "orders", "productOrder")),
  };
}

/** Overview result: { reportOverview: {...current}, lastReportOverview: {...previous} } (tolerant of naming). */
export function parseOverview(result: unknown): { current: AdMetrics | null; last: AdMetrics | null } {
  if (!result || typeof result !== "object") return { current: null, last: null };
  const r = result as Record<string, unknown>;
  const lastKey = Object.keys(r).find((k) => /^last/i.test(k) && typeof r[k] === "object");
  const curKey = Object.keys(r).find((k) => /overview|report/i.test(k) && !/^last/i.test(k) && typeof r[k] === "object");
  return { current: parseMetrics(curKey ? r[curKey] : r.spend !== undefined ? r : null), last: parseMetrics(lastKey ? r[lastKey] : null) };
}

export function addMetrics(a: AdMetrics | null, b: AdMetrics | null): AdMetrics | null {
  if (!a) return b;
  if (!b) return a;
  const spend = a.spend + b.spend;
  const revenue = a.revenue + b.revenue;
  return {
    spend,
    revenue,
    roi: spend > 0 ? revenue / spend : null,
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
    unitsSold: a.unitsSold + b.unitsSold,
    orders: a.orders + b.orders,
  };
}

const klDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function fetchLazadaAds(cfg: LazadaConfig, token: string): Promise<LazadaAds> {
  const now = new Date();
  const today = klDate(now);
  const yesterday = klDate(new Date(now.getTime() - 86400_000));
  const monthStart = today.slice(0, 8) + "01";
  const prevMonthDay = new Date(`${monthStart}T00:00:00+08:00`);
  prevMonthDay.setUTCDate(0); // last day of previous month
  const lastMonthStart = klDate(prevMonthDay).slice(0, 8) + "01";
  const lastMonthEnd = klDate(prevMonthDay);
  const errors: string[] = [];
  const attempt = async <T>(label: string, f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch (e) {
      errors.push(`${label}: ${e instanceof LazadaError ? `${e.code} ${e.message}` : e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  const day = { startDate: today, endDate: today, lastStartDate: yesterday, lastEndDate: yesterday, useRtTable: "true" };
  const [sd, smax, sdMtd, smaxMtd, topUp] = await Promise.all([
    attempt("Sponsored Discovery", () => lazadaAdsGet<unknown>(cfg, "/sponsor/solutions/report/getReportOverview", { ...day, bizCode: "sponsoredSearch" }, token)),
    attempt("Sponsored Max", () => lazadaAdsGet<unknown>(cfg, "/sponsor/solution/smax/report/getReportOverview", day, token)),
    attempt("Sponsored Discovery (month)", () =>
      lazadaAdsGet<unknown>(
        cfg,
        "/sponsor/solutions/report/getReportOverview",
        { startDate: monthStart, endDate: today, lastStartDate: lastMonthStart, lastEndDate: lastMonthEnd, useRtTable: "true", bizCode: "sponsoredSearch" },
        token,
      ),
    ),
    attempt("Sponsored Max (month)", () =>
      lazadaAdsGet<unknown>(cfg, "/sponsor/solution/smax/report/getReportOverview", { startDate: monthStart, endDate: today, lastStartDate: lastMonthStart, lastEndDate: lastMonthEnd, useRtTable: "true" }, token),
    ),
    attempt("Auto top-up", () => lazadaAdsGet<Record<string, unknown>>(cfg, "/sponsor/solutions/wallet/getAutoTopUpOptionOneConfig", {}, token)),
  ]);
  const d = parseOverview(sd);
  const m = parseOverview(smax);
  const dm = parseOverview(sdMtd);
  const mm = parseOverview(smaxMtd);
  let autoTopUp: LazadaAds["autoTopUp"] = null;
  if (topUp && typeof topUp === "object") {
    const st = String(topUp.status ?? "").toLowerCase();
    autoTopUp = {
      enabled: ["1", "true", "on", "open", "active", "enable", "enabled"].includes(st),
      whenBelow: topUp.limitAmount != null ? n(topUp.limitAmount) : null,
      amount: topUp.topUpAmount != null ? n(topUp.topUpAmount) : null,
    };
  }
  return {
    at: now.toISOString(),
    today: addMetrics(d.current, m.current),
    yesterday: addMetrics(d.last, m.last),
    monthToDate: addMetrics(dm.current, mm.current),
    solutions: { discovery: d.current, smax: m.current },
    autoTopUp,
    errors,
  };
}
