import { mountPricePanel } from '@/lib/price-panel';
import { findStoreByHost } from '@/lib/stores';

/** Na página de um produto da adidas, Netshoes ou Centauro, mostra o cartão "Comparar preço". */
export default defineContentScript({
  matches: ['adidas.com.br', 'netshoes.com.br', 'centauro.com.br'].flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
  runAt: 'document_idle',
  main() {
    const store = findStoreByHost(location.hostname);
    if (store) mountPricePanel(store.id);
  },
});
