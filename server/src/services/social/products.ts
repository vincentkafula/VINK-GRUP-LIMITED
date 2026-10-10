/**
 * The products of Ballylife (a VINK Group company), read from its online shop so new ones can be announced. BALLYLIFE_FEED_URL points at the shop's product list:
 *   Shopify        https://shop.example/products.json
 *   WooCommerce    https://shop.example/wp-json/wc/store/v1/products
 *   anything else  a JSON list of { id, title | name, price, url | link, image | image_url, description }
 * BALLYLIFE_SITE_URL (default https://www.ballylife.com) is where a product's link points when the feed gives only a handle.
 */
export interface Product { id: string; title: string; price: string; url: string; imageUrl: string | null; description: string }

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, max) : "");
const https = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v.trim()) ? v.trim() : null);
const abs = (v: unknown) => { const s = typeof v === "string" ? v.trim() : ""; return s.startsWith("//") ? `https:${s}` : s; };

export function parseProducts(body: unknown, site: string): Product[] {
  const root = site.replace(/\/+$/, "");
  const list: unknown[] = Array.isArray(body) ? body : Array.isArray((body as { products?: unknown })?.products) ? (body as { products: unknown[] }).products : [];
  const out: Product[] = [];
  for (const raw of list) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const id = String(p.id ?? p.sku ?? "").trim(); const title = str(p.title ?? p.name, 150);
    if (!id || !title) continue;
    const variants = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
    const images = Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : [];
    const prices = (p.prices ?? null) as { price?: unknown; currency_minor_unit?: unknown; currency_code?: unknown } | null;
    let price = "";
    if (prices?.price !== undefined) { const minor = Number(prices.currency_minor_unit ?? 2); price = `${String(prices.currency_code ?? "R")} ${(Number(prices.price) / Math.pow(10, minor)).toFixed(minor)}`.replace(/^ZAR /, "R "); }
    else if (variants[0]?.price !== undefined) price = `R ${Number(variants[0].price).toFixed(2)}`;
    else if (p.price !== undefined && p.price !== "") price = /^[0-9.]+$/.test(String(p.price)) ? `R ${Number(p.price).toFixed(2)}` : str(p.price, 30);
    const url = https(p.url) ?? https(p.permalink) ?? https(p.link) ?? (p.handle ? `${root}/products/${encodeURIComponent(String(p.handle))}` : root);
    const imageUrl = https(abs(images[0]?.src ?? images[0]?.url ?? p.image ?? p.image_url ?? (p.image as { src?: unknown } | undefined)?.src));
    out.push({ id, title, price, url, imageUrl, description: str(p.body_html ?? p.short_description ?? p.description, 200) });
  }
  return out;
}

export async function fetchProducts(feedUrl: string, site: string, fetchImpl: typeof fetch = fetch): Promise<Product[]> {
  const res = await fetchImpl(feedUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The Ballylife product list answered ${res.status}`);
  return parseProducts(await res.json(), site);
}

/** The announcement for one product. It says plainly that Ballylife is part of VINK Group. */
export function productPost(p: Product): { text: string; link: string; imageUrl: string | null } {
  const price = p.price ? ` ${p.price}.` : "";
  return { text: `New at Ballylife, a VINK Group company: ${p.title}.${price}${p.description ? ` ${p.description.slice(0, 120)}` : ""}`.replace(/\.\./g, "."), link: p.url, imageUrl: p.imageUrl };
}
