import { cleanCode, discountFrom, toIso } from '../util.ts';
import type { RawCoupon, Source } from './types.ts';

/** Endereço da página de cada loja na Cuponation (cada loja tem um padrão diferente). */
const PAGES = {
  adidas: 'codigo-promocional-adidas',
  netshoes: 'cupom-desconto-netshoes',
  centauro: 'cupom-centauro',
  amazon: 'cupom-desconto-amazon',
  mercadolivre: 'cupom-de-desconto-mercado-livre',
  magalu: 'cupom-desconto-magazine-luiza',
  aliexpress: 'cupom-de-desconto-aliexpress',
  shopee: 'cupom-shopee',
} as const;

/** Lê o texto de um campo "nome":"valor" dentro de um pedaço de JSON. */
function field(chunk: string, name: string): string | null {
  const match = chunk.match(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string; // resolve é, \n etc.
  } catch {
    return match[1]!;
  }
}

/**
 * Cuponation é feito em Next.js (React Server Components): os cupons vêm num JSON
 * "escapado" dentro de <script>self.__next_f.push(...)</script>.
 * Cada cupom é um objeto "voucher":{"idPool":...} com title, code, endTime,
 * termsAndConditions, voucherTypeName ("Code" ou "Deal") e retailer.landingPage.url.
 * A página também mostra cupons de lojas parecidas, por isso conferimos o landingPage.
 */
export const cuponation: Source = {
  id: 'cuponation',
  urls: Object.fromEntries(
    Object.entries(PAGES).map(([store, page]) => [store, `https://www.cuponation.com.br/${page}`]),
  ),
  parse(html, store) {
    const page = PAGES[store];
    const text = html.replace(/\\"/g, '"'); // tira uma camada de escape
    const chunks = text.split('"voucher":{"idPool"').slice(1);
    if (chunks.length === 0) throw new Error('Cuponation: nenhum "voucher" na página (o site mudou?)');

    const seen = new Set<string>();
    const coupons: RawCoupon[] = [];
    for (const chunk of chunks) {
      if (field(chunk, 'voucherTypeName') !== 'Code') continue; // "Deal" = desconto no link
      if (!chunk.includes(`"landingPage":{"url":"${page}"`)) continue; // cupom de outra loja
      const code = cleanCode(field(chunk, 'code'));
      if (!code || seen.has(code)) continue; // a página repete o mesmo cupom em 2 lugares
      seen.add(code);
      const title = (field(chunk, 'title') ?? '').trim();
      const caption = `${field(chunk, 'caption1') ?? ''} ${field(chunk, 'caption2') ?? ''}`.trim();
      const terms = (field(chunk, 'termsAndConditions') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      coupons.push({
        code,
        title,
        discount: discountFrom(caption) || discountFrom(title),
        expiresAt: toIso(field(chunk, 'endTime')),
        ...(terms && { terms }),
      });
    }
    return coupons;
  },
};
