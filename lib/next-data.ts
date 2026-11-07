import type { SearchHit } from './product-match';

/**
 * Plano B para lojas feitas em Next.js (Magalu): a lista de produtos já vem num JSON
 * dentro do HTML (<script id="__NEXT_DATA__">), mesmo quando a aba de fundo não desenha a página.
 * Procura no JSON qualquer objeto com título, preço e endereço de produto. Texto puro, sem DOM.
 */
export function hitsFromNextData(html: string, origin: string, productLink: RegExp, max = 24): SearchHit[] {
  const raw = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 14 || hits.length >= max) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const o = node as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : null;
    const path = [o.url, o.path, o.link, o.href].find((v): v is string => typeof v === 'string');
    const price = priceOf(o.price) ?? priceOf(o.prices) ?? priceOf(o.offers);
    if (title && path && price) {
      const url = /^https?:/.test(path) ? path : `${origin}/${path.replace(/^\/+/, '')}`;
      if (productLink.test(url) && !seen.has(url)) {
        seen.add(url);
        hits.push({ title: title.trim(), price, url });
        return;
      }
    }
    for (const value of Object.values(o)) walk(value, depth + 1);
  };
  walk(data, 0);
  return hits;
}

/** Preço "valendo": o menor entre bestPrice (Pix/à vista) e price. Preço antigo (fullPrice, original...) fica de fora. */
function priceOf(value: unknown): number | null {
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (typeof value === 'number' || typeof value === 'string') return num(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const prices = ['bestPrice', 'price', 'value', 'salePrice', 'lowPrice'].map((k) => num(o[k])).filter((n): n is number => n !== null);
  return prices.length ? Math.min(...prices) : null;
}
