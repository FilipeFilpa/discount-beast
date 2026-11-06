import { attr, cleanCode, discountFrom } from '../util.ts';
import type { RawCoupon, Source } from './types.ts';

/**
 * Méliuz coloca cada cupom ativo numa <div class="cpn-layout offer-cpn" data-offer-code="..." data-offer-title="...">.
 * Os expirados ficam em outra seção, sem data-offer-code, então são ignorados sozinhos.
 */
export const meliuz: Source = {
  id: 'meliuz',
  urls: {
    adidas: 'https://www.meliuz.com.br/desconto/cupom-adidas',
    netshoes: 'https://www.meliuz.com.br/desconto/cupom-netshoes',
    centauro: 'https://www.meliuz.com.br/desconto/cupom-centauro',
    amazon: 'https://www.meliuz.com.br/desconto/cupom-desconto-amazon',
    mercadolivre: 'https://www.meliuz.com.br/desconto/cupom-desconto-mercado-livre',
    magalu: 'https://www.meliuz.com.br/desconto/cupom-magazine-luiza',
  },
  parse(html) {
    const tags = html.match(/<div class="cpn-layout[^"]*"[^>]*data-offer-code="[^"]*"[^>]*>/g) ?? [];
    const coupons: RawCoupon[] = [];
    for (const tag of tags) {
      const code = cleanCode(attr(tag, 'data-offer-code'));
      if (!code) continue;
      const title = attr(tag, 'data-offer-title') ?? '';
      coupons.push({ code, title, discount: discountFrom(title), expiresAt: null });
    }
    return coupons;
  },
};
