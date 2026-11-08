/**
 * Compara as regras de cada cupom com o que está no carrinho, para testar primeiro
 * os que têm mais chance de funcionar. Tudo aqui é texto puro (sem DOM), para dar para testar com `npm test`.
 *
 * De onde vêm as regras: código (NIKE30, SUPLE15...), título e `terms` do feed
 * (ex.: "Válido apenas em compras a partir de R$70.").
 */

/** Um produto do carrinho, do jeito que a loja mostra. */
export interface CartItem {
  /** Ex.: "Tênis Masculino adidas Adizero Drive RC". */
  name: string;
  /** "Vendido por ..." (ex.: "Netshoes", "Centauro" ou outra loja parceira). */
  seller?: string;
  /** Selos que aparecem no produto (a Netshoes mostra o selo do cupom aqui). */
  stamps?: string;
}

export interface CartInfo {
  items: CartItem[];
  /** Total do carrinho sem cupom. */
  subtotal: number | null;
}

/** O que a gente entende de um cupom. */
export interface CouponRules {
  brands: string[];
  categories: string[];
  /** "masculino" / "feminino" quando o cupom é só para um público. */
  gender: string | null;
  /** Valor mínimo da compra, em reais. */
  minValue: number | null;
  /** "Válido em todo o site" ou parecido. */
  sitewide: boolean;
  /** "Itens selecionados", "produtos com o selo do cupom"... */
  selection: boolean;
  firstPurchase: boolean;
  appOnly: boolean;
  /** Só para assinantes (Amazon Prime, Meli+...). */
  membersOnly: boolean;
  birthday: boolean;
  /** Precisa de 2 ou mais peças (progressivo, "leve 3 pague 2"...). */
  needsMany: boolean;
  /** "vendidos e entregues pela <loja>" (true) ou "por outros parceiros" (false). */
  storeSellerOnly: boolean | null;
}

export interface CouponText {
  code: string;
  title?: string;
  terms?: string;
  sources?: unknown[];
}

/** Tira acentos e deixa minúsculo, para "Tênis" bater com "tenis". */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Marcas: nome canônico → palavras que aparecem no nome do produto ou no texto do cupom.
 * `code` são pedaços que, dentro do código (ex.: NBKR15), indicam a marca.
 */
const BRANDS: { name: string; words: RegExp; code?: RegExp }[] = [
  { name: 'adidas', words: /\b(adidas|addias|adizero|duramo|ultraboost|supernova|adilette)\b/, code: /ADIDAS|DURAMO/ },
  { name: 'nike', words: /\b(nike|jordan|pegasus)\b/, code: /NIKE/ },
  { name: 'puma', words: /\bpuma\b/, code: /PUMA/ },
  { name: 'mizuno', words: /\bmizuno\b/, code: /MIZUNO/ },
  { name: 'asics', words: /\basics\b/, code: /ASICS/ },
  { name: 'olympikus', words: /\b(olympikus|corre \d)\b/, code: /OLYMPIKUS|^CORRE$/ },
  { name: 'new balance', words: /\bnew balance\b/, code: /^NB/ },
  { name: 'under armour', words: /\bunder armour\b/, code: /^UNDER/ },
  { name: 'reebok', words: /\b(reebok|rebook)\b/, code: /REEBOK|REBOOK/ },
  { name: 'converse', words: /\bconverse\b/, code: /CONVERSE/ },
  { name: 'lacoste', words: /\blacoste\b/, code: /LACOSTE/ },
  { name: 'jbl', words: /\bjbl\b/, code: /JBL/ },
  { name: 'new era', words: /\bnew era\b/, code: /NEWERA/ },
  { name: 'crocs', words: /\bcrocs\b/, code: /CROCS/ },
  { name: 'cariuma', words: /\bcariuma\b/, code: /CARIUMA/ },
  { name: 'mormaii', words: /\bmormaii\b/, code: /MORMAII/ },
  { name: 'acero', words: /\bacero\b/ },
  { name: 'dark lab', words: /\bdark lab\b/ },
  { name: 'alpha co', words: /\balpha co\b/ },
  { name: 'fila', words: /\bfila\b/, code: /^FILA/ },
  { name: 'vans', words: /\bvans\b/, code: /^VANS/ },
  { name: 'oakley', words: /\boakley\b/, code: /OAKLEY/ },
  { name: 'hoka', words: /\bhoka\b/, code: /HOKA/ },
  { name: 'umbro', words: /\bumbro\b/, code: /UMBRO/ },
  { name: 'penalty', words: /\bpenalty\b/ },
  { name: 'topper', words: /\btopper\b/, code: /TOPPER/ },
  { name: 'nstyle', words: /\bnstyle\b/, code: /NSTYLE/ },
];

