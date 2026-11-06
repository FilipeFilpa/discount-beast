import { cleanCode, discountFrom, toIso } from '../util.ts';
import type { RawCoupon, Source } from './types.ts';

/** Campos que usamos de cada cupom no JSON do Promobit. */
interface PromobitCoupon {
  couponCode?: string;
  couponTitle?: string;
  couponDiscountShort?: string;
  couponStatusName?: string;
  couponUntil?: string | null;
  storeSlug?: string;
  visibility?: string;
}

const SLUGS = {
  adidas: 'adidas',
  netshoes: 'netshoes',
  centauro: 'centauro',
  amazon: 'amazon',
  mercadolivre: 'mercado-livre',
  magalu: 'magazine-luiza',
  aliexpress: 'aliexpress',
  shopee: 'shopee',
} as const;

/**
 * Promobit é feito em Next.js: a página traz os cupons num JSON
 * dentro de <script id="__NEXT_DATA__">, em props.pageProps.serverCoupons.coupons.
 */
export const promobit: Source = {
  id: 'promobit',
  urls: Object.fromEntries(
    Object.entries(SLUGS).map(([store, slug]) => [store, `https://www.promobit.com.br/cupons/loja/${slug}/`]),
  ),
  parse(html, store) {
    const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!json) throw new Error('Promobit: __NEXT_DATA__ não encontrado (o site mudou?)');
    const list: PromobitCoupon[] | undefined = JSON.parse(json)?.props?.pageProps?.serverCoupons?.coupons;
    if (!Array.isArray(list)) throw new Error('Promobit: lista serverCoupons.coupons não encontrada (o site mudou?)');

    const slug = SLUGS[store];
    const coupons: RawCoupon[] = [];
    for (const c of list) {
      const code = cleanCode(c.couponCode);
      if (!code || c.storeSlug !== slug) continue;
      if (c.couponStatusName !== 'APPROVED' || (c.visibility && c.visibility !== 'ALL')) continue;
      const title = (c.couponTitle ?? '').trim();
      coupons.push({
        code,
        title,
        discount: (c.couponDiscountShort ?? '').trim() || discountFrom(title),
        expiresAt: toIso(c.couponUntil),
      });
    }
    return coupons;
  },
};
