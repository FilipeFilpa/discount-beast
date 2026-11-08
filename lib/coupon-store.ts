import { browser } from 'wxt/browser';
import { COUPONS_URL, type Coupon, type CouponFeed } from './coupons';
import type { StoreId } from './stores';

/** De quanto em quanto tempo a extensão baixa a lista de novo. O coletor roda a cada 3 h. */
export const REFRESH_MINUTES = 3 * 60;

interface Saved {
  couponFeed?: CouponFeed;
  couponFetchedAt?: number;
}

/** Baixa o data/coupons.json do GitHub e guarda no storage da extensão. */
export async function refreshCoupons(): Promise<CouponFeed> {
  const res = await fetch(COUPONS_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Não consegui baixar os cupons (HTTP ${res.status})`);
  const feed = (await res.json()) as CouponFeed;
  await browser.storage.local.set({ couponFeed: feed, couponFetchedAt: Date.now() } satisfies Saved);
  return feed;
}

/** Lê a lista guardada. Se ainda não tem ou está velha, baixa de novo (e usa a velha se a internet falhar). */
export async function getCouponFeed(): Promise<CouponFeed | null> {
  const saved = (await browser.storage.local.get(['couponFeed', 'couponFetchedAt'])) as Saved;
  const fresh = saved.couponFetchedAt && Date.now() - saved.couponFetchedAt < REFRESH_MINUTES * 60_000;
  if (saved.couponFeed && fresh) return saved.couponFeed;
  try {
    return await refreshCoupons();
  } catch {
    return saved.couponFeed ?? null;
  }
}

/** Cupons de uma loja, sem os vencidos, com os confirmados por mais sites primeiro. */
export function couponsFor(feed: CouponFeed | null, store: StoreId): Coupon[] {
  const now = new Date().toISOString();
  return (feed?.coupons ?? []).filter((c) => c.store === store && (!c.expiresAt || c.expiresAt > now));
}
