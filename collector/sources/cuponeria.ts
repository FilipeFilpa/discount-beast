import { cleanCode, discountFrom, toIso } from '../util.ts';
import type { RawCoupon, Source } from './types.ts';

/** Campos que usamos de cada oferta no JSON da Cuponeria. */
interface CuponeriaOffer {
  title?: string;
  code?: string | null;
  badge?: string;
  rules?: string;
  expired?: boolean;
  expirationDate?: string | null;
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

/** Tira das regras as frases-padrão sobre cashback, que não ajudam a saber onde o cupom vale. */
function shortRules(rules: string): string {
  return rules
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/cashback|sujeito a|confira as condi/i.test(line))
    .join(' ')
    .slice(0, 200);
}

/**
 * Cuponeria também é Next.js: a página traz as ofertas em
 * <script id="__NEXT_DATA__"> → props.pageProps.offersActive[]. Oferta sem "code" é desconto no link.
 */
export const cuponeria: Source = {
  id: 'cuponeria',
  urls: Object.fromEntries(
    Object.entries(SLUGS).map(([store, slug]) => [store, `https://www.cuponeria.com.br/cupom-desconto/${slug}`]),
  ),
  parse(html) {
    const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!json) throw new Error('Cuponeria: __NEXT_DATA__ não encontrado (o site mudou?)');
    const list: CuponeriaOffer[] | undefined = JSON.parse(json)?.props?.pageProps?.offersActive;
    if (!Array.isArray(list)) throw new Error('Cuponeria: lista offersActive não encontrada (o site mudou?)');

    const coupons: RawCoupon[] = [];
    for (const offer of list) {
      const code = cleanCode(offer.code);
      if (!code || offer.expired) continue;
      const title = (offer.title ?? '').trim();
      const terms = shortRules(offer.rules ?? '');
      // A data vem sem fuso ("2026-12-31 00:00:00"); é horário de Brasília.
      const date = offer.expirationDate ? `${offer.expirationDate.replace(' ', 'T')}-03:00` : null;
      coupons.push({
        code,
        title,
        discount: discountFrom(offer.badge ?? '') || discountFrom(title),
        expiresAt: toIso(date),
        ...(terms && { terms }),
      });
    }
    return coupons;
  },
};
