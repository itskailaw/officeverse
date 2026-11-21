/** Turning marketplace listing titles into names a packer can read at a glance (pure, unit-tested). */

/** The variation the buyer picked, without "Color Family:" / "Variation3:" style prefixes ("" if none). */
export function variationOf(model: string | null | undefined) {
  return (model ?? "")
    .split(/\s*[,;]\s*(?=[A-Za-z][\w ]{0,24}:)/)
    .map((part) => part.replace(/^[A-Za-z][\w ]{0,24}:\s*/, "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * A short product name from a long listing title: drops the brand and the keyword padding after "/", "|",
 * "(" or a Chinese/Malay repeat, and cuts at a word boundary.
 */
export function shortProduct(title: string, max = 30) {
  let t = title
    .replace(/\bMDBC\b/gi, " ")
    .split(/\s[/|]\s|[|(（]|\s-\s/)[0]
    .replace(/[㐀-鿿].*$/, "") // Chinese repeat of the title
    .replace(/\s+/g, " ")
    .trim();
  if (!t) t = title.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[\s,.-]+$/, "") + "…";
}

export interface PickItem {
  name: string;
  model: string | null;
  qty: number;
}
export interface PickGroup {
  product: string;
  total: number;
  lines: { variation: string; qty: number }[];
}

/** Pick list grouped by product, variations merged and sorted by quantity. */
export function pickList(items: PickItem[]): PickGroup[] {
  const groups = new Map<string, Map<string, number>>();
  for (const i of items) {
    const p = shortProduct(i.name);
    const v = variationOf(i.model) || "—";
    const g = groups.get(p) ?? new Map<string, number>();
    g.set(v, (g.get(v) ?? 0) + i.qty);
    groups.set(p, g);
  }
  return [...groups.entries()]
    .map(([product, g]) => ({
      product,
      total: [...g.values()].reduce((a, b) => a + b, 0),
      lines: [...g.entries()].map(([variation, qty]) => ({ variation, qty })).sort((a, b) => b.qty - a.qty || a.variation.localeCompare(b.variation)),
    }))
    .sort((a, b) => b.total - a.total || a.product.localeCompare(b.product));
}
