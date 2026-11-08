import type { Message } from '@/lib/messages';
import { REFRESH_MINUTES, refreshCoupons } from '@/lib/coupon-store';
import { comparePrices } from '@/lib/price-compare';
import { MAX_WATCHES, WATCH_MINUTES, getWatches, newWatch, saveWatch } from '@/lib/price-watch';
import { addAndBaseline, checkWatches, setupNotificationClicks } from '@/lib/price-watch-run';
import { STORES } from '@/lib/stores';

/**
 * Cria o alarme só se ele ainda não existe. O background do Chrome "dorme" e acorda várias vezes por hora;
 * recriar o alarme a cada vez reiniciaria a contagem e ele nunca dispararia.
 */
async function ensureAlarm(name: string, periodInMinutes: number) {
  const existing = await browser.alarms.get(name);
  if (!existing || existing.periodInMinutes !== periodInMinutes) await browser.alarms.create(name, { periodInMinutes, delayInMinutes: periodInMinutes });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (message.type === 'compare-prices') {
      // Busca nas outras lojas (abre e fecha abas de fundo). "return true" = a resposta vem depois.
      comparePrices(message.product, message.from).then(sendResponse, (error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message.type === 'watch-add') {
      (async () => {
        if ((await getWatches()).length >= MAX_WATCHES) return { error: `A lista já tem ${MAX_WATCHES} produtos. Tire algum no popup.` };
        const storeName = STORES.find((s) => s.id === message.from)?.name ?? message.from;
        const watch = newWatch(message.product, message.from, storeName, message.reports);
        await saveWatch(watch);
        // Responde logo; a primeira conferência (silenciosa) continua sozinha.
        addAndBaseline(watch).catch((error) => console.warn('[Discount Beast] alerta de preço:', error));
        return { ok: true };
      })().then(sendResponse, (error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message.type === 'watch-check-now') {
      checkWatches(true).then((count) => sendResponse({ count }), (error) => sendResponse({ error: String(error) }));
      return true;
    }
    if (message.type !== 'store-visit' || sender.tab?.id === undefined) return;

    // Marca o ícone da extensão na aba com um "✓" verde para mostrar que a loja é suportada.
    browser.action.setBadgeText({ tabId: sender.tab.id, text: '✓' });
    browser.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#16a34a' });

    // Guarda a última loja visitada para o popup mostrar.
    browser.storage.local.set({ lastVisit: { storeId: message.storeId, at: Date.now() } });
  });

  // Baixa a lista de cupons ao instalar, ao abrir o Chrome e depois a cada 3 horas.
  const refresh = () => refreshCoupons().catch((error) => console.warn('[Discount Beast]', error));
  const watchCheck = () => checkWatches().catch((error) => console.warn('[Discount Beast] alerta de preço:', error));
  browser.runtime.onInstalled.addListener(refresh);
  // Ao abrir o Chrome: cupons e os produtos que ficaram mais de 6 h sem conferir (o Chrome estava fechado).
  browser.runtime.onStartup.addListener(() => {
    refresh();
    watchCheck();
  });
  ensureAlarm('refresh-coupons', REFRESH_MINUTES);
  ensureAlarm('price-watch', WATCH_MINUTES);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'refresh-coupons') refresh();
    if (alarm.name === 'price-watch') watchCheck();
  });
  setupNotificationClicks();
});
