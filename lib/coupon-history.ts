import { browser } from 'wxt/browser';
import type { PastResult, TryResult } from './coupon-runner';
import type { StoreId } from './stores';

/** Guarda no storage.local (só no seu Chrome) o que cada código fez da última vez. */
type History = Partial<Record<StoreId, Record<string, PastResult>>>;

export async function getCouponHistory(store: StoreId): Promise<Record<string, PastResult>> {
  const { couponHistory } = (await browser.storage.local.get('couponHistory')) as { couponHistory?: History };
  return couponHistory?.[store] ?? {};
}

export async function saveCouponResults(store: StoreId, results: TryResult[]): Promise<void> {
  const { couponHistory = {} } = (await browser.storage.local.get('couponHistory')) as { couponHistory?: History };
  const at = Date.now();
  const mine = { ...couponHistory[store] };
  for (const r of results) mine[r.code] = { status: r.status, saving: r.saving, at };
  await browser.storage.local.set({ couponHistory: { ...couponHistory, [store]: mine } });
}
