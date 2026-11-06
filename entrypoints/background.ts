import type { Message } from '@/lib/messages';
import { REFRESH_MINUTES, refreshCoupons } from '@/lib/coupon-store';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender) => {
    if (message.type !== 'store-visit' || sender.tab?.id === undefined) return;

    // Marca o ícone da extensão na aba com um "✓" verde para mostrar que a loja é suportada.
    browser.action.setBadgeText({ tabId: sender.tab.id, text: '✓' });
    browser.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#16a34a' });

    // Guarda a última loja visitada para o popup mostrar.
    browser.storage.local.set({ lastVisit: { storeId: message.storeId, at: Date.now() } });
  });

  // Baixa a lista de cupons ao instalar e depois a cada 6 horas.
  const refresh = () => refreshCoupons().catch((error) => console.warn('[Discount Beast]', error));
  browser.runtime.onInstalled.addListener(refresh);
  browser.runtime.onStartup.addListener(refresh);
  browser.alarms.create('refresh-coupons', { periodInMinutes: REFRESH_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'refresh-coupons') refresh();
  });
});