/** Categorias: palavras no nome do produto / no texto do cupom, e pedaços do código. */
/**
 * `type` = tipo de produto (tênis, roupas...): se o cupom diz um tipo, o carrinho precisa ter.
 * `theme` = esporte/ocasião (corrida, futebol...): difícil de ler no nome do produto, então pesa menos quando não bate.
 * `audience` = público (infantil): se o cupom é infantil, o carrinho precisa ter item infantil.
 */
type CategoryKind = 'type' | 'theme' | 'audience';
const CATEGORIES: { name: string; kind: CategoryKind; words: RegExp; code?: RegExp }[] = [
  { name: 'tênis', kind: 'type', words: /\b(tenis|calcados?|pisante|sapatenis)\b/, code: /^TENIS|TENNIS|CALCADO/ },
  { name: 'corrida', kind: 'theme', words: /\b(corrida|running|maratona|adizero|pegasus|supernova)\b/, code: /CORRIDA|RUN|MARATONA/ },
  { name: 'futebol', kind: 'theme', words: /\b(futebol|chuteira|society|futsal|bola)\b/, code: /^FUT|GOLACO|FUTEBOL/ },
  { name: 'suplementos', kind: 'type', words: /\b(suplementos?|creatina|whey|proteina|bcaa|pre-treino)\b/, code: /SUPLE|CREATINA|WHEY/ },
  { name: 'roupas', kind: 'type', words: /\b(camisetas?|camisas?|blusas?|blusao|jaquetas?|calcas?|moletom|bermudas?|shorts?|leggings?|regata|vestuario|roupas?|agasalho|casaco|top)\b/, code: /VEST|CAMISETA|ROUPA/ },
  { name: 'infantil', kind: 'audience', words: /\b(infantil|kids|juvenil|crianca|bebe|menino|menina)\b/, code: /KIDS|INFANTIL/ },
  { name: 'botas', kind: 'type', words: /\bbotas?\b/, code: /^BOTA/ },
  { name: 'meias', kind: 'type', words: /\b(meias?)\b/ },
  { name: 'perfumes', kind: 'type', words: /\b(perfumes?|fragrancias?|colonia)\b/, code: /PERFUME/ },
  { name: 'basquete', kind: 'theme', words: /\b(basquete|nba)\b/, code: /BASQUETE/ },
  { name: 'ciclismo', kind: 'theme', words: /\b(bike|bicicleta|ciclismo)\b/, code: /BIKE/ },
  { name: 'motorsport', kind: 'theme', words: /\b(motorsport|ferrari|f1|formula)\b/, code: /TURBO/ },
  { name: 'inverno', kind: 'theme', words: /\b(inverno|frio|jaqueta|moletom|blusao|casaco|corta-vento)\b/, code: /INVERNO/ },
];

const GENDER = [
  { name: 'feminino', words: /\b(feminin[oa]s?|mulher(es)?|elas)\b/, code: /ELAS$/ },
  { name: 'masculino', words: /\b(masculin[oa]s?|homem|homens|eles)\b/, code: /ELES$/ },
];

