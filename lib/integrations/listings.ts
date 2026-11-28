import "server-only";
import { HttpError } from "@/lib/ai/server/guard";
import { listIntegrations, type IntegrationRow } from "./store";
import { requireShopeeConfig, shopGet, shopPost, ShopeeError } from "./shopee/api";
import { validToken as shopeeToken } from "./shopee/sync";
import { lazadaGet, lazadaPost, LazadaError, requireLazadaConfig } from "./lazada/api";
import { validToken as lazadaToken } from "./lazada/sync";

/** One sellable variation of a listing, with its price. */
export interface Listing {
  platform: "shopee" | "lazada";
  /** Shopee item_id / Lazada item_id */
  itemId: string;
  /** Shopee model_id (0 = no variations) / Lazada SkuId */
  variantId: string;
  name: string;
  variation: string;
  sku: string | null;
  /** the normal price you set, RM */
  price: number;
  /** what buyers pay right now (a discount or promotion can make it lower), RM */
  current: number;
}

const errText = (e: unknown) => (e instanceof ShopeeError || e instanceof LazadaError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e));
const permHint = (platform: string, e: unknown) => {
  const t = errText(e);
  return /permission|access|auth|scope|not.?allowed|forbidden|denied|invalid_api|api_suspended/i.test(t)
    ? `${platform} didn't allow reading products (${t}). Turn on the Product permission for your app in the ${platform} Open Platform, then re-connect ${platform} in Settings → Integrations.`
    : `${platform}: ${t}`;
};

async function connection(ws: string, provider: "shopee" | "lazada"): Promise<IntegrationRow | null> {
  const [row] = await listIntegrations(ws, provider);
  return row && row.status !== "expired" ? row : null;
}

// ───────────── Shopee
interface PriceInfo {
  current_price?: number;
  original_price?: number;
}
export async function shopeeListings(ws: string): Promise<Listing[]> {
  const row = await connection(ws, "shopee");
  if (!row) return [];
  const cfg = requireShopeeConfig();
  const shopId = Number(row.shop_id);
  const token = await shopeeToken(cfg, row);
  try {
    const ids: number[] = [];
    for (let offset = 0, i = 0; i < 20; i++) {
      const r = await shopGet<{ response?: { item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number } }>(cfg, "/api/v2/product/get_item_list", { offset, page_size: 100, item_status: "NORMAL" }, token, shopId);
      ids.push(...(r.response?.item ?? []).map((x) => x.item_id));
      if (!r.response?.has_next_page) break;
      offset = r.response.next_offset ?? offset + 100;
    }
    const out: Listing[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const r = await shopGet<{ response?: { item_list?: { item_id: number; item_name: string; item_sku?: string; has_model?: boolean; price_info?: PriceInfo[] }[] } }>(
        cfg,
        "/api/v2/product/get_item_base_info",
        { item_id_list: ids.slice(i, i + 50).join(",") },
        token,
        shopId,
      );
      for (const it of r.response?.item_list ?? []) {
        if (!it.has_model) {
          const p = it.price_info?.[0];
          out.push({ platform: "shopee", itemId: String(it.item_id), variantId: "0", name: it.item_name, variation: "", sku: it.item_sku || null, price: Number(p?.original_price ?? 0), current: Number(p?.current_price ?? p?.original_price ?? 0) });
          continue;
        }
        const m = await shopGet<{
          response?: { tier_variation?: { name?: string; option_list?: { option?: string }[] }[]; model?: { model_id: number; model_sku?: string; model_name?: string; tier_index?: number[]; price_info?: PriceInfo[] }[] };
        }>(cfg, "/api/v2/product/get_model_list", { item_id: it.item_id }, token, shopId);
        const tiers = m.response?.tier_variation ?? [];
        for (const md of m.response?.model ?? []) {
          const label = md.model_name || (md.tier_index ?? []).map((ix, t) => tiers[t]?.option_list?.[ix]?.option ?? "").filter(Boolean).join(",");
          const p = md.price_info?.[0];
          out.push({ platform: "shopee", itemId: String(it.item_id), variantId: String(md.model_id), name: it.item_name, variation: label, sku: md.model_sku || it.item_sku || null, price: Number(p?.original_price ?? 0), current: Number(p?.current_price ?? p?.original_price ?? 0) });
        }
      }
    }
    return out;
  } catch (e) {
    throw new HttpError(502, permHint("Shopee", e));
  }
}

