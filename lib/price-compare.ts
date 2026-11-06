import { browser } from 'wxt/browser';
import { bestMatch, searchQuery, type BestMatch, type PageProduct, type SearchHit } from './product-match';
import { extractSearchHits, PRICE_SOURCES, type PriceSource } from './price-search';
import type { StoreId } from './stores';

/** O que o cartão mostra para cada loja. */
export interface PriceReport {
  store: StoreId;
  storeName: string;
  /** Página de busca usada (para você abrir e conferir). */
  searchUrl: string;
  match: BestMatch | null;
  /** Quantos produtos a busca mostrou. 0 = a loja não respondeu ou mudou a página. */
  hits: number;
  error?: string;
}

const PAGE_TIMEOUT_MS = 25_000;
/** Lojas que montam a lista com JavaScript demoram um pouco depois do "carregou". */
const RESULTS_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca o produto em todas as outras lojas ao mesmo tempo. */
export async function comparePrices(product: PageProduct, from: StoreId): Promise<PriceReport[]> {
  const query = searchQuery(product);
  const sources = PRICE_SOURCES.filter((s) => s.id !== from);
  return Promise.all(sources.map((source) => searchStore(source, query, product)));
}

async function searchStore(source: PriceSource, query: string, product: PageProduct): Promise<PriceReport> {
  const searchUrl = source.searchUrl(query);
  const report: PriceReport = { store: source.id, storeName: source.name, searchUrl, match: null, hits: 0 };
  let tabId: number | undefined;
  try {
    // Aba de fundo (não rouba o foco). É uma visita normal do seu Chrome.
    // Abre em branco e só depois navega: assim o teste automático (Playwright) consegue acompanhar a aba.
    const tab = await browser.tabs.create({ url: 'about:blank', active: false });
    tabId = tab.id;
    if (tabId === undefined) throw new Error('não consegui abrir a aba');
    await sleep(300);
    await browser.tabs.update(tabId, { url: searchUrl });
    await sleep(500);
    await waitForLoad(tabId);
    const hits = await readHits(tabId, source);
    report.hits = hits.length;
    report.match = bestMatch(product, hits);
    console.info(`[Discount Beast] ${source.name}: ${hits.length} resultados para "${query}"`, hits, '→', report.match);
  } catch (error) {
    report.error = (error as Error).message;
    console.warn(`[Discount Beast] ${source.name}:`, error);
  } finally {
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => {});
  }
  return report;
}

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      // Página lenta: tenta ler assim mesmo.
      resolve();
    }, PAGE_TIMEOUT_MS);
    const listener = (id: number, info: { status?: string }) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs.get(tabId).then((t) => t.status === 'complete' && listener(tabId, { status: 'complete' }), reject);
  });
}

/** Lê os resultados várias vezes até aparecer algo (ou estourar o tempo). */
async function readHits(tabId: number, source: PriceSource): Promise<SearchHit[]> {
  const end = Date.now() + RESULTS_TIMEOUT_MS;
  let hits: SearchHit[] = [];
  while (Date.now() < end) {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: extractSearchHits,
      args: [source.productLink.source],
    });
    hits = (result?.result as SearchHit[] | undefined) ?? [];
    if (hits.length) {
      // Dá mais um tempinho para a lista terminar de carregar e lê de novo.
      await sleep(1000);
      const [again] = await browser.scripting.executeScript({ target: { tabId }, func: extractSearchHits, args: [source.productLink.source] });
      const more = (again?.result as SearchHit[] | undefined) ?? [];
      return more.length >= hits.length ? more : hits;
    }
    await sleep(1500);
  }
  return hits;
}