/** Lê as regras de um cupom a partir do código, do título e das condições. */
export function parseRules({ code, title = '', terms = '' }: CouponText): CouponRules {
  const text = normalize(`${title} ${terms}`);
  const upper = code.toUpperCase();
  const pick = (list: { name: string; words: RegExp; code?: RegExp }[]) =>
    list.filter((b) => b.words.test(text) || (b.code?.test(upper) ?? false)).map((b) => b.name);

  // "compras a partir de R$70", "acima de R$399", "pedidos de R$ 199,90"
  const min = text.match(/(?:a partir de|acima de|minimo de|compras? de|pedidos? de)\s*r\$\s*([\d.]+(?:,\d{1,2})?)/);
  const minValue = min ? Number(min[1]!.replace(/\./g, '').replace(',', '.')) : null;

  let storeSellerOnly: boolean | null = null;
  if (/outros parceiros|parceiros na|vendidos e entregues por (outros|parceiros)/.test(text)) storeSellerOnly = false;
  else if (/vendidos e entregues pel[ao]/.test(text)) storeSellerOnly = true;

  return {
    brands: pick(BRANDS),
    categories: pick(CATEGORIES),
    gender: GENDER.find((g) => g.words.test(text) || g.code.test(upper))?.name ?? null,
    minValue: Number.isFinite(minValue) ? minValue : null,
    sitewide: /todo o site|todos os produtos|todo site|em suas compras|seus pedidos|sua compra|site inteiro/.test(text),
    selection: /selecionad|selecao|selo|lista/.test(text),
    firstPurchase: /primeiras? compras?|boas[- ]vindas|novos? (clientes?|usuarios?)|primeiro pedido/.test(text) || /^PRIMEIRA|BOASVINDAS|BEMVINDO/.test(upper),
    // "Aplicável apenas no App", "válido apenas no aplicativo", "comprando no aplicativo", "no app Amazon"...
    appOnly:
      /\b(apenas|somente|so|exclusivo|exclusiva) (no|pelo|para o|para) (app|aplicativo)\b|valido (apenas |somente )?no (app|aplicativo)\b|comprando (no|pelo) (app|aplicativo)\b|\bno app (amazon|shopee|magalu|do mercado|mercado|ml|aliexpress)\b|\bpelo app\b/.test(text) ||
      /APP$|^APP(?!LE)|NOAPP/.test(upper),
    membersOnly: /\b(somente|apenas|exclusivo|exclusiva|so) (para )?(quem e |membros? |clientes? |assinantes? )?(prime|meli\+|meli mais)\b|assinantes? (prime|meli)|membros? prime|exclusivo prime/.test(text),
    birthday: /aniversario/.test(text),
    needsMany: /progressivo|leve \d|\d pecas|\d por r\$|compre \d/.test(text) || /^COMBO$|^\dPOR\d|PROGRESSIVO/.test(upper),
    storeSellerOnly,
  };
}

/** O que o carrinho tem, nas mesmas palavras das regras. */
export interface CartProfile {
  brands: Set<string>;
  categories: Set<string>;
  genders: Set<string>;
  /** Texto de todos os selos dos produtos (maiúsculo). */
  stamps: string;
  /** Pelo menos um produto é vendido por outra loja (marketplace). */
  hasPartnerSeller: boolean;
  /** Todos os produtos são vendidos pela própria loja. */
  allStoreSeller: boolean;
  itemCount: number;
  subtotal: number | null;
}

export function profileCart(cart: CartInfo, storeName = ''): CartProfile {
  const brands = new Set<string>();
  const categories = new Set<string>();
  const genders = new Set<string>();
  for (const item of cart.items) {
    const name = normalize(item.name);
    for (const b of BRANDS) if (b.words.test(name)) brands.add(b.name);
    for (const c of CATEGORIES) if (c.words.test(name)) categories.add(c.name);
    for (const g of GENDER) if (g.words.test(name)) genders.add(g.name);
  }
  const store = normalize(storeName);
  const sellers = cart.items.map((i) => normalize(i.seller ?? '').trim()).filter(Boolean);
  const isStore = (s: string) => store !== '' && s.includes(store);
  return {
    brands,
    categories,
    genders,
    stamps: cart.items.map((i) => i.stamps ?? '').join(' ').toUpperCase(),
    hasPartnerSeller: sellers.some((s) => !isStore(s)),
    allStoreSeller: sellers.length > 0 && sellers.length === cart.items.length && sellers.every(isStore),
    itemCount: cart.items.length,
    subtotal: cart.subtotal,
  };
}

/** Abaixo disso o cupom nem é testado (ex.: só no app, valor mínimo não atingido). */
export const SKIP_BELOW = -15;

export interface CouponScore {
  score: number;
  /** Motivos curtos, para mostrar/depurar (ex.: "marca adidas", "mínimo R$ 399"). */
  why: string[];
}

/**
 * Nota de 0 (neutro) para cima (combina) ou para baixo (provavelmente não serve).
 * O que pesa mais: marca/categoria batendo com os produtos do carrinho e o valor mínimo.
 */