/** Shopee: set the normal price of one listing's variations (product.update_price). */
export async function updateShopeePrices(ws: string, itemId: string, prices: { variantId: string; price: number }[]) {
  const row = await connection(ws, "shopee");
  if (!row) throw new HttpError(409, "Shopee isn't connected.");
  const cfg = requireShopeeConfig();
  const shopId = Number(row.shop_id);
  const token = await shopeeToken(cfg, row);
  const r = await shopPost<{ response?: { failure_list?: { model_id?: number; failed_reason?: string }[] }; error?: string; message?: string }>(
    cfg,
    "/api/v2/product/update_price",
    { item_id: Number(itemId), price_list: prices.map((p) => ({ model_id: Number(p.variantId), original_price: p.price })) },
    token,
    shopId,
  );
  return (r.response?.failure_list ?? []).map((f) => ({ variantId: String(f.model_id ?? 0), reason: f.failed_reason ?? "refused" }));
}

// ───────────── Lazada
interface LzSku {
  SkuId?: number | string;
  SellerSku?: string;
  price?: number | string;
  special_price?: number | string;
  special_from_time?: string;
  special_to_time?: string;
  saleProp?: Record<string, string>;
  [k: string]: unknown;
}
const LZ_SKIP = /^(SkuId|SellerSku|ShopSku|price|special_price|quantity|Available|Status|Images|Url|package_.*|special_.*|fulfillment.*|multiWarehouseInventories|.*Stock.*|.*_time|saleProp|tax_class|barcode_ean|seller_promotion)$/i;
function lzVariation(s: LzSku) {
  if (s.saleProp && Object.keys(s.saleProp).length) return Object.values(s.saleProp).join(",");
  return Object.entries(s)
    .filter(([k, v]) => !LZ_SKIP.test(k) && typeof v === "string" && v.length < 40)
    .map(([, v]) => v as string)
    .join(",");
}
function lzSpecialActive(s: LzSku) {
  const sp = Number(s.special_price);
  if (!(sp > 0)) return false;
  const now = Date.now();
  const from = s.special_from_time ? Date.parse(String(s.special_from_time).replace(" ", "T") + "+08:00") : 0;
  const to = s.special_to_time ? Date.parse(String(s.special_to_time).replace(" ", "T") + "+08:00") : Infinity;
  return (Number.isNaN(from) || now >= from) && (Number.isNaN(to) || now <= to);
}
export async function lazadaListings(ws: string): Promise<Listing[]> {
  const row = await connection(ws, "lazada");
  if (!row) return [];
  const cfg = requireLazadaConfig();
  const token = await lazadaToken(cfg, row);
  try {
    const out: Listing[] = [];
    for (let offset = 0; offset < 2000; offset += 50) {
      const d = await lazadaGet<{ products?: { item_id: number | string; attributes?: { name?: string }; skus?: LzSku[] }[]; total_products?: number }>(cfg, "/products/get", { filter: "live", offset, limit: 50 }, token);
      const list = d?.products ?? [];
      for (const p of list)
        for (const s of p.skus ?? []) {
          const price = Number(s.price ?? 0);
          out.push({
            platform: "lazada",
            itemId: String(p.item_id),
            variantId: String(s.SkuId ?? ""),
            name: p.attributes?.name ?? "",
            variation: lzVariation(s),
            sku: s.SellerSku || null,
            price,
            current: lzSpecialActive(s) ? Number(s.special_price) : price,
          });
        }
      if (list.length < 50) break;
    }
    return out;
  } catch (e) {
    throw new HttpError(502, permHint("Lazada", e));
  }
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
/** Lazada: set the normal price of SKUs (/product/price_quantity/update). */
export async function updateLazadaPrices(ws: string, items: { itemId: string; variantId: string; sku: string | null; price: number }[]) {
  const row = await connection(ws, "lazada");
  if (!row) throw new HttpError(409, "Lazada isn't connected.");
  const cfg = requireLazadaConfig();
  const token = await lazadaToken(cfg, row);
  const skus = items
    .map((i) => `<Sku><ItemId>${xml(i.itemId)}</ItemId><SkuId>${xml(i.variantId)}</SkuId>${i.sku ? `<SellerSku>${xml(i.sku)}</SellerSku>` : ""}<Price>${i.price.toFixed(2)}</Price></Sku>`)
    .join("");
  await lazadaPost(cfg, "/product/price_quantity/update", { payload: `<Request><Product><Skus>${skus}</Skus></Product></Request>` }, token);
}

export { errText as listingError };
