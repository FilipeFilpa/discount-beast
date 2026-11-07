import type { CartItem } from './coupon-match';

/** O que aconteceu quando um código foi testado no carrinho. */
export type TryStatus = 'worked' | 'rejected' | 'ineligible' | 'unknown';
// 'ineligible' = o código existe, mas não vale para os produtos deste carrinho
// (ex.: Centauro "não é válido para um ou mais itens", Cód CHK167). Vale testar em outro carrinho.

export interface TryResult {
  code: string;
  status: TryStatus;
  /** Total do carrinho com o cupom aplicado (só quando status = 'worked'). */
  total?: number;
  /** Quanto o cupom baixou o Total, em reais. */
  saving?: number;
}

/** Resultado guardado de testes anteriores, por código. */
export interface PastResult {
  status: TryStatus;
  saving?: number;
  /** Quando foi testado (ms desde 1970). */
  at: number;
  /** Qual carrinho (ver cartKey em coupon-match.ts), para status 'ineligible'. */
  cart?: string;
}

export interface RankOptions {
  /** Chave do carrinho atual: um 'ineligible' de outro carrinho volta a ser testado. */
  cartKey?: string;
  /** Nota de compatibilidade com o carrinho (maior = testar antes). */
  score?: (code: string) => number;
  /** Códigos que ficam na frente dos outros nunca testados, na ordem dada (os seus). */
  keepFirst?: string[];
  /** Nota mínima para entrar na lista (os seus entram sempre). */
  minScore?: number;
}

/**
 * O que a loja precisa saber fazer para o testador funcionar.
 * Cada loja (adidas, Netshoes...) tem a sua versão em lib/carts/.
 */
export interface CartAdapter {
  /** Código aplicado agora no carrinho, ou null. */
  appliedCode(): string | null;
  /** Lê o Total. Se `changedFrom` vier, espera o Total mudar (ou desistir) e estabilizar. */
  total(changedFrom?: number): Promise<number | null>;
  /** Digita o código e confirma. */
  apply(code: string): Promise<TryStatus>;
  /** Tira o cupom aplicado. */
  remove(): Promise<void>;
  /** Fecha a gaveta de cupons, se ficou aberta. */
  close(): Promise<void>;
  /** Produtos do carrinho (nome, vendedor, selos), para escolher os cupons que combinam. */
  items?(): CartItem[];
  /** Códigos que a própria loja sugere para este carrinho (ex.: chips da Pichau). Vão para o começo da fila. */
  suggested?(): string[];
}

export interface RunReport {
  /** Total sem nenhum cupom. */
  baseline: number;
  results: TryResult[];
  /** O cupom que deixou o Total mais baixo (ou null se nenhum ajudou). */
  best: TryResult | null;
  /** Total no fim, já com o melhor cupom aplicado. */
  finalTotal: number | null;
}

export interface Progress {
  index: number;
  count: number;
  code: string;
}

/** Quantos códigos testar no máximo por carrinho (cada teste leva alguns segundos). */
export const MAX_TRIES = 15;
/** Um código recusado só volta a ser testado depois desse tempo. */
export const RETRY_REJECTED_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Escolhe a ordem dos testes:
 * 1. códigos que já funcionaram antes (os de maior economia primeiro);
 * 2. códigos nunca testados: os seus de "Meus cupons"/Pelando primeiro, depois os que combinam
 *    mais com o carrinho (`score`); empate mantém a ordem recebida. Um código que "existe mas não
 *    vale para estes itens" num carrinho diferente conta como nunca testado (com um bônus: ele existe);
 * 3. códigos recusados há mais de 3 dias (podem ter voltado), também pela nota.
 * Recusados recentemente (e 'ineligible' recente neste mesmo carrinho) ficam de fora (menos os seus),
 * assim como os de nota abaixo de `minScore`. No máximo `max` códigos.
 */
export function orderCandidates(
  allCodes: string[],
  history: Record<string, PastResult>,
  now = Date.now(),
  max = MAX_TRIES,
  rank: RankOptions = {},
): string[] {
  const codes = [...new Set(allCodes)];
  const { cartKey, score = () => 0, keepFirst = [], minScore = -Infinity } = rank;
  const elsewhere = (p: PastResult) => p.status === 'ineligible' && cartKey !== undefined && p.cart !== cartKey;
  const worked = codes
    .filter((c) => history[c]?.status === 'worked')
    .sort((a, b) => (history[b]?.saving ?? 0) - (history[a]?.saving ?? 0));
  const mine = new Set(keepFirst);
  // Os seus códigos ("Meus cupons", Pelando, sugeridos pela loja) sempre entram, mesmo recusados há pouco:
  // você acabou de pedir para testar.
  const fresh = codes.filter((c) => !history[c] || elsewhere(history[c]!) || (mine.has(c) && history[c]!.status !== 'worked'));
  const retry = codes.filter((c) => {
    const past = history[c];
    return past && past.status !== 'worked' && !mine.has(c) && !elsewhere(past) && now - past.at >= RETRY_REJECTED_AFTER_MS;
  });
  const notes = new Map(codes.map((c) => [c, score(c) + (history[c] && elsewhere(history[c]!) ? 2 : 0)]));
  const byScore = (list: string[]) => {
    const pinned = keepFirst.filter((c) => list.includes(c));
    const rest = list
      .filter((c) => !mine.has(c) && notes.get(c)! >= minScore)
      .map((c, i) => ({ c, i }))
      .sort((a, b) => notes.get(b.c)! - notes.get(a.c)! || a.i - b.i)
      .map((x) => x.c);
    return [...pinned, ...rest];
  };
  return [...worked, ...byScore(fresh), ...byScore(retry)].slice(0, max);
}

/**
 * Testa um código de cada vez: aplica, anota o Total, tira e passa para o próximo.
 * No fim aplica de novo o que deixou o Total mais baixo.
 */
export async function findBestCoupon(
  cart: CartAdapter,
  candidates: string[],
  onProgress: (p: Progress) => void = () => {},
): Promise<RunReport> {
  const codes = [...candidates];

  // Se já tinha um cupom no carrinho, ele entra na disputa e sai para medirmos o Total "puro".
  const already = cart.appliedCode();
  let before = await cart.total();
  if (already) {
    if (!codes.includes(already)) codes.unshift(already);
    await cart.remove();
    before = await cart.total(before ?? undefined);
  }
  if (before === null) throw new Error('Não encontrei o Total do carrinho.');
  const baseline = before;

  const results: TryResult[] = [];
  for (const [i, code] of codes.entries()) {
    onProgress({ index: i + 1, count: codes.length, code });
    const status = await cart.apply(code);
    if (status !== 'worked') {
      results.push({ code, status });
      // Sem resposta clara, mas algum cupom ficou aplicado? Tira antes do próximo.
      if (cart.appliedCode()) await cart.remove();
      continue;
    }
    const total = (await cart.total(baseline)) ?? baseline;
    results.push({ code, status, total, saving: round(baseline - total) });
    await cart.remove();
    await cart.total(total);
  }
  await cart.close();

  const best =
    results
      .filter((r) => r.status === 'worked' && (r.saving ?? 0) > 0)
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0] ?? null;

  let finalTotal: number | null = baseline;
  if (best) {
    onProgress({ index: codes.length, count: codes.length, code: best.code });
    const status = await cart.apply(best.code);
    finalTotal = status === 'worked' ? await cart.total(baseline) : await cart.total();
  }
  return { baseline, results, best, finalTotal };
}

const round = (n: number) => Math.round(n * 100) / 100;
