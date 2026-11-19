import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { listIntegrations, type IntegrationRow } from "./store";
import { requireShopeeConfig, shopGet, shopPost, shopPostFile, ShopeeError } from "./shopee/api";
import { validToken as shopeeToken } from "./shopee/sync";
import { lazadaGet, lazadaPost, LazadaError, requireLazadaConfig } from "./lazada/api";
import { validToken as lazadaToken } from "./lazada/sync";
import { HttpError } from "@/lib/ai/server/guard";

// Arrange shipment (drop-off) and print shipping labels. Real store actions — only the
// workspace owner can call these routes, and only for orders the owner clicked.

export interface ShipResult {
  orderId: string;
  ok: boolean;
  message: string;
  tracking?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) =>
  e instanceof ShopeeError || e instanceof LazadaError ? `${e.code}: ${e.message}` : e instanceof HttpError ? e.message : e instanceof Error ? e.message : String(e);

async function connection(ws: string, provider: "shopee" | "lazada"): Promise<IntegrationRow> {
  const [row] = await listIntegrations(ws, provider);
  if (!row || row.status === "expired") throw new HttpError(409, `${provider === "shopee" ? "Shopee" : "Lazada"} isn't connected (or needs re-connecting).`);
  return row;
}

async function markLocal(ws: string, platform: string, orderId: string, status: string, extra: Record<string, unknown> = {}) {
  const sb = getAdminSupabase();
  const { data } = await sb.from("marketplace_orders").select("raw").eq("workspace_id", ws).eq("platform", platform).eq("external_order_id", orderId).maybeSingle();
  await sb
    .from("marketplace_orders")
    .update({ status, raw: { ...((data?.raw as object) ?? {}), ...extra } })
    .eq("workspace_id", ws)
    .eq("platform", platform)
    .eq("external_order_id", orderId);
}

// ───────────────────────────── Shopee
interface ShippingParam {
  response?: {
    info_needed?: { dropoff?: string[] | null; pickup?: string[] | null; non_integrated?: string[] | null };
    dropoff?: { branch_list?: { branch_id: number }[] } | null;
  };
}

/** Shopee: arrange drop-off for each order (logistics.get_shipping_parameter → logistics.ship_order). */
export async function shipShopee(ws: string, orderSns: string[]): Promise<ShipResult[]> {
  const cfg = requireShopeeConfig();
  const row = await connection(ws, "shopee");
  const shopId = Number(row.shop_id);
  const token = await shopeeToken(cfg, row);
  const out: ShipResult[] = [];
  for (const sn of orderSns) {
    try {
      const p = await shopGet<ShippingParam>(cfg, "/api/v2/logistics/get_shipping_parameter", { order_sn: sn }, token, shopId);
      const need = p.response?.info_needed?.dropoff;
      if (!Array.isArray(need)) {
        out.push({ orderId: sn, ok: false, message: "Drop-off isn't offered for this order's courier — arrange it in Seller Centre." });
        continue;
      }
      const missing = need.filter((f) => f !== "branch_id" || !(p.response?.dropoff?.branch_list ?? []).length);
      if (missing.length) {
        out.push({ orderId: sn, ok: false, message: `Shopee needs extra drop-off details (${missing.join(", ")}) — arrange this one in Seller Centre.` });
        continue;
      }
      const dropoff: Record<string, unknown> = {};
      if (need.includes("branch_id")) dropoff.branch_id = p.response!.dropoff!.branch_list![0].branch_id;
      await shopPost(cfg, "/api/v2/logistics/ship_order", { order_sn: sn, dropoff }, token, shopId);
      await markLocal(ws, "shopee", sn, "PROCESSED", { arranged: "dropoff", arranged_at: new Date().toISOString() });
      out.push({ orderId: sn, ok: true, message: "Drop-off arranged" });
    } catch (e) {
      out.push({ orderId: sn, ok: false, message: errText(e) });
    }
  }
  return out;
}

/** Shopee: air waybill PDF for orders that are already arranged (create → poll → download). */
export async function labelsShopee(ws: string, orderSns: string[]): Promise<ArrayBuffer> {
  const cfg = requireShopeeConfig();
  const row = await connection(ws, "shopee");
  const shopId = Number(row.shop_id);
  const token = await shopeeToken(cfg, row);
  const list: { order_sn: string; tracking_number: string }[] = [];
  const problems: string[] = [];
  for (const sn of orderSns.slice(0, 50)) {
    let tn = "";
    for (let i = 0; i < 3 && !tn; i++) {
      const r = await shopGet<{ response?: { tracking_number?: string } }>(cfg, "/api/v2/logistics/get_tracking_number", { order_sn: sn }, token, shopId);
      tn = r.response?.tracking_number ?? "";
      if (!tn) await sleep(1500);
    }
    if (tn) list.push({ order_sn: sn, tracking_number: tn });
    else problems.push(sn);
  }
  if (!list.length) throw new HttpError(409, `No tracking number yet for ${problems.join(", ")} — arrange the shipment first, or wait a minute and try again.`);
  const type = "NORMAL_AIR_WAYBILL";
  await shopPost(cfg, "/api/v2/logistics/create_shipping_document", { order_list: list, shipping_document_type: type }, token, shopId);
  for (let i = 0; i < 8; i++) {
    const r = await shopPost<{ response?: { result_list?: { order_sn: string; status: string; fail_message?: string }[] } }>(
      cfg,
      "/api/v2/logistics/get_shipping_document_result",
      { order_list: list.map((o) => ({ order_sn: o.order_sn })), shipping_document_type: type },
      token,
      shopId,
    );
    const res = r.response?.result_list ?? [];
    const failed = res.find((x) => x.status === "FAILED");
    if (failed) throw new HttpError(502, `Shopee couldn't create the label for ${failed.order_sn}: ${failed.fail_message ?? "unknown reason"}`);
    if (res.length && res.every((x) => x.status === "READY")) break;
    await sleep(1500);
  }
  return shopPostFile(cfg, "/api/v2/logistics/download_shipping_document", { shipping_document_type: type, order_list: list.map((o) => ({ order_sn: o.order_sn })) }, token, shopId);
}

