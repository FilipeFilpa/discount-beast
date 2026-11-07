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

/** Tipos de produto de informática/eletrônicos (Kabum, Pichau, Terabyte). */
const TECH_CATEGORIES = [
  'placa', 'processador', 'memoria', 'ssd', 'hdd', 'gabinete', 'fonte', 'cooler', 'monitor', 'notebook', 'computador',
  'teclado', 'mouse', 'headset', 'fone', 'webcam', 'microfone', 'roteador', 'smartphone', 'celular', 'tablet',
  'console', 'controle', 'cadeira', 'impressora', 'smartwatch', 'pendrive', 'nobreak', 'estabilizador', 'tv',
];

const CATEGORIES = [
  'tenis', 'chuteira', 'sapatenis', 'sapatilha', 'sandalia', 'chinelo', 'bota', 'camisa', 'camiseta', 'regata',
  'blusa', 'moletom', 'jaqueta', 'corta', 'agasalho', 'casaco', 'colete', 'calca', 'bermuda', 'short', 'shorts',
  'legging', 'top', 'saia', 'vestido', 'macacao', 'meia', 'meiao', 'bone', 'viseira', 'gorro', 'mochila', 'bolsa',
  'mala', 'necessaire', 'pochete', 'bola', 'luva', 'caneleira', 'garrafa', 'squeeze', 'relogio', 'oculos', 'conjunto',
  ...TECH_CATEGORIES,
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
  // Informática: a Kabum põe "Gamer" em quase tudo; as outras lojas nem sempre.
  'gamer', 'pc',
]);

/** Informática: nome do chip e marketing que umas lojas põem no título e outras não. */
const TECH_NOISE = new Set(['nvidia', 'geforce', 'radeon', 'dlss', 'ray', 'tracing', 'rgb', 'argb', 'fsr', 'reflex', 'led', 'processamento', 'video', 'leitura', 'gravacao', 'escrita', 'velocidade', 's', 'ate', 'max', 'camera', 'dupla', 'tripla', 'tela', 'display', 'cache', 'dualsense', 'edicao']);

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

