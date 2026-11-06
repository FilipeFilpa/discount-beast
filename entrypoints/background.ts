import type { Message } from '@/lib/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender) => {
    if (message.type !== 'store-visit' || sender.tab?.id === undefined) return;

    // Marca o ícone da extensão na aba com um "✓" verde para mostrar que a loja é suportada.
    browser.action.setBadgeText({ tabId: sender.tab.id, text: '✓' });
    browser.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#16a34a' });

    // Guarda a última loja visitada para o popup mostrar.
    browser.storage.local.set({ lastVisit: { storeId: message.storeId, at: Date.now() } });
  });
});