// ───────────────────────────── Lazada
interface LzItem {
  order_item_id: number | string;
  status?: string;
  package_id?: string;
  tracking_code?: string;
}

async function lazadaItems(cfg: ReturnType<typeof requireLazadaConfig>, token: string, orderId: string) {
  const d = await lazadaGet<{ order_id: number | string; order_items: LzItem[] }[]>(cfg, "/orders/items/get", { order_ids: JSON.stringify([Number(orderId)]) }, token);
  return d?.[0]?.order_items ?? [];
}

const lzOk = (code: unknown) => code === undefined || code === null || String(code) === "0" || code === "";

/** Lazada: pack (drop-ship) then ready-to-ship each order (/order/fulfill/pack → /order/package/rts). */
export async function shipLazada(ws: string, orderIds: string[]): Promise<ShipResult[]> {
  const cfg = requireLazadaConfig();
  const row = await connection(ws, "lazada");
  const token = await lazadaToken(cfg, row);
  const out: ShipResult[] = [];
  for (const id of orderIds) {
    try {
      const items = await lazadaItems(cfg, token, id);
      const toPack = items.filter((i) => ["pending", "repacked"].includes(String(i.status).toLowerCase()));
      let packages = [...new Set(items.filter((i) => String(i.status).toLowerCase() === "packed" && i.package_id).map((i) => String(i.package_id)))];
      let tracking: string | null = items.find((i) => i.tracking_code)?.tracking_code ?? null;
      if (toPack.length) {
        const r = await lazadaPost<{ pack_order_list?: { order_item_list?: { order_item_id: number; package_id?: string; tracking_number?: string; item_err_code?: string; msg?: string }[] }[] }>(
          cfg,
          "/order/fulfill/pack",
          {
            packReq: JSON.stringify({
              pack_order_list: [{ order_id: Number(id), order_item_list: toPack.map((i) => Number(i.order_item_id)) }],
              delivery_type: "dropship",
              shipping_allocate_type: "TFS",
            }),
          },
          token,
        );
        const lines = (r.data?.pack_order_list ?? []).flatMap((o) => o.order_item_list ?? []);
        const bad = lines.find((l) => !lzOk(l.item_err_code));
        if (bad) throw new LazadaError(String(bad.item_err_code), bad.msg || "Packing failed");
        packages = [...new Set([...packages, ...lines.map((l) => l.package_id).filter((x): x is string => !!x)])];
        tracking = lines.find((l) => l.tracking_number)?.tracking_number ?? tracking;
      }
      if (!packages.length) {
        out.push({ orderId: id, ok: false, message: "Nothing to pack (already ready to ship, or cancelled)." });
        continue;
      }
      const rts = await lazadaPost<{ packages?: { package_id: string; item_err_code?: string; msg?: string }[] }>(
        cfg,
        "/order/package/rts",
        { readyToShipReq: JSON.stringify({ packages: packages.map((p) => ({ package_id: p })) }) },
        token,
      );
      const bad = (rts.data?.packages ?? []).find((p) => !lzOk(p.item_err_code));
      if (bad) throw new LazadaError(String(bad.item_err_code), bad.msg || "Ready-to-ship failed");
      await markLocal(ws, "lazada", id, "READY_TO_SHIP", { packages, tracking, arranged: "dropoff", arranged_at: new Date().toISOString() });
      out.push({ orderId: id, ok: true, message: "Packed & ready to ship", tracking });
    } catch (e) {
      out.push({ orderId: id, ok: false, message: errText(e) });
    }
  }
  return out;
}

/** Lazada: AWB / shipping label PDF for packed orders. */
export async function labelsLazada(ws: string, orderIds: string[]): Promise<ArrayBuffer> {
  const cfg = requireLazadaConfig();
  const row = await connection(ws, "lazada");
  const token = await lazadaToken(cfg, row);
  const packages: string[] = [];
  const itemIds: number[] = [];
  for (const id of orderIds.slice(0, 20)) {
    const items = await lazadaItems(cfg, token, id);
    for (const i of items) {
      if (i.package_id) packages.push(String(i.package_id));
      itemIds.push(Number(i.order_item_id));
    }
  }
  const uniq = [...new Set(packages)];
  if (!uniq.length) throw new HttpError(409, "These Lazada orders aren't packed yet — arrange the shipment first.");
  // current API: package document (returns a PDF link or a base64 file)
  try {
    const r = await lazadaPost<{ pdf_url?: string; file?: string; url?: string }>(
      cfg,
      "/order/package/document/get",
      { getDocumentReq: JSON.stringify({ doc_type: "PDF", packages: uniq.map((p) => ({ package_id: p })), print_item_list: true }) },
      token,
    );
    const link = r.data?.pdf_url ?? r.data?.url;
    if (link) {
      const res = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res.arrayBuffer();
    }
    if (r.data?.file) return new Uint8Array(Buffer.from(r.data.file, "base64")).buffer;
  } catch (e) {
    if (!(e instanceof LazadaError)) throw e;
  }
  // older API: AWB PDF by order item ids
  const d = await lazadaGet<{ document?: { file?: string } }>(cfg, "/order/document/awb/pdf/get", { order_item_ids: JSON.stringify(itemIds) }, token);
  if (!d?.document?.file) throw new HttpError(502, "Lazada didn't return a label file.");
  return new Uint8Array(Buffer.from(d.document.file, "base64")).buffer;
}
