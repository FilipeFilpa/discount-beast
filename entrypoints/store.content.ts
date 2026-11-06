import { findStoreByHost, STORE_MATCHES } from '@/lib/stores';
import type { StoreVisitMessage } from '@/lib/messages';

export default defineContentScript({
  matches: STORE_MATCHES,
  runAt: 'document_idle',
  main() {
    const store = findStoreByHost(location.hostname);
    if (!store) return;

    console.info(`[Discount Beast] Loja detectada: ${store.name}`);

    const message: StoreVisitMessage = {
      type: 'store-visit',
      storeId: store.id,
      url: location.href,
    };
    browser.runtime.sendMessage(message).catch(() => {
      // O background pode estar dormindo; não é um erro para o usuário.
    });
  },
});
