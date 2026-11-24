import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { listIntegrations, type IntegrationRow } from "./store";
import { requireShopeeConfig, shopGet, shopPost, shopPostFile, ShopeeError } from "./shopee/api";
import { validToken as shopeeToken } from "./shopee/sync";
import { lazadaGet, lazadaPost, LazadaError, requireLazadaConfig } from "./lazada/api";
import { validToken as lazadaToken } from "./lazada/sync";
export { sortByOrderId } from "./pdf-order";
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

export interface LabelResult {
  pdf: ArrayBuffer;
  /** Lazada sometimes sends the label as a printable web page instead of a PDF */
  kind?: "pdf" | "html";
  /** orders that couldn't be printed, with Shopee's reason */
  problems: string[];
  /** orders in the order their labels appear in the file */
  sequence?: LabelSeq[];
}
export interface LabelSeq {
  id: string;
  tracking: string | null;
}

/** Run fn over items with at most n at a time. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

interface DocResult {
  order_sn: string;
  status?: string;
  fail_error?: string;
  fail_message?: string;
  suggest_shipping_document_type?: string;
  selectable_shipping_document_type?: string[];
}

/** Merge several PDFs into one (labels for different couriers come back separately). */
export async function mergePdfs(parts: ArrayBuffer[]): Promise<ArrayBuffer> {
  if (parts.length === 1) return parts[0];
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const p of parts) {
    const doc = await PDFDocument.load(p);
    for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
  }
  const bytes = await out.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Shopee: air waybill PDF for arranged orders.
 * Flow: tracking number → which label type the courier allows (get_shipping_document_parameter)
 * → create_shipping_document → wait until READY → download_shipping_document, per label type.
 */
