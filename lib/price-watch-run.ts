import { browser } from 'wxt/browser';
import { formatBRL } from './price';
import { comparePrices, type PriceReport } from './price-compare';
import { applyCheck, getWatch, getWatches, isDue, saveWatch, type SeenPrice, type Watch } from './price-watch';

/**
 * Roda no background: confere os produtos marcados em todas as lojas do comparador
 * e mostra um aviso do Chrome quando algum fica mais barato que o menor preço já visto.
 */

let running: Promise<number> | null = null;

/** Confere os produtos (só os que estão "vencidos", a não ser que force = true). Devolve quantos conferiu. */
export function checkWatches(force = false): Promise<number> {
  // Já está conferindo (alarme + botão ao mesmo tempo): espera a mesma rodada.
  running ??= run(force).finally(() => (running = null));
  return running;
}

async function run(force: boolean): Promise<number> {
  const todo = (await getWatches()).filter((w) => force || isDue(w));
  if (!todo.length) return 0;
  const windowId = await openQuietWindow();
  try {
    // Um produto por vez: cada um já abre uma aba por loja.
    for (const watch of todo) await checkOne(watch, windowId);
  } finally {
    if (windowId !== undefined) await browser.windows.remove(windowId).catch(() => {});
  }
  return todo.length;
}

/** Confere um produto agora (usado também logo depois de marcar, para registrar o preço de partida sem avisar). */
export async function checkOne(watch: Watch, windowId?: number, notify = true): Promise<Watch> {
  let reports: PriceReport[];
  try {
    reports = await comparePrices(watch.product, watch.from, { includeSelf: true, windowId });
  } catch (error) {
    reports = [{ store: watch.from, storeName: watch.from, searchUrl: '', match: null, hits: 0, error: (error as Error).message }];
  }
  // Você pode ter tirado o produto da lista enquanto a busca rodava.
  const current = await getWatch(watch.id);
  if (!current) return watch;
  const { watch: next, drop } = applyCheck(current, reports);
  await saveWatch(next);
  console.info('[Discount Beast] alerta de preço:', next.product.name, '→', next.last, drop ? `(caiu de ${drop.from})` : '');
  if (drop && notify) await notifyDrop(next, drop.from, drop.to);
  return next;
}

/** Marca um produto e já confere uma vez, em silêncio, para o "menor preço" partir do preço real de hoje em todas as lojas. */
export async function addAndBaseline(watch: Watch): Promise<void> {
  const windowId = await openQuietWindow();
  try {
    await checkOne(watch, windowId, false);
  } finally {
    if (windowId !== undefined) await browser.windows.remove(windowId).catch(() => {});
  }
}

/** Janela minimizada só para as abas de fundo, para elas não piscarem na sua barra de abas. */
async function openQuietWindow(): Promise<number | undefined> {
  try {
    const win = await browser.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
    return win?.id;
  } catch (error) {
    console.warn('[Discount Beast] não consegui abrir a janela minimizada; uso a janela atual', error);
    return undefined;
  }
}

/** Endereço que abre quando você clica no aviso. */
const notificationUrls = new Map<string, string>();

async function notifyDrop(watch: Watch, before: number, now: SeenPrice): Promise<void> {
  const id = `price-drop.${watch.id}.${now.at}`;
  notificationUrls.set(id, now.url);
  await browser.storage.local.set({ [`notify.${id}`]: now.url });
  await browser.notifications.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/price-drop.png'),
    title: `Baixou: ${formatBRL(now.price)} na ${now.storeName}`,
    message: `${watch.product.name}\nAntes: ${formatBRL(before)} (−${formatBRL(before - now.price)})`,
    contextMessage: `Anúncio: ${now.title}`,
    priority: 2,
  });
}

/** Clique no aviso: abre o anúncio mais barato. */
export function setupNotificationClicks(): void {
  browser.notifications.onClicked.addListener(async (id) => {
    if (!id.startsWith('price-drop.')) return;
    // O background pode ter "dormido" desde o aviso: o endereço também fica no storage.local.
    const key = `notify.${id}`;
    const url = notificationUrls.get(id) ?? ((await browser.storage.local.get(key)) as Record<string, string | undefined>)[key];
    if (url) await browser.tabs.create({ url });
    await browser.notifications.clear(id);
    await browser.storage.local.remove(key);
  });
}
