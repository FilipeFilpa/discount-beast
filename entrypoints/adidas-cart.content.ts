import { mountCartPanel } from '@/lib/cart-panel';
import { adidasCart, isAdidasCart } from '@/lib/carts/adidas';

/** No carrinho da adidas, mostra o cartão "Testar cupons" (a parte comum está em lib/cart-panel.ts). */
export default defineContentScript({
  matches: ['https://adidas.com.br/*', 'https://*.adidas.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'adidas', storeName: 'adidas', cart: adidasCart, isCart: isAdidasCart });
  },
});
