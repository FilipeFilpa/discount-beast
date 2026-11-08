import { mountCartPanel } from '@/lib/cart-panel';
import { isMagaluCart, magaluCart, peekMagaluSuggested } from '@/lib/carts/magalu';

/**
 * Na Magalu, o cupom fica na própria sacola (sacola.magazineluiza.com.br), na janela "Ver cupons".
 * Antes de mostrar o cartão, damos uma espiada nessa janela para pegar os cupons que a Magalu sugere.
 */
export default defineContentScript({
  matches: ['https://sacola.magazineluiza.com.br/*'],
  runAt: 'document_idle',
  main() {
    let ready = false;
    let peeking = false;
    const timer = setInterval(() => {
      if (ready || peeking || !isMagaluCart()) return;
      peeking = true;
      peekMagaluSuggested()
        .catch((error) => console.warn('[Discount Beast] não consegui ler os cupons sugeridos da Magalu:', error))
        .finally(() => { ready = true; peeking = false; clearInterval(timer); });
    }, 1500);
    mountCartPanel({ store: 'magalu', storeName: 'Magalu', cart: magaluCart, isCart: () => ready && isMagaluCart() });
  },
});
