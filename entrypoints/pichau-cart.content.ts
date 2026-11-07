import { mountCartPanel } from '@/lib/cart-panel';
import { isPichauCart, pichauCart } from '@/lib/carts/pichau';

/** Na Pichau, o campo "Cupom de desconto" fica no próprio carrinho (/cart). */
export default defineContentScript({
  matches: ['https://pichau.com.br/*', 'https://*.pichau.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'pichau', storeName: 'Pichau', cart: pichauCart, isCart: isPichauCart });
  },
});
