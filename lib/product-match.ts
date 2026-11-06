/**
 * Comparador de preços: decide se um resultado de busca de outra loja é o MESMO produto
 * que você está vendo. Tudo aqui é texto puro (sem DOM), para dar para testar com `npm test`.
 *
 * Como decide:
 * 1. EAN (código de barras) ou código do modelo iguais → é o mesmo produto, sem dúvida.
 * 2. Sem código: a marca tem de aparecer, o tipo (tênis, camisa...) e o público
 *    (masculino/feminino) não podem ser diferentes, e as palavras do modelo
 *    ("Duramo SL", "Ultraboost 22") têm de bater. Tamanho e cor não contam.
 */

/** O produto aberto na página. */
export interface PageProduct {
  name: string;
  brand: string | null;
  /** EAN/GTIN (código de barras), quando a página informa. */
  gtin: string | null;
  /** Código do modelo na loja (ex.: "IE7262" na adidas). */
  sku: string | null;
  price: number | null;
  url: string;
}

/** Um item que apareceu na busca de outra loja. */
export interface SearchHit {
  title: string;
  price: number;
  url: string;
}

const CATEGORIES = [
  'tenis', 'chuteira', 'sapatenis', 'sapatilha', 'sandalia', 'chinelo', 'bota', 'camisa', 'camiseta', 'regata',
  'blusa', 'moletom', 'jaqueta', 'corta', 'agasalho', 'casaco', 'colete', 'calca', 'bermuda', 'short', 'shorts',
  'legging', 'top', 'saia', 'vestido', 'macacao', 'meia', 'meiao', 'bone', 'viseira', 'gorro', 'mochila', 'bolsa',
  'mala', 'necessaire', 'pochete', 'bola', 'luva', 'caneleira', 'garrafa', 'squeeze', 'relogio', 'oculos', 'conjunto',
];

const GENDERS: Record<string, string> = {
  masculino: 'm', masculina: 'm', homem: 'm', men: 'm', mens: 'm',
  feminino: 'f', feminina: 'f', mulher: 'f', women: 'f', womens: 'f',
  infantil: 'k', juvenil: 'k', kids: 'k', bebe: 'k', menino: 'k', menina: 'k',
  unissex: 'u', unisex: 'u',
};

/** Palavras que não ajudam a reconhecer o modelo. */
const NOISE = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'p', 'em', 'a', 'o', 'the', 'and', 'original', 'novo', 'nova',
  'lancamento', 'oficial', 'adulto', 'unidade', 'kit', 'par', 'tam', 'tamanho', 'cor', 'cores',
  // Cores: o mesmo modelo em outra cor ainda conta como o mesmo produto.
  'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'amarelo', 'amarela', 'cinza',
  'rosa', 'roxo', 'roxa', 'laranja', 'marrom', 'bege', 'marinho', 'grafite', 'chumbo', 'prata', 'dourado', 'dourada',
  'off', 'white', 'black', 'vinho', 'creme', 'lilas', 'nude', 'colorido', 'colorida', 'mescla', 'claro', 'clara', 'escuro', 'escura',
  'running', 'corrida', 'casual', 'esportivo', 'esportiva', 'academia', 'treino',
]);

/** Minúsculas, sem acento, só letras e números. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/** Tamanho no título ("Tam 42", "42/43", "P", "GG") não deve atrapalhar o match. */
function isSize(word: string): boolean {
  return /^(pp|p|m|g|gg|xg|xgg|eg|egg|\d{2}\/\d{2})$/.test(word);
}

interface Profile {
  category: string | null;
  gender: string | null;
  /** Palavras do modelo, sem marca, tipo, público, cor e tamanho. */
  model: string[];
  /** Códigos que parecem de modelo/produto (letras + números), ex.: "ie7262". */
  codes: string[];
}

function profile(title: string, brand: string | null): Profile {
  const brandWords = new Set(brand ? words(brand) : []);
  // "Tam 42", "Tamanho M", "Nº 40": a palavra depois é tamanho.
  const all = words(title).filter((w, i, list) => !/^(tam|tamanho|n|no|numero)$/.test(list[i - 1] ?? ''));
  const category = all.find((w) => CATEGORIES.includes(w)) ?? null;
  // A adidas termina o nome com "M" (masculino) ou "W" (feminino): "Tênis Adizero Drive RC M".
  const last = all[all.length - 1];
  const gender = all.map((w) => GENDERS[w]).find(Boolean) ?? (last === 'm' ? 'm' : last === 'w' ? 'f' : null);
  const model = all.filter((w) => !brandWords.has(w) && !CATEGORIES.includes(w) && !GENDERS[w] && !NOISE.has(w) && !isSize(w));
  const codes = all.filter((w) => w.length >= 5 && /[a-z]/.test(w) && /\d/.test(w));
  return { category, gender, model: [...new Set(model)], codes };
}

/** Texto para buscar nas outras lojas: tipo + marca + modelo (sem cor, tamanho e público). */
export function searchQuery(product: Pick<PageProduct, 'name' | 'brand'>): string {
  const p = profile(product.name, product.brand);
  const brand = product.brand ? normalize(product.brand) : '';
  const model = p.model.filter((w) => !p.codes.includes(w)).slice(0, 5);
  return [p.category, brand, ...model].filter(Boolean).join(' ');
}

export interface MatchResult {
  /** 0 a 1. Acima de MATCH_MIN conta como o mesmo produto. */
  score: number;
  why: string;
}

export const MATCH_MIN = 0.7;