/** Unidade depois de um número: "8 GB", "128-bit", "6-Core" viram uma palavra só ("8gb", "128bit", "6core"). */
const UNITS = new Set([
  'gb', 'tb', 'mb', 'kb', 'mhz', 'ghz', 'hz', 'bit', 'bits', 'mm', 'cm', 'pol', 'polegadas', 'nucleos', 'core', 'cores',
  'thread', 'threads', 'rpm', 'ms', 'watts', 'mah', 'mp', 'dpi', 'fps',
  // Quantidade de acessórios/brindes: "1 Controle", "+9 Jogos", "12 Meses de garantia".
  'controle', 'controles', 'jogo', 'jogos', 'meses', 'unidade', 'unidades', 'un', 'pecas',
]);
/** Palavra antes de um número que faz dele uma especificação: "PCIe 4.0", "M.2", "USB 3.2", "DDR 4". */
const SPEC_PREFIX = new Set(['tela', 'pcie', 'usb', 'm', 'ddr', 'gddr', 'wifi', 'wi', 'hdmi', 'sata', 'gen', 'dp', 'bluetooth', 'android', 'ios', 'windows']);
/** Especificação técnica: ajuda a comparar, mas não é o "nome" do modelo. */
function isSpec(word: string): boolean {
  return (
    /^\d+(\.\d+)?(gb|tb|mb|kb|mhz|ghz|hz|bit|bits|mm|cm|pol|polegadas|nucleos|core|cores|thread|threads|rpm|ms|w|watts|v|mah|mp|dpi|fps|k|p|controles?|jogos?|meses|unidades?|un|pecas)$/.test(word) ||
    /^(lp)?g?ddr\d+x?$/.test(word) ||
    /^(tela|pcie|usb|m|ddr|gddr|wifi|wi|hdmi|sata|gen|dp|bluetooth|android|ios|windows)\d+(\.\d+)?$/.test(word) ||
    /^\d+x\d+(gb|mb)?$/.test(word) ||
    /^(pcie|nvme|sata|ssd|usb|hdmi|bluetooth|wifi)$/.test(word) ||
    // Formato do SSD M.2 (2280, 2242, 2230).
    /^22[348]0$/.test(word)
  );
}
/** Versão do modelo que muda o produto: RTX 4060 x 4060 Ti, iPhone 15 x 15 Pro Max, Galaxy S24 x S24 Ultra. */
const VARIANTS = new Set(['ti', 'super', 'xt', 'xtx', 'pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'se', 'fe', 'neo', 'air']);

function tokens(title: string): string[] {
  const out: string[] = [];
  for (const w of words(title)) {
    // "4060Ti" → "4060 ti" (lojas escrevem junto ou separado).
    const split = w.match(/^(\d+)(ti|super|xt|xtx)$/);
    if (split) out.push(split[1]!, split[2]!);
    else out.push(w);
  }
  const merged: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const w = out[i]!;
    const next = out[i + 1] ?? '';
    if (/^\d+(\.\d+)?$/.test(w) && UNITS.has(next)) {
      merged.push(`${w}${next}`);
      i++;
    } else if (SPEC_PREFIX.has(w) && /^\d+(\.\d+)?$/.test(next)) {
      merged.push(`${w}${next}`);
      i++;
    } else merged.push(w);
  }
  return merged;
}

/**
 * Códigos de peça (part number) em informática. "RTX4060" ou "B550M" sozinhos são o chip, e várias
 * placas diferentes usam o mesmo; o que identifica o produto é o código inteiro: "DUAL-RTX4060-O8G",
 * "SNV2S/1000G", "27GS60F-B", "100-100000927BOX".
 */
const PART_NUMBER = /[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)+/g;
function isPartNumber(raw: string): boolean {
  const joined = raw.toLowerCase().replace(/[-/]/g, '');
  return joined.length >= 8 && /[a-z]/.test(joined) && /\d.*\d/.test(joined) && !isSpec(joined) && !isSpec(raw.toLowerCase().split(/[-/]/).join(''));
}
function partNumbers(title: string): string[] {
  return [...new Set([...title.matchAll(PART_NUMBER)].map((m) => m[0]).filter(isPartNumber).map((m) => m.toLowerCase().replace(/[-/]/g, '')))];
}
/** O título sem os códigos de peça: os pedaços do código ("RTX4060", "O8G") não contam como palavras do modelo. */
function withoutPartNumbers(title: string): string {
  return title.replace(PART_NUMBER, (m) => (isPartNumber(m) ? ' ' : m));
}

interface Profile {
  category: string | null;
  gender: string | null;
  /** Palavras do modelo, sem marca, tipo, público, cor e tamanho. */
  model: string[];
  /** Códigos que parecem de modelo/produto (letras + números), ex.: "ie7262". */
  codes: string[];
  /** Informática/eletrônicos (placa de vídeo, SSD, monitor...). */
  tech: boolean;
  /** Códigos de peça completos (só informática). */
  parts: string[];
  /** Números do modelo, na ordem do título ("ryzen 5 5600" → 5, 5600). Sem especificações. */
  numbers: string[];
  /** Versões que mudam o produto, logo depois de um número/código ("4060 ti" → ti). */
  variants: string[];
  /** Maior capacidade em GB ("1TB" → 1000), ou null. */
  capacity: number | null;
  /** Todas as capacidades em GB ("16GB 512GB" → 16, 512). */
  capacities: number[];
  /** Todas as palavras do título (sem códigos de peça, em informática). */
  all: string[];
}

function profile(title: string, brand: string | null): Profile {
  const brandWords = new Set(words(realBrand(brand)));
  // "Tam 42", "Tamanho M", "Nº 40": a palavra depois é tamanho.
  const sizeless = (list: string[]) => list.filter((w, i) => !/^(tam|tamanho|n|no|numero)$/.test(list[i - 1] ?? ''));
  const category = tokens(title).find((w) => CATEGORIES.includes(w)) ?? null;
  const tech = !!category && TECH_CATEGORIES.includes(category);
  const parts = tech ? partNumbers(title) : [];
  const all = sizeless(tokens(tech ? withoutPartNumbers(title) : title));
  // A adidas termina o nome com "M" (masculino) ou "W" (feminino): "Tênis Adizero Drive RC M".
  const last = all[all.length - 1];
  const gender = tech ? null : all.map((w) => GENDERS[w]).find(Boolean) ?? (last === 'm' ? 'm' : last === 'w' ? 'f' : null);
  const model = all.filter((w) => !brandWords.has(w) && !CATEGORIES.includes(w) && !GENDERS[w] && !NOISE.has(w) && (tech ? !TECH_NOISE.has(w) : !isSize(w)));
  const codes = tech
    ? [...parts, ...all.filter((w) => w.length >= 6 && !isSpec(w) && (/[a-z]\d+[a-z]/.test(w) || /^\d{5,}[a-z]+$/.test(w)))]
    : all.filter((w) => w.length >= 5 && /[a-z]/.test(w) && /\d/.test(w) && !isSpec(w));
  const numbers = model.filter((w) => /^\d+(\.\d+)?$/.test(w));
  const variants = new Set<string>();
  for (let i = 1; i < all.length; i++) {
    const w = all[i]!;
    if (!VARIANTS.has(w)) continue;
    // Volta pelas versões seguidas ("pro max") até achar o número/código do modelo.
    let j = i - 1;
    while (j >= 0 && VARIANTS.has(all[j]!)) j--;
    const anchor = all[j] ?? '';
    if (/\d/.test(anchor) && !isSpec(anchor)) variants.add(w);
  }
  const capacities = all
    .map((w) => w.match(/^(\d+(?:\.\d+)?)(gb|tb)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => Number(m[1]) * (m[2] === 'tb' ? 1000 : 1));
  return {
    category, gender, model: [...new Set(model)], codes, tech, parts, numbers, variants: [...variants].sort(),
    capacity: capacities.length ? Math.max(...capacities) : null, capacities: [...new Set(capacities)].sort((x, y) => x - y), all,
  };
}

/** Marca "de mentira" que algumas lojas põem no cadastro ("Outros", "Genérico"): é como não ter marca. */
const FAKE_BRANDS = /^(outros?|outras?|generic[oa]?|sem marca|diversos|variados|nao informado|n a|na|none|other|others|unbranded|marca)$/;
function realBrand(brand: string | null): string {
  const b = brand ? normalize(brand) : '';
  return FAKE_BRANDS.test(b) ? '' : b;
}

/** Texto para buscar nas outras lojas: tipo + marca + modelo (sem cor, tamanho e público). */
export function searchQuery(product: Pick<PageProduct, 'name' | 'brand'>): string {
  const p = profile(product.name, product.brand);
  const brand = realBrand(product.brand);
  // Informática: sem as especificações ("8gb", "gddr6"), que deixam a busca restrita demais. A capacidade fica.
  const model = p.model.filter((w) => !p.codes.includes(w) && !(p.tech && isSpec(w) && !/^\d+(\.\d+)?(gb|tb)$/.test(w))).slice(0, 5);
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

  const brand = realBrand(product.brand);
  const hitWords = words(hit.title);
  // Na loja da própria marca (adidas.com.br) o título não repete a marca: vale o endereço também.
  if (brand && !haystack.includes(brand)) return { score: 0, why: 'outra marca' };

  const a = profile(product.name, product.brand);
  const b = profile(hit.title, product.brand);
  if (a.category && b.category && a.category !== b.category && !hitWords.includes(a.category)) return { score: 0, why: `é ${b.category}, não ${a.category}` };
  if (a.gender && b.gender && a.gender !== b.gender && a.gender !== 'u' && b.gender !== 'u') return { score: 0, why: 'outro público (masculino/feminino/infantil)' };
  // RTX 4060 x 4060 Ti, iPhone 15 x 15 Pro: o resto do título pode ser igual, mas é outro produto.
  if (a.variants.join() !== b.variants.join()) return { score: 0.3, why: 'outra versão do modelo' };
  // SSD 1TB x 500GB, notebook 8GB x 16GB.
  if (a.capacity && b.capacity && (a.capacity !== b.capacity || (a.capacities.length > 1 && b.capacities.length > 1 && a.capacities.join() !== b.capacities.join()))) {
    return { score: 0.3, why: 'outra capacidade' };
  }
  if (a.tech || b.tech) {
    // Informática: os títulos trazem muitos números diferentes (núcleos, leitura MB/s, 2280...).
    // Valem os 2 primeiros números do modelo: "RTX 4060" x "RTX 4070", "Ryzen 5 5600" x "Ryzen 5 7600".
    const lead = Math.min(2, a.numbers.length, b.numbers.length);
    for (let i = 0; i < lead; i++) {
      if (a.numbers[i] !== b.numbers[i]) return { score: 0.3, why: 'outro número de modelo' };
    }
    // "5600" x "5600X", "13400" x "13400F": letra grudada no número é outra versão.
    const suffixed = (x: Profile, y: Profile) => x.numbers.some((n) => !y.numbers.includes(n) && y.all.some((w) => w.startsWith(n) && /^[a-z]{1,3}\d?[a-z]?$/.test(w.slice(n.length)) && !isSpec(w)));
    if (suffixed(a, b) || suffixed(b, a)) return { score: 0.3, why: 'outra versão do modelo' };
  }
  if (a.codes.some((c) => b.codes.includes(c))) return { score: 1, why: 'mesmo código do modelo' };
  // Os dois títulos trazem o código de peça e nenhum bate: são produtos diferentes (ex.: DUAL-... x TUF-...).
  if (a.parts.length && b.parts.length && !a.parts.some((x) => b.parts.some((y) => x.includes(y) || y.includes(x)))) {
    return { score: 0.3, why: 'outro código de peça' };
  }
  if (a.model.length === 0) return { score: 0, why: 'título sem modelo para comparar' };

  // Números do modelo ("22" em "Ultraboost 22", "2.0") têm de ser os mesmos: são versões diferentes.
  if (!a.tech && !b.tech && (a.numbers.some((n) => !b.numbers.includes(n)) || b.numbers.some((n) => !a.numbers.includes(n)))) {
    return { score: 0.3, why: 'versão diferente do modelo' };
  }

  // Dice: quanto das palavras do modelo aparecem nos dois títulos.
  // Informática: as especificações (velocidade, MB/s, GDDR6...) cada loja escreve de um jeito; já foram
  // conferidas acima (capacidade, versão). Aqui contam só as palavras do nome do modelo.
  const nameA = a.tech ? a.model.filter((w) => !isSpec(w)) : a.model;
  const nameB = a.tech ? b.model.filter((w) => !isSpec(w)) : b.model;
  if (nameA.length === 0) return { score: 0, why: 'título sem modelo para comparar' };
  const setB = new Set(nameB);
  const shared = nameA.filter((w) => setB.has(w)).length;
  const dice = (2 * shared) / (nameA.length + nameB.length);
  // Todas as palavras do modelo da página aparecem no resultado: bônus (lojas costumam pôr mais palavras no título).
  const coverage = shared / nameA.length;
  const score = Math.min(1, 0.5 * dice + 0.5 * coverage);
  return { score: Math.round(score * 100) / 100, why: `${shared} de ${nameA.length} palavras do modelo` };
}

export interface BestMatch extends SearchHit {
  score: number;
  why: string;
}

/** O resultado mais barato entre os que são o mesmo produto (ou null se nenhum bater). */
export function bestMatch(product: PageProduct, hits: SearchHit[]): BestMatch | null {
  const matches = hits
    .map((hit) => ({ ...hit, ...matchScore(product, hit) }))
    // Preço menor que 1/4 do daqui quase sempre é leitura errada (selo de cupom, parcela, frete), não oferta.
    .filter((m) => m.score >= MATCH_MIN && m.price > 0 && !(product.price && m.price < product.price / 4));
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
