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
 * Onde o teste está, para continuar depois que a loja recarrega a página
 * (a Terabyte recarrega ao aplicar ou tirar um cupom, e isso mata o script no meio).
 */
export interface RunState {
  codes: string[];
  /** Índice do código da vez. */
  i: number;
  phase: 'start' | 'removeInitial' | 'apply' | 'check' | 'remove' | 'final' | 'finalCheck' | 'done';
  baseline?: number;
  results: TryResult[];
  /** Resposta do apply() quando a página NÃO recarregou. */
  status?: TryStatus;
  best?: TryResult | null;
  finalTotal?: number | null;
}

export interface Checkpoint {
  /** Estado salvo de uma rodada interrompida (ou undefined para começar do zero). */
  state?: RunState;
  /** Chamado ANTES de cada clique que pode recarregar a página. */
  save(state: RunState): void;
}

export interface RunOptions {
  /**
   * Para no primeiro código aceito e deixa ele aplicado (sem tirar nem comparar).
   * Para lojas onde não dá para tirar o cupom ou que bloqueiam depois de poucas tentativas (Amazon).
   */
  stopAtFirstWin?: boolean;
}

/**
 * Testa um código de cada vez: aplica, anota o Total, tira e passa para o próximo.
 * No fim aplica de novo o que deixou o Total mais baixo.
 * Com `checkpoint`, o progresso fica salvo e a rodada continua se a página recarregar.
 */
export async function findBestCoupon(
  cart: CartAdapter,
  candidates: string[],
  onProgress: (p: Progress) => void = () => {},
  checkpoint?: Checkpoint,
  options: RunOptions = {},
): Promise<RunReport> {
  const st: RunState = checkpoint?.state ?? { codes: [...candidates], i: 0, phase: 'start', results: [] };
  const save = () => checkpoint?.save(st);
  const gone = () => waitUntil(() => cart.appliedCode() === null, 6000);

  for (let guard = 0; guard < 500 && st.phase !== 'done'; guard++) {
    switch (st.phase) {
      case 'start': {
        // Se já tinha um cupom no carrinho, ele entra na disputa e sai para medirmos o Total "puro".
        const already = cart.appliedCode();
        if (already) {
          if (!st.codes.includes(already)) st.codes.unshift(already);
          st.phase = 'removeInitial';
          save();
          await cart.remove();
        } else {
          st.baseline = (await cart.total()) ?? undefined;
          if (st.baseline === undefined) throw new Error('Não encontrei o Total do carrinho.');
          st.phase = 'apply';
          save();
        }
        break;
      }
      case 'removeInitial': {
        await gone();
        st.baseline = (await cart.total()) ?? undefined;
        if (st.baseline === undefined) throw new Error('Não encontrei o Total do carrinho.');
        st.phase = 'apply';
        save();
        break;
      }
      case 'apply': {
        if (st.i >= st.codes.length) { st.phase = 'final'; break; }
        const code = st.codes[st.i]!;
        onProgress({ index: st.i + 1, count: st.codes.length, code });
        st.phase = 'check';
        st.status = undefined;
        save();
        st.status = await cart.apply(code);
        break;
      }
      case 'check': {
        const code = st.codes[st.i]!;
        const baseline = st.baseline!;
        // Sem st.status = a página recarregou no meio do apply(): olha se o código ficou aplicado.
        const status = st.status ?? ((await waitUntil(() => cart.appliedCode() === code, 5000)) ? 'worked' : 'unknown');
        if (status === 'worked') {
          const total = (await cart.total(st.status ? baseline : undefined)) ?? baseline;
          const result: TryResult = { code, status, total, saving: round(baseline - total) };
          st.results.push(result);
          if (options.stopAtFirstWin) {
            st.best = (result.saving ?? 0) > 0 ? result : null;
            st.finalTotal = total;
            st.status = undefined;
            st.phase = 'done';
            save();
            break;
          }
        } else {
          st.results.push({ code, status });
        }
        st.status = undefined;
        // Sem resposta clara, mas algum cupom ficou aplicado? Tira antes do próximo.
        if (cart.appliedCode()) {
          st.phase = 'remove';
          save();
          await cart.remove();
        } else {
          st.i++;
          st.phase = 'apply';
          save();
        }
        break;
      }
      case 'remove': {
        await gone();
        await cart.total();
        st.i++;
        st.phase = 'apply';
        save();
        break;
      }
      case 'final': {
        await cart.close();
        st.best =
          st.results
            .filter((r) => r.status === 'worked' && (r.saving ?? 0) > 0)
            .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0] ?? null;
        st.finalTotal = st.baseline ?? null;
        if (!st.best) { st.phase = 'done'; save(); break; }
        onProgress({ index: st.codes.length, count: st.codes.length, code: st.best.code });
        st.phase = 'finalCheck';
        st.status = undefined;
        save();
        st.status = await cart.apply(st.best.code);
        break;
      }
      case 'finalCheck': {
        const worked = st.status === 'worked' || (await waitUntil(() => cart.appliedCode() === st.best?.code, 5000));
        st.finalTotal = worked ? await cart.total(st.status ? st.baseline : undefined) : await cart.total();
        st.phase = 'done';
        save();
        break;
      }
    }
  }
  return { baseline: st.baseline!, results: st.results, best: st.best ?? null, finalTotal: st.finalTotal ?? null };
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return check();
}

const round = (n: number) => Math.round(n * 100) / 100;