/** Nota de 0 a 1 para "este resultado é o mesmo produto da página". */
export function matchScore(product: PageProduct, hit: Pick<SearchHit, 'title' | 'url'>): MatchResult {
  const haystack = normalize(`${hit.title} ${hit.url}`);
  if (product.gtin && haystack.includes(product.gtin)) return { score: 1, why: 'mesmo EAN' };
  const sku = product.sku ? normalize(product.sku) : '';
  if (sku.length >= 5 && /\d/.test(sku) && haystack.split(' ').includes(sku)) return { score: 1, why: 'mesmo código do modelo' };

  const brand = product.brand ? normalize(product.brand) : '';
  const hitWords = words(hit.title);
  // Na loja da própria marca (adidas.com.br) o título não repete a marca: vale o endereço também.
  if (brand && !haystack.includes(brand)) return { score: 0, why: 'outra marca' };

  const a = profile(product.name, product.brand);
  const b = profile(hit.title, product.brand);
  if (a.category && b.category && a.category !== b.category && !hitWords.includes(a.category)) return { score: 0, why: `é ${b.category}, não ${a.category}` };
  if (a.gender && b.gender && a.gender !== b.gender && a.gender !== 'u' && b.gender !== 'u') return { score: 0, why: 'outro público (masculino/feminino/infantil)' };
  if (a.codes.some((c) => b.codes.includes(c))) return { score: 1, why: 'mesmo código do modelo' };
  if (a.model.length === 0) return { score: 0, why: 'título sem modelo para comparar' };

  // Números do modelo ("22" em "Ultraboost 22", "2.0") têm de ser os mesmos: são versões diferentes.
  const numbersA = a.model.filter((w) => /^\d+(\.\d+)?$/.test(w));
  const numbersB = b.model.filter((w) => /^\d+(\.\d+)?$/.test(w));
  if (numbersA.some((n) => !numbersB.includes(n)) || numbersB.some((n) => !numbersA.includes(n))) {
    return { score: 0.3, why: 'versão diferente do modelo' };
  }

  // Dice: quanto das palavras do modelo aparecem nos dois títulos.
  const setB = new Set(b.model);
  const shared = a.model.filter((w) => setB.has(w)).length;
  const dice = (2 * shared) / (a.model.length + b.model.length);
  // Todas as palavras do modelo da página aparecem no resultado: bônus (lojas costumam pôr mais palavras no título).
  const coverage = shared / a.model.length;
  const score = Math.min(1, 0.5 * dice + 0.5 * coverage);
  return { score: Math.round(score * 100) / 100, why: `${shared} de ${a.model.length} palavras do modelo` };
}

export interface BestMatch extends SearchHit {
  score: number;
  why: string;
}

/** O resultado mais barato entre os que são o mesmo produto (ou null se nenhum bater). */
export function bestMatch(product: PageProduct, hits: SearchHit[]): BestMatch | null {
  const matches = hits
    .map((hit) => ({ ...hit, ...matchScore(product, hit) }))
    .filter((m) => m.score >= MATCH_MIN && m.price > 0);
  if (matches.length === 0) return null;
  // Entre os que batem, fica o mais barato; empate → o de nota maior.
  matches.sort((x, y) => x.price - y.price || y.score - x.score);
  return matches[0] ?? null;
}

/**
 * Lê o produto do JSON-LD da página (o bloco <script type="application/ld+json"> que as lojas
 * colocam para o Google). Recebe o texto de cada bloco.
 */
export function productFromJsonLd(blocks: string[], url: string): PageProduct | null {
  for (const text of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const found = findProduct(data);
    if (found) return toPageProduct(found, url);
  }
  return null;
}

type Json = Record<string, unknown>;

function isType(node: Json, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findProduct(data: unknown, depth = 0): Json | null {
  if (!data || typeof data !== 'object' || depth > 6) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProduct(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = data as Json;
  if (isType(node, 'Product') || isType(node, 'ProductGroup')) return node;
  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const found = findProduct(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function priceOf(offers: unknown): number | null {
  const list = Array.isArray(offers) ? offers : [offers];
  const prices: number[] = [];
  for (const offer of list) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Json;
    for (const key of ['price', 'lowPrice']) {
      const n = Number(String(o[key] ?? '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) prices.push(n);
    }
    if (o.priceSpecification) {
      const p = priceOf(o.priceSpecification);
      if (p) prices.push(p);
    }
  }
  return prices.length ? Math.min(...prices) : null;
}

function toPageProduct(node: Json, url: string): PageProduct | null {
  // Um ProductGroup (modelo com várias cores/tamanhos) guarda preço e EAN nas variantes.
  const variants = Array.isArray(node.hasVariant) ? (node.hasVariant as Json[]) : [];
  const first = variants[0] ?? {};
  const name = str(node.name) ?? str(first.name);
  if (!name) return null;
  const brandNode = node.brand ?? first.brand;
  const brand = str(brandNode) ?? (brandNode && typeof brandNode === 'object' ? str((brandNode as Json).name) : null);
  const gtinOf = (n: Json) => str(n.gtin13) ?? str(n.gtin) ?? str(n.gtin14) ?? str(n.gtin12) ?? str(n.gtin8);
  const gtin = gtinOf(node) ?? gtinOf(first);
  const sku = str(node.productGroupID) ?? str(node.sku) ?? str(node.mpn) ?? str(first.sku);
  const price = priceOf(node.offers) ?? priceOf(variants.map((v) => v.offers).flat());
  return { name, brand, gtin: gtin && /^\d{8,14}$/.test(gtin) ? gtin : null, sku, price, url };
}
