import { mountCartPanel } from '@/lib/cart-panel';
import { isMercadoLivreCart, mercadoLivreCart } from '@/lib/carts/mercadolivre';

/**
 * No Mercado Livre, o cupom entra pelo "Inserir código do cupom" do resumo do carrinho
 * (www.mercadolivre.com.br/gz/cart/v2), numa janela com iframe. O adaptador cuida do iframe.
 */
export default defineContentScript({
  matches: ['https://www.mercadolivre.com.br/*'],
  runAt: 'document_idle',
  main() {
    mountCartPanel({ store: 'mercadolivre', storeName: 'Mercado Livre', cart: mercadoLivreCart, isCart: isMercadoLivreCart });
  },
});