export async function labelsShopee(ws: string, orderSns: string[]): Promise<LabelResult> {
  const cfg = requireShopeeConfig();
  const row = await connection(ws, "shopee");
  const shopId = Number(row.shop_id);
  const token = await shopeeToken(cfg, row);
  const problems: string[] = [];
  const reason = (r: DocResult) => `${r.order_sn}: ${r.fail_message || r.fail_error || "not ready"}`;

  // 1. tracking numbers (only exist once the shipment is arranged)
  const list: { order_sn: string; tracking_number: string }[] = [];
  for (const sn of orderSns.slice(0, 50)) {
    let tn = "";
    for (let i = 0; i < 3 && !tn; i++) {
      const r = await shopGet<{ response?: { tracking_number?: string } }>(cfg, "/api/v2/logistics/get_tracking_number", { order_sn: sn }, token, shopId);
      tn = r.response?.tracking_number ?? "";
      if (!tn) await sleep(1500);
    }
    if (tn) list.push({ order_sn: sn, tracking_number: tn });
    else problems.push(`${sn}: no tracking number yet — arrange the shipment first, or try again in a minute`);
  }
  if (!list.length) throw new HttpError(409, problems.join(" · "));

  // 2. label type each order's courier supports
  const typeOf = new Map<string, string>();
  try {
    const r = await shopPost<{ response?: { result_list?: DocResult[] } }>(
      cfg,
      "/api/v2/logistics/get_shipping_document_parameter",
      { order_list: list.map((o) => ({ order_sn: o.order_sn })) },
      token,
      shopId,
    );
    for (const x of r.response?.result_list ?? []) {
      const t = x.suggest_shipping_document_type || x.selectable_shipping_document_type?.[0];
      if (t) typeOf.set(x.order_sn, t);
    }
  } catch {
    // older shops: fall back to the standard label
  }

  // 3. create → wait → download, one batch per label type
  const groups = new Map<string, typeof list>();
  for (const o of list) {
    const t = typeOf.get(o.order_sn) ?? "NORMAL_AIR_WAYBILL";
    groups.set(t, [...(groups.get(t) ?? []), o]);
  }
  const bundles: { sns: string[]; pdf: ArrayBuffer }[] = [];
  const single = new Map<string, ArrayBuffer>();
  for (const [type, batch] of groups) {
    const created = await shopPost<{ response?: { result_list?: DocResult[] } }>(
      cfg,
      "/api/v2/logistics/create_shipping_document",
      { order_list: batch, shipping_document_type: type },
      token,
      shopId,
    );
    // a label that was created before is fine — anything else is a real failure
    const failed = new Set(
      (created.response?.result_list ?? [])
        .filter((x) => x.fail_error && !/already|exist|created/i.test(`${x.fail_error} ${x.fail_message}`))
        .map((x) => {
          problems.push(reason(x));
          return x.order_sn;
        }),
    );
    let pending = batch.filter((o) => !failed.has(o.order_sn));
    const ready: string[] = [];
    for (let i = 0; i < 20 && pending.length; i++) {
      const r = await shopPost<{ response?: { result_list?: DocResult[] } }>(
        cfg,
        "/api/v2/logistics/get_shipping_document_result",
        { order_list: pending.map((o) => ({ order_sn: o.order_sn })), shipping_document_type: type },
        token,
        shopId,
      );
      for (const x of r.response?.result_list ?? []) {
        if (x.status === "READY") ready.push(x.order_sn);
        else if (x.status === "FAILED") problems.push(reason(x));
      }
      const done = new Set((r.response?.result_list ?? []).filter((x) => x.status === "READY" || x.status === "FAILED").map((x) => x.order_sn));
      pending = pending.filter((o) => !done.has(o.order_sn));
      if (pending.length) await sleep(1500);
    }
    for (const o of pending) problems.push(`${o.order_sn}: Shopee is still preparing the label — try again in a minute`);
    // keep the CEO's list order (e.g. oldest paid first) in the printed PDF
    ready.sort((a, b) => orderSns.indexOf(a) - orderSns.indexOf(b));
    if (!ready.length) continue;
    const download = (sns: string[]) =>
      shopPostFile(cfg, "/api/v2/logistics/download_shipping_document", { shipping_document_type: type, order_list: sns.map((sn) => ({ order_sn: sn })) }, token, shopId);
    // one label type → one bundled download keeps the list order; several types → per order, so the
    // merged PDF still follows the list exactly (the packing list numbers depend on it)
    if (groups.size === 1) {
      try {
        bundles.push({ sns: ready, pdf: await download(ready) });
        continue;
      } catch (e) {
        // Shopee refuses to bundle some packages (different courier / channel): fetch each one and merge ourselves
        if (!(e instanceof ShopeeError) || ready.length === 1) throw e;
      }
    }
    await pool(ready, 4, async (sn) => {
      try {
        single.set(sn, await download([sn]));
      } catch (one) {
        problems.push(`${sn}: ${one instanceof ShopeeError ? one.message : String(one)}`);
      }
    });
  }
  const sequence: LabelSeq[] = [];
  const parts: ArrayBuffer[] = [];
  const tn = new Map(list.map((o) => [o.order_sn, o.tracking_number]));
  for (const b of bundles) {
    parts.push(b.pdf);
    sequence.push(...b.sns.map((id) => ({ id, tracking: tn.get(id) ?? null })));
  }
  for (const sn of orderSns) {
    const pdf = single.get(sn);
    if (!pdf) continue;
    parts.push(pdf);
    sequence.push({ id: sn, tracking: tn.get(sn) ?? null });
  }
  if (!parts.length) throw new HttpError(502, `Shopee couldn't create the labels: ${problems.join(" · ")}`);
  return { pdf: await mergePdfs(parts), problems, sequence };
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

/** Lazada's newer fulfilment APIs answer { result: { success, data, error_code } }; older ones { data }. */
function lzPayload<T>(env: unknown): T | undefined {
  const e = env as { data?: T; result?: { success?: boolean | string; data?: T; error_code?: string; error_msg?: string } & T };
  if (e?.result && (e.result.success === false || e.result.success === "false")) {
    throw new LazadaError(String(e.result.error_code ?? "error"), String(e.result.error_msg ?? "Lazada request failed"));
  }
  return e?.data ?? e?.result?.data ?? (e?.result as T | undefined);
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
        const lines = (lzPayload<{ pack_order_list?: { order_item_list?: { order_item_id: number; package_id?: string; tracking_number?: string; item_err_code?: string; msg?: string }[] }[] }>(r)?.pack_order_list ?? []).flatMap((o) => o.order_item_list ?? []);
        if (!lines.length) throw new LazadaError("empty_reply", `Lazada didn't confirm the packing (reply: ${JSON.stringify(r).slice(0, 160)})`);
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
      const bad = (lzPayload<{ packages?: { package_id: string; item_err_code?: string; msg?: string }[] }>(rts)?.packages ?? []).find((p) => !lzOk(p.item_err_code));
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
export async function labelsLazada(ws: string, orderIds: string[]): Promise<LabelResult> {
  const cfg = requireLazadaConfig();
  const row = await connection(ws, "lazada");
  const token = await lazadaToken(cfg, row);
  const packages: string[] = [];
  const itemIds: number[] = [];
  const sequence: LabelSeq[] = [];
  for (const id of orderIds.slice(0, 20)) {
    const items = await lazadaItems(cfg, token, id);
    for (const i of items) {
      if (i.package_id) packages.push(String(i.package_id));
      itemIds.push(Number(i.order_item_id));
    }
    if (items.some((i) => i.package_id)) sequence.push({ id, tracking: items.find((i) => i.tracking_code)?.tracking_code ?? null });
  }
  const uniq = [...new Set(packages)];
  if (!uniq.length) throw new HttpError(409, "These Lazada orders aren't packed yet — arrange the shipment first.");
  // what kind of file did Lazada send?
  const asResult = (bytes: Uint8Array): LabelResult | null => {
    if (bytes.length < 50) return null;
    const head = Buffer.from(bytes.slice(0, 64)).toString("latin1").trimStart();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    if (head.startsWith("%PDF")) return { pdf: buf, kind: "pdf", problems: [], sequence };
    if (head.startsWith("<")) return { pdf: buf, kind: "html", problems: [], sequence };
    return null;
  };
  const fromDoc = async (doc: Record<string, unknown> | undefined): Promise<LabelResult | null> => {
    if (!doc) return null;
    const nested = (doc.document ?? doc.doc ?? doc) as Record<string, unknown>;
    const link = String(nested.pdf_url ?? nested.url ?? nested.file_url ?? "");
    if (/^https?:\/\//.test(link)) {
      const res = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const r = asResult(new Uint8Array(await res.arrayBuffer()));
        if (r) return r;
      }
    }
    const file = nested.file ?? nested.content;
    if (typeof file === "string" && file.length > 50) return asResult(new Uint8Array(Buffer.from(file, "base64")));
    return null;
  };

  let reply = "";
  // current API: package document (PDF link or base64 file)
  try {
    const env = await lazadaPost<unknown>(
      cfg,
      "/order/package/document/get",
      { getDocumentReq: JSON.stringify({ doc_type: "PDF", packages: uniq.map((p) => ({ package_id: p })), print_item_list: true }) },
      token,
    );
    const r = await fromDoc(lzPayload<Record<string, unknown>>(env));
    if (r) return r;
    reply = JSON.stringify(env).slice(0, 200);
  } catch (e) {
    if (!(e instanceof LazadaError)) throw e;
    reply = `${e.code}: ${e.message}`;
  }
  // older API: AWB by order item ids
  try {
    const d = await lazadaGet<Record<string, unknown>>(cfg, "/order/document/awb/pdf/get", { order_item_ids: JSON.stringify(itemIds) }, token);
    const r = await fromDoc(d);
    if (r) return r;
    reply += ` · ${JSON.stringify(d).slice(0, 160)}`;
  } catch (e) {
    if (!(e instanceof LazadaError)) throw e;
    reply += ` · ${e.code}: ${e.message}`;
  }
  throw new HttpError(502, `Lazada didn't send a label file. Lazada replied: ${reply}`);
}
