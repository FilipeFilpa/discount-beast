import { browser } from 'wxt/browser';
import type { ComparePricesMessage, ComparePricesResponse, WatchAddMessage } from './messages';
import type { PriceReport } from './price-compare';
import { downloadText } from './page-capture';
import { formatBRL, parseBRL } from './price';
import { isProductPageUrl, sourcesFrom } from './price-search';
import { getWatch, isWatchChange, removeWatch, watchId } from './price-watch';
import { productFromJsonLd, type PageProduct } from './product-match';
import { findStoreByHost, type StoreId } from './stores';

/** De onde o cartão tira o(s) produto(s): a página de produto ou a sacola. */
export interface PriceSourcePage {
  /** Produtos que dá para comparar agora (vazio = esconde o cartão). */
  read: () => PageProduct[];
  /** Como chamar o preço daqui no texto: "aqui" ou "na sacola". */
  here: string;
}

const PRODUCT_PAGE: PriceSourcePage = {
  read: () => {
    // Página de produto apenas (lojas como a Amazon mudam de página sem recarregar: confere sempre).
    const product = isProductPageUrl(findStoreByHost(location.hostname)?.id ?? 'adidas', location.href) ? readPageProduct() : null;
    return product ? [product] : [];
  },
  here: 'aqui',
};

/**
 * Cartão "Comparar preço" na página de produto ou na sacola (canto de baixo, à esquerda; o de cupons fica à direita).
 * Só busca quando você clica no botão.
 */
export function mountPricePanel(store: StoreId, page: PriceSourcePage = PRODUCT_PAGE): void {
  let panel: { host: HTMLElement; key: string } | null = null;
  // Lojas como a adidas trocam de produto sem recarregar a página (e a sacola muda quando você tira um item):
  // confere a cada 1,5 s.
  setInterval(() => {
    const products = page.read();
    const key = products.length ? `${location.pathname}|${products.map((p) => p.name).join('|')}` : '';
    if (panel && panel.key !== key) {
      panel.host.remove();
      panel = null;
    }
    if (products.length && !panel) panel = { host: createPanel(store, products, page.here), key };
  }, 1500);
}

/** Lê o produto aberto: JSON-LD primeiro, depois as meta tags que as lojas usam para redes sociais. */
export function readPageProduct(doc: Document = document): PageProduct | null {
  const product = readBaseProduct(doc);
  if (!product) return null;
  // A ficha técnica costuma ter o código completo do fabricante (Magalu: "Referência QN65QN800DGXZD").
  const fromSpecs = specModelCode(doc);
  if (fromSpecs && (!product.mpn || fromSpecs.length > product.mpn.length)) product.mpn = fromSpecs;
  return product;
}

/**
 * Procura na ficha técnica uma linha "Referência" / "Modelo" / "Número do modelo" / "Código do fabricante"
 * e devolve o maior valor que parece código (letras + números, sem espaço).
 */
function specModelCode(doc: Document): string | null {
  const LABEL = /^(refer[êe]ncia|modelo|n[úu]mero (do|de) modelo|c[óo]digo do fabricante|part ?number|mpn)\s*:?$/i;
  let best: string | null = null;
  for (const el of doc.querySelectorAll<HTMLElement>('td, th, dt, span, div, p, li, strong, b')) {
    if (el.children.length > 1) continue;
    const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!LABEL.test(label)) continue;
    const valueEl = el.nextElementSibling ?? el.parentElement?.nextElementSibling;
    const value = (valueEl?.textContent ?? '').replace(/[\s\u200e\u200f]+/g, ' ').trim();
    if (/^[A-Za-z0-9][A-Za-z0-9/-]{5,29}$/.test(value) && /\d/.test(value) && /[A-Za-z]/.test(value) && (!best || value.length > best.length)) best = value;
  }
  return best;
}

