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
  { name: 'tênis', kind: 'type', words: /\b(tenis|calcados?|pisante|sapatenis|moda)\b/, code: /^TENIS|TENNIS|CALCADO/ },
  { name: 'corrida', kind: 'theme', words: /\b(corrida|running|maratona|adizero|pegasus|supernova)\b/, code: /CORRIDA|RUN|MARATONA/ },
  { name: 'futebol', kind: 'theme', words: /\b(futebol|chuteira|society|futsal|bola)\b/, code: /^FUT|GOLACO|FUTEBOL/ },
  { name: 'suplementos', kind: 'type', words: /\b(suplementos?|creatina|whey|proteina|bcaa|pre-treino)\b/, code: /SUPLE|CREATINA|WHEY/ },
  { name: 'roupas', kind: 'type', words: /\b(moda|camisetas?|camisas?|blusas?|blusao|jaquetas?|calcas?|moletom|bermudas?|shorts?|leggings?|regata|vestuario|roupas?|agasalho|casaco|top)\b/, code: /VEST|CAMISETA|ROUPA/ },
  { name: 'infantil', kind: 'audience', words: /\b(infantil|kids|juvenil|crianca|bebe|menino|menina)\b/, code: /KIDS|INFANTIL/ },
  { name: 'botas', kind: 'type', words: /\bbotas?\b/, code: /^BOTA/ },
  { name: 'meias', kind: 'type', words: /\b(meias?)\b/ },
  { name: 'perfumes', kind: 'type', words: /\b(perfumes?|fragrancias?|colonia)\b/, code: /PERFUME/ },
  // Tipos comuns na Amazon, Mercado Livre e Magalu.
  { name: 'cama e banho', kind: 'type', words: /\b(cama e banho|lencois|lencol|toalhas?|edredom|travesseiros?|colchao|colchoes)\b/, code: /CAMAEBANHO|^CAMA/ },
  { name: 'cozinha', kind: 'type', words: /\b(cozinha|panelas?|utensilios|termicos?|garrafas?|copos?|potes?|talheres|frigideiras?)\b/, code: /COZINHA|P[A4]NELA|TERMICO/ },
  { name: 'eletroportáteis', kind: 'type', words: /\b(eletroportateis|eletroportatil|air ?fryer|fritadeira|liquidificador|cafeteira|ventiladore?s?|aspirador|batedeira|sanduicheira|ferro de passar)\b/, code: /ELETROPORT|VENTILA/ },
  { name: 'eletrodomésticos', kind: 'type', words: /\b(eletrodomesticos?|geladeira|refrigerador|fogao|lava ?louc?as|lavadora|maquina de lavar|micro-?ondas|freezer|ar[- ]condicionado)\b/, code: /ELETRODOM|LINHABRANCA/ },
  { name: 'eletrônicos', kind: 'type', words: /\b(eletronicos?|smartphones?|celulares?|iphone|galaxy|notebooks?|laptop|tablets?|ipad|smart ?tv|televisao|televisor|tv|monitor(es)?|fones?|headset|caixa de som|soundbar|informatica|computador|ssd|placa de video|processador|tech)\b/, code: /^TECH|ELETRONIC|CELULAR|SMARTPHONE|INFORMATICA/ },
  { name: 'games', kind: 'type', words: /\b(games?|videogames?|playstation|ps5|xbox|nintendo|switch|console)\b/, code: /GAME|^PS5|XBOX/ },
  { name: 'pet', kind: 'type', words: /\b(pet ?shop|pets?|racao|cachorros?|caes|gatos?|areia sanitaria)\b/, code: /PET/ },
  { name: 'mercado', kind: 'type', words: /\b(mercado|supermercado|alimentos|bebidas|cervejas?|vinhos?|chocolates?|biscoitos?|mercearia)\b/, code: /MERCADO|BEBIDA|ALIMENTO/ },
  { name: 'beleza', kind: 'type', words: /\b(beleza|maquiagem|skin ?care|dermocosmeticos?|shampoo|condicionador|cabelos?|hidratante|cosmeticos?)\b/, code: /BELEZA|BEAUTY|MAKE/ },
  { name: 'livros', kind: 'type', words: /\b(livros?|ebooks?|hq|mangas?)\b/, code: /LIVRO|BOOK/ },
  { name: 'brinquedos', kind: 'type', words: /\b(brinquedos?|lego|bonecas?|pelucias?|quebra-cabeca)\b/, code: /BRINQUEDO|TOY/ },
  { name: 'ferramentas', kind: 'type', words: /\b(ferramentas?|reforma|construcao|furadeiras?|parafusadeiras?)\b/, code: /FERRAMENTA|REFORMA/ },
  { name: 'móveis e decoração', kind: 'type', words: /\b(moveis|movel|decoracao|sofas?|cadeiras?|mesas?|estantes?|tapetes?|cortinas?)\b/, code: /MOVEIS|DECOR/ },
  { name: 'relógios', kind: 'type', words: /\b(relogios?|smartwatch|smartwatches|apple watch|galaxy watch)\b/, code: /RELOGIO/ },
  { name: 'música', kind: 'type', words: /\b(vinil|discos?|instrumentos? musica(is|l)|violao|guitarra)\b/, code: /MUSIC|VINIL/ },
  { name: 'automotivo', kind: 'type', words: /\b(automotivos?|pneus?|carro|moto)\b/, code: /AUTO|PNEU/ },
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
  /** Todo produto do carrinho teve o tipo reconhecido (tênis, panela...): dá para pular cupom de outro tipo. */
  allTyped: boolean;
  /** Todo produto teve a marca reconhecida: dá para pular cupom de outra marca. */
  allBranded: boolean;
}

