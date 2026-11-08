import { readMagaluCartProducts } from '@/lib/carts/magalu';
import { mountPricePanel } from '@/lib/price-panel';
import { PRICE_PANEL_DOMAINS } from '@/lib/price-search';
import { findStoreByHost } from '@/lib/stores';

/**
 * Na página de um produto de qualquer loja do comparador (adidas, Netshoes, Centauro, KaBuM!, Pichau, Terabyte, Magalu, Amazon, Mercado Livre), mostra o cartão
 * "Comparar preço". Na sacola da Magalu também: compara os itens que estão nela.
 */
export default defineContentScript({
  matches: PRICE_PANEL_DOMAINS.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
  runAt: 'document_idle',
  main() {
    const store = findStoreByHost(location.hostname);
    if (!store) return;
    if (store.id === 'magalu' && /^sacola\./.test(location.hostname)) mountPricePanel(store.id, { read: readMagaluCartProducts, here: 'na sacola' });
    else mountPricePanel(store.id);
  },
});
