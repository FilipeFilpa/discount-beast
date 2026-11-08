import { browser } from 'wxt/browser';
import { bestMatch, matchScore, MATCH_MIN, searchQuery, type BestMatch, type PageProduct, type SearchHit } from './product-match';
import { hitsFromNextData } from './next-data';
import { hitsFromPolycards } from './polycards';
import { extractSearchHits, fetchPageText, fetchProductPrice, snapshotSearchPage, sourcesFrom, type PriceSource } from './price-search';
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
  /** Cópia da página de busca quando ela voltou vazia (botão "Salvar diagnóstico"). */
  snapshot?: { url: string; title: string; html: string };
}

const PAGE_TIMEOUT_MS = 25_000;
/** Lojas que montam a lista com JavaScript demoram um pouco depois do "carregou". */
const RESULTS_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca o produto nas outras lojas do mesmo tipo (e nas que vendem de tudo) ao mesmo tempo. */
export async function comparePrices(product: PageProduct, from: StoreId): Promise<PriceReport[]> {
  const query = searchQuery(product);
  const sources = sourcesFrom(from, product.name);
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
    await fillMissingPrices(tabId, product, hits);
    report.match = bestMatch(product, hits);
    // Não achou o mesmo modelo: guarda a página para o botão "Salvar diagnóstico".
    if (!report.match) {
      const [shot] = await browser.scripting.executeScript({ target: { tabId }, func: snapshotSearchPage }).catch(() => []);
      report.snapshot = shot?.result as PriceReport['snapshot'];
    }
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
  const run = async (mode: 'live' | 'generic' | 'fetch') => {
    const [result] = await browser.scripting.executeScript({ target: { tabId }, func: extractSearchHits, args: [source.productLink.source, 24, mode] }).catch(() => []);
    return (result?.result as SearchHit[] | undefined) ?? [];
  };
  const priced = (hits: SearchHit[]) => hits.some((h) => h.price > 0);
  const end = Date.now() + RESULTS_TIMEOUT_MS;
  let titlesOnly: SearchHit[] = [];
  let triedFetch = false;
  while (Date.now() < end) {
    // Plano A: a lista desenhada na aba, com o formato de link de produto da loja.
    const hits = await run('live');
    if (priced(hits)) {
      // Dá mais um tempinho para a lista terminar de carregar e lê de novo.
      await sleep(1000);
      const more = await run('live');
      return more.length >= hits.length ? more : hits;
    }
    if (hits.length) titlesOnly = hits;
    if (!triedFetch) {
      triedFetch = true;
      // Plano B (Mercado Livre): numa aba de fundo a lista não aparece, mas os produtos vêm num JSON dentro do HTML.
      const [page] = await browser.scripting.executeScript({ target: { tabId }, func: fetchPageText }).catch(() => []);
      const html = String(page?.result ?? '');
      // Mercado Livre ("polycards") ou lojas em Next.js como a Magalu (__NEXT_DATA__).
      const poly = hitsFromPolycards(html);
      const fromJson = poly.length ? poly : hitsFromNextData(html, new URL(source.searchUrl('x')).origin, source.productLink);
      if (fromJson.length) {
        console.info(`[Discount Beast] ${source.name}: li o JSON da página`, fromJson.slice(0, 3));
        return fromJson;
      }
      // Plano C: o HTML que o servidor mandou, antes do JavaScript da loja.
      const fetched = await run('fetch');
      if (priced(fetched)) return fetched;
      if (fetched.length && !titlesOnly.length) titlesOnly = fetched;
    }
    // Plano D: o formato do link pode ter mudado; aceita qualquer link de produto da loja.
    const loose = await run('generic');
    if (priced(loose)) {
      console.info(`[Discount Beast] ${source.name}: achei por links genéricos`, loose.slice(0, 3));
      return loose;
    }
    if (loose.length && !titlesOnly.length) titlesOnly = loose;
    await sleep(1500);
  }
  // Nunca apareceu preço (ex.: Netshoes mostra "Confira"): segue com os títulos; o preço vem da página do produto.
  return titlesOnly;
}

/**
 * Cartões sem preço (ex.: Netshoes numa aba de fundo mostra "Confira"): para os até 3 que
 * parecem o mesmo produto, lê o preço direto na página do produto.
 */
async function fillMissingPrices(tabId: number, product: PageProduct, hits: SearchHit[]): Promise<void> {
  const todo = hits
    .filter((h) => h.price <= 0)
    .map((h) => ({ hit: h, score: matchScore(product, h).score }))
    .filter((x) => x.score >= MATCH_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  await Promise.all(
    todo.map(async ({ hit }) => {
      const [result] = await browser.scripting.executeScript({ target: { tabId }, func: fetchProductPrice, args: [hit.url] }).catch(() => []);
      const price = result?.result as number | null | undefined;
      if (price && price > 0) hit.price = price;
    }),
  );
}
