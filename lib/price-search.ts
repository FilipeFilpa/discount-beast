import type { StoreId } from './stores';
import type { SearchHit } from './product-match';

/**
 * Onde o comparador procura. A busca abre a página de busca normal da loja numa aba
 * de fundo do SEU Chrome (como se você mesmo pesquisasse), lê os resultados e fecha a aba.
 * Não usa servidor nem API paga, e não tenta enganar a proteção anti-robô das lojas.
 */
export interface PriceSource {
  id: StoreId;
  name: string;
  searchUrl: (query: string) => string;
  /** Links que são página de produto (para não pegar banner, categoria etc.). */
  productLink: RegExp;
}

const slug = (q: string) => encodeURIComponent(q.trim().replace(/\s+/g, '-'));
const plus = (q: string) => encodeURIComponent(q.trim()).replace(/%20/g, '+');

export const PRICE_SOURCES: PriceSource[] = [
  {
    id: 'adidas',
    name: 'adidas',
    searchUrl: (q) => `https://www.adidas.com.br/search?q=${plus(q)}`,
    // ex.: /tenis-duramo-sl/IE7262.html
    productLink: /adidas\.com\.br\/[^?#]*\/[A-Z0-9]{6}\.html/i,
  },
  {
    id: 'netshoes',
    name: 'Netshoes',
    searchUrl: (q) => `https://www.netshoes.com.br/busca?nsCat=Natural&q=${plus(q)}`,
    // ex.: /p/tenis-adidas-adizero-drive-rc-masculino-FBA-86EP-492 (o final é o código do produto)
    productLink: /netshoes\.com\.br\/(p\/)?[^?#]*[A-Z0-9]{3}-[A-Z0-9]{4}-\d{3}/i,
  },
  {
    id: 'centauro',
    name: 'Centauro',
    searchUrl: (q) => `https://www.centauro.com.br/busca/${slug(q)}`,
    // ex.: /tenis-adidas-duramo-sl-masculino-984307.html
    productLink: /centauro\.com\.br\/[^?#]*-\d{5,}\.html|centauro\.com\.br\/[^?#]*\/p\b/i,
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    searchUrl: (q) => `https://lista.mercadolivre.com.br/${slug(q)}`,
    // ex.: produto.mercadolivre.com.br/MLB-123..., mercadolivre.com.br/.../p/MLB123 ou .../up/MLBU123
    productLink: /mercadolivre\.com\.br\/[^?#]*MLBU?-?\d{6,}/i,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    searchUrl: (q) => `https://www.amazon.com.br/s?k=${plus(q)}`,
    // ex.: /Tenis-Adidas-Adizero-Masculino/dp/B0CXYZ1234 ou /gp/product/B0CXYZ1234 (o código é o ASIN)
    productLink: /amazon\.com\.br\/(?:[^?#]*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i,
  },
  {
    id: 'magalu',
    name: 'Magalu',
    searchUrl: (q) => `https://www.magazineluiza.com.br/busca/${plus(q)}/`,
    // ex.: /tenis-adidas-adizero-drive-rc-masculino/p/jk6bd8a1e0/es/tnis/
    productLink: /magazineluiza\.com\.br\/[^?#]*\/p\/[a-z0-9]{6,}/i,
  },
];

export const PRICE_STORES: StoreId[] = PRICE_SOURCES.map((s) => s.id);

export function sourceFor(id: StoreId): PriceSource | undefined {
  return PRICE_SOURCES.find((s) => s.id === id);
}

/**
 * Lê os resultados da página de busca. Esta função roda DENTRO da aba da loja
 * (via chrome.scripting.executeScript), por isso não pode usar nada de fora dela:
 * tudo que ela precisa está aqui dentro ou chega pelos argumentos.
 *
 * Sem seletores fixos de cada loja: para cada link de produto, sobe no HTML até achar
 * o "cartão" do produto (o bloco que tem um preço R$ e só esse produto) e lê título e preço.
 * Preço riscado ("de R$ 499") e parcela ("10x de R$ 39,99") são ignorados.
 */
export async function extractSearchHits(linkPattern: string, max = 24, mode: 'live' | 'generic' | 'fetch' = 'live'): Promise<SearchHit[]> {
  // Plano B (generic): qualquer link da própria loja com nome comprido de produto (4+ hifens no caminho).
  // Plano C (fetch): a loja não desenha a lista numa aba de fundo (Mercado Livre). Baixa o HTML da própria
  // busca (mesmo site, seus cookies) e lê os produtos que já vêm prontos nele.
  const doc = mode === 'fetch' ? new DOMParser().parseFromString(await (await fetch(location.href, { credentials: 'include' })).text(), 'text/html') : document;
  const productLink = mode === 'generic' ? new RegExp(`^https?://[^/]*${location.hostname.replace(/^www\./, '').replace(/\./g, '\\.')}/[^?#]*-[^?#/]*-[^?#/]*-[^?#/]*-`, 'i') : new RegExp(linkPattern, 'i');
  const PRICE = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g;
  // Link de anúncio da Amazon (/sspa/click?...url=%2F...%2Fdp%2FB0...) traz o endereço real codificado.
  const hrefOf = (a: HTMLAnchorElement) => {
    if (!/\/sspa\/click/.test(a.href)) return a.href;
    try {
      const real = new URL(a.href).searchParams.get('url');
      return real ? new URL(real, location.origin).href : a.href;
    } catch {
      return a.href;
    }
  };
  // Amazon: o mesmo produto aparece com vários endereços; o ASIN (10 letras/números) é o que identifica.
  const asinOf = (href: string) => href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?=[/?#]|$)/i)?.[1];
  const keyOf = (href: string) => {
    const asin = asinOf(href);
    return asin ? `asin:${asin.toUpperCase()}` : (href.split(/[?#]/)[0] ?? href);
  };
  // Corta o "/ref=sr_1_1?..." mas mantém o nome no endereço (ajuda a conferir a marca).
  const cleanUrl = (href: string) => href.match(/^https?:\/\/[^?#]*?\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i)?.[0] ?? href;
  // Cartões que a loja já marca: Amazon (div[data-asin]) e Magalu (o próprio link é o cartão).
  const CARD = '[data-component-type="s-search-result"][data-asin], [data-asin]:not([data-asin=""]), [data-testid="product-card-container"]';

  const struck = (el: Element, stop: Element) => {
    for (let node: Element | null = el; node && node !== stop.parentElement; node = node.parentElement) {
      if (/^(S|DEL|STRIKE)$/.test(node.tagName)) return true;
      // a-text-price / data-a-strike = "De: R$ 799" na Amazon; price-original = preço antigo na Magalu.
      if (/previous|old-?price|list-?price|price-?from|from-?price|original|a-text-price/i.test(`${node.getAttribute('class') ?? ''} ${node.getAttribute('data-testid') ?? ''}`)) return true;
      if (node.getAttribute('data-a-strike') === 'true') return true;
      try {
        if (mode !== 'fetch' && getComputedStyle(node).textDecorationLine.includes('line-through')) return true;
      } catch {
        // página baixada (plano C) não tem estilos calculados
      }
    }
    return false;
  };
  const installment = (el: Element, stop: Element) => {
    for (let node: Element | null = el; node && node !== stop.parentElement; node = node.parentElement) {
      if (/installment|parcel/i.test(`${node.getAttribute('class') ?? ''} ${node.getAttribute('data-testid') ?? ''}`)) return true;
    }
    return false;
  };

  /** Preços "valendo" dentro do cartão. */
  const pricesIn = (card: Element): number[] => {
    const prices: number[] = [];
    // Mercado Livre divide o preço em pedaços: <span fraction>149</span><span cents>99</span>.
    for (const amount of card.querySelectorAll('.andes-money-amount')) {
      if (struck(amount, card) || installment(amount, card)) continue;
      const fraction = amount.querySelector('.andes-money-amount__fraction')?.textContent?.replace(/\./g, '');
      const cents = amount.querySelector('.andes-money-amount__cents')?.textContent ?? '00';
      if (fraction) prices.push(Number(`${fraction}.${cents}`));
    }
    if (prices.length) return prices;
    // Amazon: o preço "valendo" vem num <span class="a-offscreen">R$ 599,99</span> dentro de .a-price.
    // Pega o primeiro (o principal); "Mais opções de compra" (usados, outros vendedores) fica de fora.
    for (const amount of card.querySelectorAll('.a-price .a-offscreen')) {
      if (struck(amount, card) || amount.closest('[data-cy="secondary-offer-recipe"]')) continue;
      const m = (amount.textContent ?? '').match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/);
      if (m) return [Number(`${m[1]!.replace(/\./g, '')}.${m[2] ?? '00'}`)];
    }
    const walker = doc.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el) continue;
      // O texto pode estar dividido ("R$" num span, "149,99" no outro): lê do pai.
      const text = /R\$/.test(node.textContent ?? '') && !/\d/.test(node.textContent ?? '') ? el.parentElement?.textContent ?? '' : node.textContent ?? '';
      for (const m of text.matchAll(PRICE)) {
        const before = text.slice(0, m.index).slice(-12);
        if (/\d+\s*x\s*(de\s*)?$/i.test(before)) continue;
        // Frete não conta ("R$ 19,90 de frete", "Entrega R$ 9,90").
        const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
        if (/^\s*(de\s+)?(frete|entrega)/i.test(after) || /(frete|entrega)[^\d]*$/i.test(text.slice(0, m.index).slice(-24))) continue;
        if (struck(el, card) || installment(el, card)) continue;
        const value = Number(`${m[1]!.replace(/\./g, '')}.${m[2] ?? '00'}`);
        if (value > 0) prices.push(value);
      }
    }
    return prices;
  };

  const links = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => productLink.test(hrefOf(a)) && !/click1\.|\/mclics\//.test(a.href));
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const href = hrefOf(link);
    const key = keyOf(href);
    if (seen.has(key)) continue;
    // Sobe até o cartão: o primeiro ancestral com um preço, sem passar para um bloco com outros produtos.
    let card: Element = link;
    let prices: number[] = [];
    const marked = link.closest(CARD);
    // Link de outra cor/variação dentro do cartão da Amazon: não é este produto.
    const cardAsin = marked?.getAttribute('data-asin');
    if (cardAsin && asinOf(href) && keyOf(href) !== `asin:${cardAsin.toUpperCase()}`) continue;
    if (marked) {
      card = marked;
      prices = pricesIn(marked);
    }
    for (let up = 0, node: Element | null = link; !marked && node && up < 8; up++, node = node.parentElement) {
      const others = [...node.querySelectorAll<HTMLAnchorElement>('a[href]')].some((a) => productLink.test(hrefOf(a)) && keyOf(hrefOf(a)) !== key);
      if (others) break;
      card = node;
      prices = /R\$/.test(node.textContent ?? '') ? pricesIn(node) : [];
      if (prices.length) break;
    }
    // Sem preço no cartão (a Netshoes só mostra "Confira" numa aba de fundo): entra com preço 0,
    // e o background busca o preço na página do produto se o título bater.
    // Em ordem de preferência. Amazon (Moda) mostra a marca num h2 e o nome em outro: junta os dois.
    const amazonTitle = [...card.querySelectorAll('[data-cy="title-recipe"] h2')].map((h) => h.textContent?.trim()).filter(Boolean).join(' ');
    const titleEl = ['[data-testid="product-title"]', 'h2, h3, [class*="title" i], [class*="name" i]'].map((sel) => card.querySelector(sel)).find(Boolean);
    const candidates = [link.getAttribute('data-name'), amazonTitle, titleEl?.textContent, link.getAttribute('title'), link.getAttribute('aria-label'), link.textContent, card.querySelector('img[alt]')?.getAttribute('alt')]
      // Rótulos de acessibilidade como "Ir para a página do produto Tênis..." (Centauro).
      .map((t) => (t ?? '').replace(/\s+/g, ' ').trim().replace(/^ir para (a )?(p[aá]gina )?(d[oe] )?(produto )?/i, ''))
      .filter((t) => t.length >= 6 && !/R\$/.test(t));
    const title = candidates[0];
    if (!title) continue;
    seen.add(key);
    hits.push({ title, price: prices.length ? Math.min(...prices) : 0, url: cleanUrl(href) });
    if (hits.length >= max) break;
  }
  return hits;
}

/**
 * Diagnóstico: quando uma busca volta vazia, guarda uma cópia limpa da página que a aba viu
 * (sem scripts, imagens e estilos) para o Filipe mandar e a gente ajustar a loja.
 * Também roda dentro da aba, então não usa nada de fora.
 */
export async function snapshotSearchPage(): Promise<{ url: string; title: string; html: string }> {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript, iframe, svg, img, picture, video, link, meta, template, input').forEach((el) => el.remove());
  for (const el of clone.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (attr.name === 'style' || attr.name.startsWith('on') || attr.name === 'srcset' || attr.name === 'd') el.removeAttribute(attr.name);
    }
  }
  // O HTML que o servidor mandou (antes do JavaScript da loja mexer), para ver se os produtos vêm nele.
  let raw = '';
  try {
    raw = (await (await fetch(location.href, { credentials: 'include' })).text()).slice(0, 3_000_000);
  } catch (error) {
    raw = `fetch falhou: ${String(error)}`;
  }
  const html = `${clone.outerHTML.slice(0, 2_000_000)}\n<!-- ===== HTML bruto do servidor ===== -->\n<textarea>${raw.replaceAll('</textarea', '&lt;/textarea')}</textarea>`;
  return { url: location.href, title: document.title, html };
}

/**
 * Lê o preço na página do produto (JSON-LD ou meta tags). Roda dentro da aba da loja,
 * então o pedido sai do próprio site, com os seus cookies, como um clique normal.
 */
export async function fetchProductPrice(url: string): Promise<number | null> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) return null;
  const html = await response.text();
  const prices: number[] = [];
  const collect = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => collect(n, depth + 1));
    const o = node as Record<string, unknown>;
    for (const key of ['price', 'lowPrice']) {
      const n = Number(String(o[key] ?? '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) prices.push(n);
    }
    for (const key of ['offers', '@graph', 'hasVariant', 'priceSpecification']) collect(o[key], depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collect(JSON.parse(m[1] ?? ''));
    } catch {
      // bloco quebrado: ignora
    }
  }
  if (!prices.length) {
    const meta = html.match(/property="product:price:amount"\s+content="([\d.]+)"/i) ?? html.match(/content="([\d.]+)"\s+property="product:price:amount"/i);
    if (meta?.[1]) prices.push(Number(meta[1]));
  }
  return prices.length ? Math.min(...prices) : null;
}

/** Baixa o HTML da página aberta na aba (mesmo site, seus cookies). Roda dentro da aba. */
export async function fetchPageText(): Promise<string> {
  const response = await fetch(location.href, { credentials: 'include' });
  return (await response.text()).slice(0, 5_000_000);
}