export function scoreCoupon(coupon: CouponText, cart: CartProfile): CouponScore {
  const r = parseRules(coupon);
  const why: string[] = [];
  let score = 0;
  const knowItems = cart.itemCount > 0;

  // Selo do cupom no próprio produto (Netshoes): é praticamente garantido.
  if (cart.stamps && cart.stamps.includes(coupon.code.toUpperCase())) {
    score += 30;
    why.push('selo no produto');
  }

  const brandHit = r.brands.filter((b) => cart.brands.has(b));
  const kindOf = (c: string) => CATEGORIES.find((x) => x.name === c)!.kind;
  const asks = (kind: CategoryKind) => r.categories.filter((c) => kindOf(c) === kind);
  const hits = (kind: CategoryKind) => asks(kind).filter((c) => cart.categories.has(c));
  if (brandHit.length) { score += 12; why.push(`marca ${brandHit.join(', ')}`); }
  const typeHit = hits('type'), themeHit = hits('theme'), audienceHit = hits('audience');
  if (typeHit.length) { score += 4; why.push(typeHit.join(', ')); }
  if (themeHit.length) { score += 6; why.push(themeHit.join(', ')); }
  if (audienceHit.length) { score += 3; why.push(audienceHit.join(', ')); }
  if (knowItems) {
    // Pede uma marca, um tipo de produto ou um público que o carrinho não tem: provavelmente não serve.
    const missing = [
      ...(r.brands.length && !brandHit.length ? r.brands : []),
      ...(asks('type').length && !typeHit.length ? asks('type') : []),
      ...(asks('audience').length && !audienceHit.length ? asks('audience') : []),
    ];
    if (missing.length) { score -= 8; why.push(`só ${missing.join(', ')}`); }
    // Esporte que não achamos no nome do produto: pesa menos (o nome nem sempre diz "corrida").
    else if (asks('theme').length && !themeHit.length) { score -= 3; why.push(`só ${asks('theme').join(', ')}`); }
  }
  const targeted = r.brands.length + r.categories.length > 0;

  if (r.gender && cart.genders.size) {
    if (cart.genders.has(r.gender)) { score += 3; why.push(r.gender); }
    else { score -= 5; why.push(`só ${r.gender}`); }
  }

  if (r.minValue !== null && cart.subtotal !== null) {
    if (cart.subtotal < r.minValue) { score -= 30; why.push(`mínimo R$ ${r.minValue}`); }
    else score += 1;
  }

  if (r.sitewide && !targeted && !r.firstPurchase) { score += 4; why.push('todo o site'); }
  else if (r.selection && !targeted && !why.includes('selo no produto')) score -= 1;

  if (r.appOnly) { score -= 30; why.push('só no app'); }
  if (r.membersOnly) { score -= 6; why.push('só assinantes'); }
  if (r.birthday) { score -= 6; why.push('aniversário'); }
  if (r.firstPurchase) { score -= 2; why.push('primeira compra'); }
  if (r.needsMany && knowItems && cart.itemCount < 2) { score -= 8; why.push('precisa de 2+ peças'); }
  if (r.storeSellerOnly === true && cart.hasPartnerSeller) { score -= 5; why.push('só vendidos pela loja'); }
  if (r.storeSellerOnly === false && cart.allStoreSeller) { score -= 10; why.push('só lojas parceiras'); }

  // Aparece em vários sites de cupom: um pouco mais confiável.
  score += Math.min(2, Math.max(0, (coupon.sources?.length ?? 1) - 1)) * 0.5;
  return { score, why };
}

/** Resumo do que foi lido no carrinho, para mostrar no cartão. */
export function describeCart(cart: CartProfile): string {
  const parts = [...cart.brands, ...cart.categories];
  return parts.join(', ');
}

/**
 * Identifica "este carrinho" para lembrar de códigos que existem mas não valem para estes itens.
 * Os mesmos produtos → mesma chave; outros produtos → chave diferente (vale testar de novo).
 */
export function cartKey(cart: CartInfo): string {
  const names = cart.items.map((i) => normalize(i.name).replace(/\s+/g, ' ').trim()).sort();
  const text = names.length ? names.join('|') : `total:${cart.subtotal ?? '?'}`;
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
