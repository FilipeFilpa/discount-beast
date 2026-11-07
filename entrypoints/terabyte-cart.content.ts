import { mountCartPanel } from '@/lib/cart-panel';
import { isTerabyteCouponPage, terabyteCart } from '@/lib/carts/terabyte';

/** Na Terabyte, o campo "Cupom de desconto" aparece na etapa de pagamento (/FormasPagamento.obj). */
export default defineContentScript({
  matches: ['https://terabyteshop.com.br/*', 'https://*.terabyteshop.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'terabyte', storeName: 'Terabyte', cart: terabyteCart, isCart: isTerabyteCouponPage });
  },
});
