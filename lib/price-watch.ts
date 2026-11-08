import { browser } from 'wxt/browser';
import type { PriceReport } from './price-compare';
import type { PageProduct } from './product-match';
import type { StoreId } from './stores';

/**
 * "Avisar quando baixar": produtos que você marcou no cartão de preço.
 * Ficam no storage.sync (um item por produto, "watch.<id>"), então a lista e o menor preço visto
 * aparecem nos dois Chromes (Mac e Windows) e o aviso não se repete no outro computador.
 */

export interface SeenPrice {
  price: number;
  store: StoreId;
  storeName: string;
  url: string;
  /** Título do anúncio que deu esse preço (para você conferir se é mesmo o produto). */
  title: string;
  at: number;
}

export interface Watch {
  id: string;
  product: PageProduct;
  /** Loja onde você marcou o produto. */
  from: StoreId;
  addedAt: number;
  /** Menor preço visto desde que você marcou (o aviso só sai abaixo dele). */
  low: SeenPrice | null;
  /** Resultado da última conferência (o mais barato naquela hora). */
  last: SeenPrice | null;
  lastCheckAt: number;
  lastError?: string;
}

const PREFIX = 'watch.';
/** O storage.sync tem 100 KB no total (dividido com "Meus cupons"); cada produto ocupa ~1 KB. */
export const MAX_WATCHES = 30;
/** De quanto em quanto tempo confere os preços. */
export const WATCH_MINUTES = 6 * 60;
/** Se o outro computador conferiu há menos que isso, este pula o produto (não abre abas à toa). */
const RECHECK_MS = (WATCH_MINUTES - 30) * 60_000;
/** Queda mínima para avisar: ignora diferença de centavos (arredondamento das lojas). */
const MIN_DROP = 0.5;

/** Mesmo produto = mesma loja + mesmo endereço (sem ?parâmetros e #âncora). */
export function watchId(url: string): string {
  let key = url;
  try {
    const u = new URL(url);
    key = `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    // endereço estranho: usa como veio
  }
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

const keyOf = (id: string) => `${PREFIX}${id}`;

export function isWatchChange(changes: Record<string, unknown>, area: string): boolean {
  return area === 'sync' && Object.keys(changes).some((k) => k.startsWith(PREFIX));
}

export async function getWatches(): Promise<Watch[]> {
  const all = (await browser.storage.sync.get(null)) as Record<string, unknown>;
  return Object.entries(all)
    .filter(([key, value]) => key.startsWith(PREFIX) && value && typeof value === 'object')
    .map(([, value]) => value as Watch)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function getWatch(id: string): Promise<Watch | null> {
  const saved = (await browser.storage.sync.get(keyOf(id))) as Record<string, Watch | undefined>;
  return saved[keyOf(id)] ?? null;
}

export async function saveWatch(watch: Watch): Promise<void> {
  await browser.storage.sync.set({ [keyOf(watch.id)]: watch });
}

export async function removeWatch(id: string): Promise<void> {
  await browser.storage.sync.remove(keyOf(id));
}

/** Guarda só o necessário do produto (o sync aceita 8 KB por item). */
function slim(product: PageProduct): PageProduct {
  return {
    name: product.name.slice(0, 200),
    brand: product.brand?.slice(0, 60) ?? null,
    gtin: product.gtin,
    sku: product.sku,
    mpn: product.mpn ?? null,
    price: product.price,
    url: product.url.slice(0, 500),
  };
}

/** Cria o item da lista. O menor preço começa no preço da página (e no que o "Comparar" já achou). */
export function newWatch(product: PageProduct, from: StoreId, fromName: string, reports: PriceReport[] = [], now = Date.now()): Watch {
  const start: SeenPrice | null = product.price ? { price: product.price, store: from, storeName: fromName, url: product.url, title: product.name, at: now } : null;
  const found = cheapest(reports, now);
  const low = !start ? found : found && found.price < start.price ? found : start;
  return { id: watchId(product.url), product: slim(product), from, addedAt: now, low, last: null, lastCheckAt: 0 };
}

/** O mais barato entre as lojas que acharam o mesmo produto. */
export function cheapest(reports: PriceReport[], now = Date.now()): SeenPrice | null {
  let best: SeenPrice | null = null;
  for (const r of reports) {
    if (!r.match || !(r.match.price > 0)) continue;
    if (!best || r.match.price < best.price) {
      best = { price: r.match.price, store: r.store, storeName: r.storeName, url: r.match.url, title: r.match.title.slice(0, 200), at: now };
    }
  }
  return best;
}

/** Precisa conferir de novo? (O outro computador pode ter acabado de conferir.) */
export function isDue(watch: Watch, now = Date.now()): boolean {
  return now - watch.lastCheckAt >= RECHECK_MS;
}

/**
 * Junta o resultado de uma conferência ao item. Devolve o item novo e, se o preço caiu abaixo
 * do menor já visto, a queda (para o aviso).
 */
export function applyCheck(watch: Watch, reports: PriceReport[], now = Date.now()): { watch: Watch; drop: { from: number; to: SeenPrice } | null } {
  const found = cheapest(reports, now);
  const failed = reports.length > 0 && reports.every((r) => r.error);
  const next: Watch = { ...watch, last: found, lastCheckAt: now, lastError: failed ? reports[0]!.error : undefined };
  if (!next.lastError) delete next.lastError;
  if (!found) return { watch: next, drop: null };
  if (!watch.low) return { watch: { ...next, low: found }, drop: null };
  if (found.price <= watch.low.price - MIN_DROP) return { watch: { ...next, low: found }, drop: { from: watch.low.price, to: found } };
  return { watch: next, drop: null };
}
