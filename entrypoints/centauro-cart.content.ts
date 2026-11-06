import { mountCartPanel } from '@/lib/cart-panel';
import { centauroCart, isCentauroCart } from '@/lib/carts/centauro';

/** No carrinho da Centauro, mostra o cartão "Testar cupons" (a parte comum está em lib/cart-panel.ts). */
export default defineContentScript({
  matches: ['https://centauro.com.br/*', 'https://*.centauro.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'centauro', storeName: 'Centauro', cart: centauroCart, isCart: isCentauroCart });
  },
});
