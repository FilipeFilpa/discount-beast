import { mountCartPanel } from '@/lib/cart-panel';
import { amazonPay, isAmazonPayPage } from '@/lib/carts/amazon';

/**
 * Página de pagamento da Amazon (/checkout/.../pay): cartão "Testar cupons" no campo
 * "Insira um Cupom de desconto ou Vale-presente". A Amazon bloqueia o campo por 2 horas depois de
 * algumas tentativas, então só testamos os 3 melhores códigos e paramos no primeiro aceito.
 */
export default defineContentScript({
  matches: ['https://www.amazon.com.br/checkout/*', 'https://www.amazon.com.br/gp/buy/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'amazon', storeName: 'Amazon', cart: amazonPay, isCart: isAmazonPayPage, maxTries: 3, stopAtFirstWin: true });
  },
});