function readBaseProduct(doc: Document): PageProduct | null {
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? '');
  const fromLd = productFromJsonLd(blocks, location.href);
  const meta = (name: string) => doc.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`)?.content ?? null;
  const metaPrice = Number(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price') ?? NaN);
  if (fromLd) return { ...fromLd, price: fromLd.price ?? (metaPrice > 0 ? metaPrice : visiblePrice(doc)) };
  const amazon = amazonProduct(doc);
  if (amazon) return amazon;
  // Sem JSON-LD: só conta como página de produto se a loja disser que é (og:type product) e tiver preço.
  if (!/product/i.test(meta('og:type') ?? '') || !(metaPrice > 0)) return null;
  const name = doc.querySelector('h1')?.textContent?.trim() || meta('og:title');
  if (!name) return null;
  return { name, brand: meta('product:brand') ?? meta('og:brand'), gtin: null, sku: null, price: metaPrice, url: location.href };
}

/**
 * A Amazon não põe JSON-LD nem og:type na página do produto: título em #productTitle, preço no bloco
 * principal (.a-price .a-offscreen, o primeiro é o preço atual) e marca no link "Marca: X" / "Visite a loja X".
 */
function amazonProduct(doc: Document): PageProduct | null {
  const name = doc.querySelector('#productTitle')?.textContent?.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  const priceText = doc.querySelector('#corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, #corePrice_desktop .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen')?.textContent ?? '';
  const byline = doc.querySelector('#bylineInfo')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const brand = byline.match(/^(?:Marca:|Visite a loja(?: da| do)?)\s*(.+)$/i)?.[1]?.trim() ?? null;
  return { name, brand, gtin: null, sku: null, price: parseBRL(priceText) ?? visiblePrice(doc), url: location.href };
}

/**
 * Sem preço no JSON-LD (ex.: Netshoes): pega o preço em destaque na tela, o "R$" com a maior fonte,
 * ignorando preço riscado, parcela ("8x de R$ 75,00") e o nosso cartão.
 */
function visiblePrice(doc: Document): number | null {
  let best: { size: number; value: number } | null = null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    const text = node.textContent ?? '';
    if (!el || !/\d/.test(text) || el.closest('s, del, discount-beast-prices, discount-beast-panel')) continue;
    const full = /R\$/.test(text) ? text : el.parentElement?.textContent ?? '';
    const m = full.match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
    if (!m || /\d+\s*x\s*(de\s*)?R\$/i.test(full)) continue;
    const style = getComputedStyle(el);
    if (style.textDecorationLine.includes('line-through') || el.getBoundingClientRect().width === 0) continue;
    const size = parseFloat(style.fontSize);
    const value = Number(`${m[1]!.replace(/\./g, '')}.${m[2]}`);
    if (value > 0 && (!best || size > best.size)) best = { size, value };
  }
  return best?.value ?? null;
}

function createPanel(store: StoreId, products: PageProduct[], hereLabel: string): HTMLElement {
  let product = products[0]!;
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
      .watch { margin-top: 8px; background: #fff; color: #2563eb; border: 1px solid #2563eb; }
      .watch.on { background: #ecfdf5; color: #166534; border-color: #16a34a; }
      .watch-msg { margin: 6px 0 0; }
      .x { position: absolute; top: 6px; right: 10px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
      .min { position: absolute; top: 6px; right: 30px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
      .body[hidden] { display: none; }
      select { width: 100%; margin: 0 0 8px; padding: 6px; border: 1px solid #d1d5db; border-radius: 8px; font: 13px system-ui, sans-serif; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <button class="min" title="Minimizar">–</button>
      <h1>🦁 Comparar preço</h1>
      <div class="body">
        <select class="pick" hidden title="Qual item da sacola comparar"></select>
        <p class="msg"></p>
        <ul class="list" hidden></ul>
        <button class="go">Comparar preço</button>
        <button class="watch" title="Confere o preço em todas as lojas a cada 6 h (com o Chrome aberto) e avisa quando baixar">🔔 Avisar quando baixar</button>
        <p class="small watch-msg" hidden></p>
      </div>
    </div>`;
  document.body.append(host);
  root.querySelector('.x')!.addEventListener('click', () => host.remove());
  const body = root.querySelector<HTMLDivElement>('.body')!;
  root.querySelector('.min')!.addEventListener('click', () => (body.hidden = !body.hidden));

  const msg = root.querySelector<HTMLParagraphElement>('.msg')!;
  const list = root.querySelector<HTMLUListElement>('.list')!;
  const go = root.querySelector<HTMLButtonElement>('.go')!;
  const pick = root.querySelector<HTMLSelectElement>('.pick')!;
  const watchBtn = root.querySelector<HTMLButtonElement>('.watch')!;
  const watchMsg = root.querySelector<HTMLParagraphElement>('.watch-msg')!;
  let others: string[] = [];
  /** Resultado do último "Comparar preço" deste produto (vira o ponto de partida do alerta). */
  let lastReports: PriceReport[] = [];
  const here = () => product.price;
  const intro = () => {
    others = sourcesFrom(store, product.name).map((s) => s.name);
    list.hidden = true;
    root.querySelector('.diag')?.remove();
    go.textContent = 'Comparar preço';
    const code = product.mpn && !product.name.toLowerCase().includes(product.mpn.toLowerCase()) ? ` (${product.mpn})` : '';
    lastReports = [];
    renderWatch();
    msg.textContent = `${product.name}${code}${here() !== null ? ` · ${hereLabel} ${formatBRL(here()!)}` : ''}. Procura o mesmo modelo em ${others.join(', ')} (sem frete).`;
  };
  // Sacola com vários itens: você escolhe qual comparar.
  if (products.length > 1) {
    pick.replaceChildren(...products.map((p, i) => Object.assign(document.createElement('option'), { value: String(i), textContent: p.name })));
    pick.hidden = false;
    pick.addEventListener('change', () => {
      product = products[Number(pick.value)] ?? product;
      intro();
    });
  }
  intro();

  go.addEventListener('click', async () => {
    go.disabled = true;
    pick.disabled = true;
    list.hidden = true;
    msg.textContent = `Procurando em ${others.join(', ')}… Abro e fecho umas abas de fundo, leva uns 15 segundos.`;
    try {
      const message: ComparePricesMessage = { type: 'compare-prices', from: store, product };
      const reports = (await browser.runtime.sendMessage(message)) as ComparePricesResponse | { error: string };
      if (!Array.isArray(reports)) throw new Error(reports?.error ?? 'sem resposta');
      lastReports = reports;
      show(reports, here());
    } catch (error) {
      console.warn('[Discount Beast]', error);
      msg.textContent = `Não consegui comparar: ${(error as Error).message}`;
    } finally {
      go.disabled = false;
      pick.disabled = false;
      go.textContent = 'Comparar de novo';
    }
  });

  /** Botão do alerta: mostra se este produto já está na lista "Vigiando". */
  async function renderWatch() {
    const watch = await getWatch(watchId(product.url)).catch(() => null);
    watchBtn.classList.toggle('on', Boolean(watch));
    watchBtn.textContent = watch ? '🔕 Parar de avisar' : '🔔 Avisar quando baixar';
    watchMsg.hidden = !watch;
    if (watch) {
      const low = watch.low ? `Menor preço visto: ${formatBRL(watch.low.price)} na ${watch.low.storeName}.` : '';
      watchMsg.textContent = `Vigiando. ${low} Aviso quando baixar disso (confiro a cada 6 h, com o Chrome aberto).`;
    }
  }
  // A primeira conferência termina em segundo plano (ou o outro computador mudou a lista): atualiza o texto.
  const onStorage = (changes: Record<string, unknown>, area: string) => {
    if (!host.isConnected) return browser.storage.onChanged.removeListener(onStorage);
    if (isWatchChange(changes, area)) renderWatch();
  };
  browser.storage.onChanged.addListener(onStorage);

  watchBtn.addEventListener('click', async () => {
    watchBtn.disabled = true;
    let note = '';
    try {
      const id = watchId(product.url);
      if (await getWatch(id)) {
        await removeWatch(id);
      } else {
        // Sem a cópia da página (snapshot): a mensagem fica leve.
        const reports = lastReports.map(({ snapshot: _skip, ...r }) => r);
        const message: WatchAddMessage = { type: 'watch-add', from: store, product, reports };
        const res = (await browser.runtime.sendMessage(message)) as { ok?: boolean; error?: string } | undefined;
        if (!res?.ok) throw new Error(res?.error ?? 'sem resposta');
        note = 'Marcado! Agora confiro o preço de hoje em todas as lojas, numa janela minimizada (uns 20 segundos).';
      }
    } catch (error) {
      note = `Não consegui: ${(error as Error).message}`;
    }
    await renderWatch();
    if (note) {
      watchMsg.hidden = false;
      watchMsg.textContent = note;
    }
    watchBtn.disabled = false;
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
      msg.append('Menor preço: ', strong, ` (${formatBRL(price - best.match!.price)} a menos que ${hereLabel}).`);
    } else if (best.match!.price === price) msg.textContent = `Mesmo preço na ${best.storeName} (${formatBRL(price)}). Nenhuma loja está mais barata.`;
    else msg.textContent = `${hereLabel === 'aqui' ? 'Aqui já é' : 'A sacola já tem'} o menor preço (${formatBRL(price)}).`;

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
      // O Chrome só deixa baixar 1 arquivo por clique (os outros são bloqueados sem aviso):
      // cada clique salva o diagnóstico de uma loja.
      let next = 0;
      const label = () => (next < empty.length ? `Salvar diagnóstico: ${empty[next]!.storeName} (${next + 1} de ${empty.length})` : `${empty.length} arquivo(s) salvo(s) em Downloads.`);
      const diag = Object.assign(document.createElement('button'), { className: 'diag', textContent: label() });
      diag.style.cssText = 'margin-top:8px;background:#6b7280;font-size:12px;padding:7px';
      diag.addEventListener('click', () => {
        const r = empty[next];
        if (!r) return;
        const s = r.snapshot!;
        const header = `<!-- discount-beast price search\nstore: ${r.store}\nsearch: ${r.searchUrl}\nurl: ${s.url}\ntitle: ${s.title.replaceAll('--', '- -')}\n-->\n`;
        downloadText(`discount-beast-busca-${r.store}.html`, header + s.html);
        next++;
        diag.textContent = label();
        diag.disabled = next >= empty.length;
      });
      go.after(diag);
    }
  }

  return host;
}
