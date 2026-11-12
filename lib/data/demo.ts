// Clearly-labelled SAMPLE data for demo mode. Deterministic (seeded) so the
// numbers are stable between reloads. Never shown when demo mode is off.

export const DEMO_LABEL = "DEMO DATA — sample values, not live business information";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KL_TZ = "Asia/Kuala_Lumpur";

export function klDateKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatMYR(n: number, digits = 0) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export interface DemoDay {
  date: string;
  shopee: number;
  lazada: number;
  orders: number;
  adSpend: number;
}

export interface DemoEcommerce {
  days: DemoDay[];
  today: DemoDay;
  yesterday: DemoDay;
  mtd: number;
  parcels: { shopee: number; lazada: number; priority: number; cancelled: number };
  ads: { platform: "Shopee" | "Lazada"; balance: number; avg7: number; roas: number; daysLeft: number }[];
  lowStock: { sku: string; name: string; qty: number; daysCover: number }[];
  bestSellers: { name: string; units: number; revenue: number }[];
  grossProfitEst: number;
  netProfitEst: number;
}

const PRODUCTS = [
  { name: "MDBC Water Filter", price: 289 },
  { name: "MDBC Showerhead", price: 129 },
  { name: "PP Replacement Cartridge", price: 39 },
  { name: "Activated Carbon Cartridge", price: 45 },
  { name: "PP + CaSO₃ Cartridge", price: 59 },
  { name: "MDBC Water Tester", price: 69 },
];

export function demoEcommerce(now = new Date(), nDays = 30): DemoEcommerce {
  const rnd = mulberry32(20260101);
  const days: DemoDay[] = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.18 : 1;
    const trend = 1 + (nDays - i) * 0.006;
    const shopee = Math.round((2600 + rnd() * 1500) * weekend * trend);
    const lazada = Math.round((1100 + rnd() * 900) * weekend * trend);
    const orders = Math.round((shopee + lazada) / (95 + rnd() * 30));
    const adSpend = Math.round(180 + rnd() * 120);
    days.push({ date: klDateKey(d), shopee, lazada, orders, adSpend });
  }
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const monthKey = today.date.slice(0, 7);
  const mtd = days.filter((d) => d.date.startsWith(monthKey)).reduce((s, d) => s + d.shopee + d.lazada, 0);
  const totalRev = days.reduce((s, d) => s + d.shopee + d.lazada, 0);
  const totalAds = days.reduce((s, d) => s + d.adSpend, 0);
  const gross = totalRev * 0.52;
  return {
    days,
    today,
    yesterday,
    mtd,
    parcels: { shopee: 35, lazada: 18, priority: 6, cancelled: 2 },
    ads: [
      { platform: "Shopee", balance: 120, avg7: 41, roas: 6.8, daysLeft: 120 / 41 },
      { platform: "Lazada", balance: 410, avg7: 26, roas: 5.1, daysLeft: 410 / 26 },
    ],
    lowStock: [
      { sku: "PP-10", name: "PP Replacement Cartridge", qty: 42, daysCover: 4 },
      { sku: "CS-10", name: "PP + CaSO₃ Cartridge", qty: 18, daysCover: 6 },
    ],
    bestSellers: PRODUCTS.slice(0, 5).map((p, i) => {
      const units = Math.round(420 / (i + 1) + rnd() * 30);
      return { name: p.name, units, revenue: units * p.price };
    }),
    grossProfitEst: gross,
    netProfitEst: gross - totalAds - totalRev * 0.14,
  };
}

export function demoArtides() {
  return {
    activeProjects: 7,
    overdueMilestones: 1,
    quotationsPending: 4,
    installationsThisWeek: 3,
    pipelineValue: 186500,
  };
}

export function demoAmare() {
  return {
    jobsInProgress: 5,
    wordsThisMonth: 48200,
    qaPending: 2,
    dueThisWeek: 3,
  };
}
