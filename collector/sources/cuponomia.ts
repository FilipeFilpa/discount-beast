import { attr, cleanCode, decodeHtml, discountFrom, toIso } from '../util.ts';
import type { RawCoupon, Source } from './types.ts';

const SLUGS = {
  adidas: 'adidas',
  netshoes: 'netshoes',
  centauro: 'centauro',
  amazon: 'amazon',
  mercadolivre: 'mercado-livre',
  magalu: 'magazine-luiza',
} as const;

/**
 * Cuponomia lista cada oferta num <li class="item ..." data-type="code" data-store-slug="...">.
 * O código fica em <span class="item-code-link js-itemCode"> e o título em <h3 class="js-itemTitle">.
 */
export const cuponomia: Source = {
  id: 'cuponomia',
  urls: Object.fromEntries(
    Object.entries(SLUGS).map(([store, slug]) => [store, `https://www.cuponomia.com.br/desconto/${slug}`]),
  ),
  parse(html, store) {
    const slug = SLUGS[store];
    const coupons: RawCoupon[] = [];
    // Cada pedaço começa num <li class="item ..."> e vai até o próximo.
    for (const chunk of html.split(/(?=<li class="item )/).slice(1)) {
      const tag = chunk.slice(0, chunk.indexOf('>') + 1);
      if (attr(tag, 'data-type') !== 'code' || attr(tag, 'data-store-slug') !== slug) continue;
      const code = cleanCode(chunk.match(/class="item-code-link js-itemCode"[^>]*>([^<]*)</)?.[1]);
      if (!code) continue;
      const title = decodeHtml(chunk.match(/class="js-itemTitle"[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '');
      const small = decodeHtml(chunk.match(/js-couponSmallText"[^>]*>([^<]*)</)?.[1] ?? '');
      coupons.push({
        code,
        title,
        discount: discountFrom(small) || discountFrom(title),
        expiresAt: toIso(attr(tag, 'data-end-date')),
      });
    }
    return coupons;
  },
};
