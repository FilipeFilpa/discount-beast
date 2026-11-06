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
    // ex.: /p/tenis-adidas-duramo-sl-masculino-FB8-6385-006 (o final é o código do produto)
    productLink: /netshoes\.com\.br\/(p\/)?[^?#]*[A-Z0-9]{3}-\d{4}-\d{3}/i,
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
    // ex.: produto.mercadolivre.com.br/MLB-123... ou mercadolivre.com.br/.../p/MLB123
    productLink: /mercadolivre\.com\.br\/[^?#]*MLB-?\d{6,}/i,
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
export function extractSearchHits(linkPattern: string, max = 24): SearchHit[] {
  const productLink = new RegExp(linkPattern, 'i');
  const PRICE = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g;
  const keyOf = (href: string) => href.split(/[?#]/)[0] ?? href;

  const struck = (el: Element, stop: Element) => {
    for (let node: Element | null = el; node && node !== stop.parentElement; node = node.parentElement) {
      if (/^(S|DEL|STRIKE)$/.test(node.tagName)) return true;
      if (/previous|old-?price|list-?price|price-?from|from-?price|original/i.test(String(node.getAttribute('class') ?? ''))) return true;
      if (getComputedStyle(node).textDecorationLine.includes('line-through')) return true;
    }
    return false;
  };
  const installment = (el: Element, stop: Element) => {
    for (let node: Element | null = el; node && node !== stop.parentElement; node = node.parentElement) {
      if (/installment|parcel/i.test(String(node.getAttribute('class') ?? ''))) return true;
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
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el) continue;
      // O texto pode estar dividido ("R$" num span, "149,99" no outro): lê do pai.
      const text = /R\$/.test(node.textContent ?? '') && !/\d/.test(node.textContent ?? '') ? el.parentElement?.textContent ?? '' : node.textContent ?? '';
      for (const m of text.matchAll(PRICE)) {
        const before = text.slice(0, m.index).slice(-12);
        if (/\d+\s*x\s*(de\s*)?$/i.test(before)) continue;
        if (struck(el, card) || installment(el, card)) continue;
        const value = Number(`${m[1]!.replace(/\./g, '')}.${m[2] ?? '00'}`);
        if (value > 0) prices.push(value);
      }
    }
    return prices;
  };

  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => productLink.test(a.href) && !/click1\.|\/mclics\//.test(a.href));
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const key = keyOf(link.href);
    if (seen.has(key)) continue;
    // Sobe até o cartão: o primeiro ancestral com um preço, sem passar para um bloco com outros produtos.
    let card: Element = link;
    let prices: number[] = [];
    for (let up = 0, node: Element | null = link; node && up < 8; up++, node = node.parentElement) {
      const others = [...node.querySelectorAll<HTMLAnchorElement>('a[href]')].some((a) => productLink.test(a.href) && keyOf(a.href) !== key);
      if (others) break;
      card = node;
      prices = /R\$/.test(node.textContent ?? '') ? pricesIn(node) : [];
      if (prices.length) break;
    }
    if (!prices.length) continue;
    const titleEl = card.querySelector('h2, h3, [class*="title" i], [class*="name" i]');
    const candidates = [titleEl?.textContent, link.getAttribute('title'), link.getAttribute('aria-label'), card.querySelector('img[alt]')?.getAttribute('alt'), link.textContent]
      .map((t) => (t ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 6 && !/R\$/.test(t));
    const title = candidates[0];
    if (!title) continue;
    seen.add(key);
    hits.push({ title, price: Math.min(...prices), url: link.href });
    if (hits.length >= max) break;
  }
  return hits;
}
