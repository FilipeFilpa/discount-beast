import { mountCartPanel } from '@/lib/cart-panel';
import { isNetshoesCart, netshoesCart } from '@/lib/carts/netshoes';

/** No carrinho da Netshoes, mostra o cartão "Testar cupons" (a parte comum está em lib/cart-panel.ts). */
export default defineContentScript({
  matches: ['https://netshoes.com.br/*', 'https://*.netshoes.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'netshoes', storeName: 'Netshoes', cart: netshoesCart, isCart: isNetshoesCart });
  },
});
