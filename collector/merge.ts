import type { Coupon, CouponFeed, CouponSource } from '../lib/coupons.ts';
import type { StoreId } from '../lib/stores.ts';
import type { RawCoupon } from './sources/types.ts';

/** Resultado de uma fonte numa loja: os cupons, ou o erro se a página falhou. */
export interface SourceResult {
  source: CouponSource;
  store: StoreId;
  coupons: RawCoupon[];
  error?: string;
}

const key = (store: StoreId, code: string) => `${store}:${code}`;

/**
 * Junta os cupons de todas as fontes numa lista só, sem repetir.
 * - Mesmo código na mesma loja vira um cupom só, com todas as fontes listadas.
 * - Se uma fonte falhou, mantém os cupons que ela tinha trazido da última vez (se ainda valem).
 * - Remove cupons vencidos.
 */
export function mergeCoupons(results: SourceResult[], previous: Coupon[], now: Date): Coupon[] {
  const nowIso = now.toISOString();
  const previousByKey = new Map(previous.map((c) => [key(c.store, c.code), c]));
  const merged = new Map<string, Coupon>();

  const add = (store: StoreId, source: CouponSource, raw: RawCoupon) => {
    const k = key(store, raw.code);
    const existing = merged.get(k);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.title) existing.title = raw.title;
      if (!existing.discount) existing.discount = raw.discount;
      if (!existing.terms && raw.terms) existing.terms = raw.terms;
      // Se as fontes discordam da validade, fica a mais longa (a extensão testa de qualquer jeito).
      if (raw.expiresAt && (!existing.expiresAt || raw.expiresAt > existing.expiresAt)) existing.expiresAt = raw.expiresAt;
      return;
    }
    merged.set(k, {
      store,
      code: raw.code,
      title: raw.title,
      discount: raw.discount,
      expiresAt: raw.expiresAt,
      ...(raw.terms && { terms: raw.terms }),
      sources: [source],
      firstSeen: previousByKey.get(k)?.firstSeen ?? nowIso,
    });
  };

  for (const result of results) {
    if (result.error) {
      // A página falhou: reaproveita o que essa fonte tinha trazido antes para essa loja.
      for (const old of previous) {
        if (old.store === result.store && old.sources.includes(result.source)) add(old.store, result.source, old);
      }
      continue;
    }
    for (const raw of result.coupons) add(result.store, result.source, raw);
  }

  return [...merged.values()]
    .filter((c) => !c.expiresAt || c.expiresAt > nowIso)
    .map((c) => ({ ...c, sources: [...c.sources].sort() }))
    .sort(
      (a, b) =>
        a.store.localeCompare(b.store) || b.sources.length - a.sources.length || a.code.localeCompare(b.code),
    );
}

/** Monta o arquivo final. Só troca updatedAt se a lista de cupons mudou de verdade. */
export function buildFeed(coupons: Coupon[], previous: CouponFeed | null, now: Date): CouponFeed {
  const unchanged = previous && JSON.stringify(previous.coupons) === JSON.stringify(coupons);
  return { version: 1, updatedAt: unchanged ? previous.updatedAt : now.toISOString(), coupons };
}