export function profileCart(cart: CartInfo, storeName = ''): CartProfile {
  const brands = new Set<string>();
  const categories = new Set<string>();
  const genders = new Set<string>();
  let typed = 0, branded = 0;
  for (const item of cart.items) {
    const name = normalize(item.name);
    if (BRANDS.some((b) => b.words.test(name))) branded++;
    if (CATEGORIES.some((c) => c.kind === 'type' && c.words.test(name))) typed++;
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
    allTyped: cart.items.length > 0 && typed === cart.items.length,
    allBranded: cart.items.length > 0 && branded === cart.items.length,
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
    const wrongBrand = r.brands.length > 0 && !brandHit.length;
    const wrongType = asks('type').length > 0 && !typeHit.length;
    const wrongAudience = asks('audience').length > 0 && !audienceHit.length;
    const missing = [
      ...(wrongBrand ? r.brands : []),
      ...(wrongType ? asks('type') : []),
      ...(wrongAudience ? asks('audience') : []),
    ];
    // Pulamos de vez quando temos certeza: reconhecemos a marca/o tipo de TODOS os produtos e nenhum bate.
    // Infantil quase sempre aparece no nome do produto. Senão, só joga para trás.
    const sure = (wrongBrand && cart.allBranded) || (wrongType && cart.allTyped) || wrongAudience;
    if (missing.length) { score -= sure ? 20 : 8; why.push(`só ${missing.join(', ')}`); }
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
  // Filipe é Prime e Meli+ (08/11/2026): cupom de assinante não é penalizado, só anotado.
  if (r.membersOnly) why.push('assinantes');
  if (r.birthday) { score -= 6; why.push('aniversário'); }
  // Filipe já comprou nessas lojas: cupom de primeira compra não serve.
  if (r.firstPurchase) { score -= 30; why.push('só primeira compra'); }
  if (r.needsMany && knowItems && cart.itemCount < 2) { score -= 8; why.push('precisa de 2+ peças'); }
  if (r.storeSellerOnly === true && cart.hasPartnerSeller) { score -= 5; why.push('só vendidos pela loja'); }
  if (r.storeSellerOnly === false && cart.allStoreSeller) { score -= 10; why.push('só lojas parceiras'); }

  // Aparece em vários sites de cupom: um pouco mais confiável.
  // (com 95% de recusas, um código em 3+ sites é bem mais provável de estar vivo)
  score += Math.min(3, Math.max(0, (coupon.sources?.length ?? 1) - 1));
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

/**
 * Quanto cada site de cupons acerta, pelo seu histórico nesta loja: um código do site que mais acerta
 * sobe na fila. Só conta um site depois de 5 códigos testados (antes disso, nota 0).
 */
export function sourceBonus(
  coupons: { code: string; sources: string[] }[],
  history: Record<string, { status: string }>,
): Map<string, number> {
  const stats = new Map<string, { tried: number; worked: number }>();
  for (const c of coupons) {
    const past = history[c.code];
    if (!past || past.status === 'unknown') continue;
    for (const s of c.sources) {
      const st = stats.get(s) ?? { tried: 0, worked: 0 };
      st.tried++;
      if (past.status === 'worked') st.worked++;
      stats.set(s, st);
    }
  }
  const bonus = new Map<string, number>();
  for (const c of coupons) {
    const notes = c.sources
      .map((s) => stats.get(s))
      .filter((st): st is { tried: number; worked: number } => !!st && st.tried >= 5)
      // taxa de acerto suavizada (como se cada site começasse com 1 de 10), comparada com 10%
      .map((st) => Math.max(-2, Math.min(4, ((st.worked + 1) / (st.tried + 10) - 0.1) * 20)));
    if (notes.length) bonus.set(c.code, Math.round(Math.max(...notes) * 10) / 10);
  }
  return bonus;
}
