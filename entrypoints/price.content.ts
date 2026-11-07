import { mountPricePanel } from '@/lib/price-panel';
import { PRICE_PANEL_DOMAINS } from '@/lib/price-search';
import { findStoreByHost } from '@/lib/stores';

/** Na página de um produto da adidas, Netshoes, Centauro, KaBuM!, Pichau ou Terabyte, mostra o cartão "Comparar preço". */
export default defineContentScript({
  matches: PRICE_PANEL_DOMAINS.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
  runAt: 'document_idle',
  main() {
    const store = findStoreByHost(location.hostname);
    if (store) mountPricePanel(store.id);
  },
});
