import { browser } from 'wxt/browser';
import type { ComparePricesMessage, ComparePricesResponse } from './messages';
import type { PriceReport } from './price-compare';
import { downloadText } from './page-capture';
import { formatBRL } from './price';
import { PRICE_SOURCES } from './price-search';
import { productFromJsonLd, type PageProduct } from './product-match';
import type { StoreId } from './stores';

/**
 * Cartão "Comparar preço" na página de produto (canto de baixo, à esquerda; o de cupons fica à direita).
 * Só busca quando você clica no botão.
 */
export function mountPricePanel(store: StoreId): void {
  let panel: { host: HTMLElement; key: string } | null = null;
  // Lojas como a adidas trocam de produto sem recarregar a página: confere a cada 1,5 s.
  setInterval(() => {
    const product = readPageProduct();
    const key = product ? `${location.pathname}|${product.name}` : '';
    if (panel && panel.key !== key) {
      panel.host.remove();
      panel = null;
    }
    if (product && !panel) panel = { host: createPanel(store, product), key };
  }, 1500);
}

/** Lê o produto aberto: JSON-LD primeiro, depois as meta tags que as lojas usam para redes sociais. */
export function readPageProduct(doc: Document = document): PageProduct | null {
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? '');
  const fromLd = productFromJsonLd(blocks, location.href);
  const meta = (name: string) => doc.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`)?.content ?? null;
  const metaPrice = Number(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price') ?? NaN);
  if (fromLd) return { ...fromLd, price: fromLd.price ?? (metaPrice > 0 ? metaPrice : null) };
  // Sem JSON-LD: só conta como página de produto se a loja disser que é (og:type product) e tiver preço.
  if (!/product/i.test(meta('og:type') ?? '') || !(metaPrice > 0)) return null;
  const name = doc.querySelector('h1')?.textContent?.trim() || meta('og:title');
  if (!name) return null;
  return { name, brand: meta('product:brand') ?? meta('og:brand'), gtin: null, sku: null, price: metaPrice, url: location.href };
}

function createPanel(store: StoreId, product: PageProduct): HTMLElement {
  const host = document.createElement('discount-beast-prices');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; left: 16px; bottom: 16px; z-index: 2147483646; width: 300px; padding: 14px;
        border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 14px/1.45 system-ui, sans-serif; }
      h1 { margin: 0 0 6px; font-size: 15px; }
      p { margin: 0 0 10px; }
      .small { font-size: 12px; color: #6b7280; }
      button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #2563eb; color: #fff;
        font: 600 14px system-ui, sans-serif; cursor: pointer; }
      button:disabled { background: #9ca3af; cursor: default; }
      ul { margin: 0 0 10px; padding: 0; list-style: none; }
      li { padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
      li .row { display: flex; justify-content: space-between; gap: 8px; }
      li .t { display: block; font-size: 11px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      li a { color: #2563eb; text-decoration: none; }
      .cheaper { color: #16a34a; font-weight: 600; }
      .pricier { color: #b91c1c; }
      .x { position: absolute; top: 6px; right: 10px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
      .min { position: absolute; top: 6px; right: 30px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
      .body[hidden] { display: none; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <button class="min" title="Minimizar">–</button>
      <h1>🦁 Comparar preço</h1>
      <div class="body">
        <p class="msg"></p>
        <ul class="list" hidden></ul>
        <button class="go">Comparar preço</button>
      </div>
    </div>`;
  document.body.append(host);
  root.querySelector('.x')!.addEventListener('click', () => host.remove());
  const body = root.querySelector<HTMLDivElement>('.body')!;
  root.querySelector('.min')!.addEventListener('click', () => (body.hidden = !body.hidden));

  const msg = root.querySelector<HTMLParagraphElement>('.msg')!;
  const list = root.querySelector<HTMLUListElement>('.list')!;
  const go = root.querySelector<HTMLButtonElement>('.go')!;
  const others = PRICE_SOURCES.filter((s) => s.id !== store).map((s) => s.name);
  const here = () => product.price;
  msg.textContent = `${product.name}${here() !== null ? ` · aqui ${formatBRL(here()!)}` : ''}. Procura o mesmo modelo em ${others.join(', ')} (sem frete).`;

  go.addEventListener('click', async () => {
    go.disabled = true;
    list.hidden = true;
    msg.textContent = `Procurando em ${others.join(', ')}… Abro e fecho umas abas de fundo, leva uns 15 segundos.`;
    try {
      const message: ComparePricesMessage = { type: 'compare-prices', from: store, product };
      const reports = (await browser.runtime.sendMessage(message)) as ComparePricesResponse | { error: string };
      if (!Array.isArray(reports)) throw new Error(reports?.error ?? 'sem resposta');
      show(reports, here());
    } catch (error) {
      console.warn('[Discount Beast]', error);
      msg.textContent = `Não consegui comparar: ${(error as Error).message}`;
    } finally {
      go.disabled = false;
      go.textContent = 'Comparar de novo';
    }
  });

  function show(reports: PriceReport[], price: number | null) {
    const found = reports.filter((r) => r.match).sort((a, b) => a.match!.price - b.match!.price);
    const best = found[0];
    msg.innerHTML = '';
    if (!best) msg.textContent = 'Não achei este modelo nas outras lojas.';
    else if (price === null) msg.textContent = `Menor preço: ${best.storeName}, ${formatBRL(best.match!.price)}.`;
    else if (best.match!.price < price) {
      const strong = document.createElement('strong');
      strong.textContent = `${best.storeName}: ${formatBRL(best.match!.price)}`;
      msg.append('Menor preço: ', strong, ` (${formatBRL(price - best.match!.price)} a menos que aqui).`);
    } else if (best.match!.price === price) msg.textContent = `Mesmo preço na ${best.storeName} (${formatBRL(price)}). Nenhuma loja está mais barata.`;
    else msg.textContent = `Aqui já é o menor preço (${formatBRL(price)}).`;

    list.replaceChildren(
      ...reports.map((r) => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'row';
        const name = document.createElement('a');
        name.textContent = r.storeName;
        name.target = '_blank';
        name.rel = 'noopener';
        const value = document.createElement('span');
        if (r.match) {
          name.href = r.match.url;
          value.textContent = formatBRL(r.match.price);
          if (price !== null) value.className = r.match.price < price ? 'cheaper' : r.match.price > price ? 'pricier' : '';
          const title = Object.assign(document.createElement('span'), { className: 't', textContent: r.match.title, title: `${r.match.title} (${r.match.why})` });
          row.append(name, value);
          li.append(row, title);
        } else {
          name.href = r.searchUrl;
          value.className = 'small';
          value.textContent = r.error ? 'erro ao buscar' : r.hits ? 'não achei o mesmo modelo' : 'busca sem resultados';
          row.append(name, value);
          li.append(row);
        }
        return li;
      }),
    );
    list.hidden = false;

    // Alguma loja não achou o produto: botão que baixa o que a aba viu, para o Claude ajustar a busca.
    root.querySelector('.diag')?.remove();
    const empty = reports.filter((r) => r.snapshot);
    if (empty.length) {
      const diag = Object.assign(document.createElement('button'), { className: 'diag', textContent: 'Salvar diagnóstico das lojas sem resultado' });
      diag.style.cssText = 'margin-top:8px;background:#6b7280;font-size:12px;padding:7px';
      diag.addEventListener('click', () => {
        for (const r of empty) {
          const s = r.snapshot!;
          const header = `<!-- discount-beast price search\nstore: ${r.store}\nsearch: ${r.searchUrl}\nurl: ${s.url}\ntitle: ${s.title.replaceAll('--', '- -')}\n-->\n`;
          downloadText(`discount-beast-busca-${r.store}.html`, header + s.html);
        }
        diag.textContent = `${empty.length} arquivo(s) salvo(s) em Downloads.`;
      });
      go.after(diag);
    }
  }

  return host;
}
