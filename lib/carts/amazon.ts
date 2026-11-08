import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { isVisible, stableValue, typeInto, waitFor } from './dom';

/**
 * Página de pagamento da Amazon (checkout "Chewbacca", HTML salvo pelo Filipe em 08/11/2026:
 * www.amazon.com.br/checkout/p/p-XXX/pay). O carrinho da Amazon não tem campo de cupom: ele fica aqui,
 * em "Seu saldo disponível":
 * - título "Insira um Cupom de desconto ou Vale-presente";
 * - campo `input[name=ppw-claimCode]` (máx. 25, placeholder "Digitar código"; o id muda a cada página);
 * - botão `input[name=ppw-claimCodeApplyPressed]` ("Aplicar");
 * - erros em `#pmts-claim-code-error-messages` (escondido; o modelo tem o texto "Placeholder");
 * - BLOQUEIO: `.apx-throttle-alert` "Você excedeu o máximo de tentativas permitidas. Tente novamente após 2 horas."
 *   Por isso o teste na Amazon é curto (poucos códigos) e para no primeiro que funcionar.
 * Resumo: linhas `.order-summary-grid` (termo `.order-summary-line-term`: "Itens:", "Frete:", "Total:", "Pontos Amazon:",
 * "Total do pedido:"), valores em `[data-shimmer-target=ordertotals-amount]`. Produtos: `.lineitem-title-text`.
 *
 * AINDA NÃO VISTO: a mensagem de erro de verdade e como fica com um código aceito (palpite: uma linha nova
 * no resumo, tipo "Promoção aplicada: -R$ X", e o Total do pedido cai). Também não sabemos tirar o código:
 * por isso o testador para no primeiro aceito e deixa ele aplicado.
 */
export const AMAZON_PAY = {
  input: 'input[name="ppw-claimCode"]',
  apply: 'input[name="ppw-claimCodeApplyPressed"]',
  errors: '#pmts-claim-code-error-messages',
  throttle: '.apx-throttle-alert',
  summaryRow: '.order-summary-grid',
  summaryTerm: '.order-summary-line-term',
  money: '[data-shimmer-target="ordertotals-amount"]',
  item: '.lineitem-title-text',
  /** Linha do resumo que indica desconto de cupom (não confundir com "Pontos Amazon"). */
  promoTerm: /promo|cupo|desconto|vale/i,
  // Visto no Chrome do Filipe (08/11/2026): "O cupom de desconto inserido não pode ser aplicado à esta compra."
  // Parece "existe, mas não vale para este pedido": guardamos como ineligible para tentar de novo em outro pedido.
  ineligibleText: /esta compra|este pedido|iten|produto|categoria|eleg|n[ãa]o se aplica|n[ãa]o (é|e) v[áa]lid[oa] para|valor m[íi]nimo|compra m[íi]nima/i,
} as const;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
/** A Amazon esconde avisos com as classes aok-hidden / a-hidden (no próprio elemento ou num pai). */
const shown = (el: Element) => isVisible(el) && !el.closest('.aok-hidden, .a-hidden');

export function isAmazonPayPage(): boolean {
  return /^\/checkout\//.test(location.pathname) && document.querySelector(AMAZON_PAY.input) !== null;
}

function summaryRows(): { term: string; value: number | null }[] {
  return [...document.querySelectorAll(AMAZON_PAY.summaryRow)].map((row) => ({
    term: clean(row.querySelector(AMAZON_PAY.summaryTerm)?.textContent),
    value: parseBRL(clean(row.querySelector(AMAZON_PAY.money)?.textContent).replace(/^-/, '')),
  }));
}

/** "Total do pedido" (já com Pontos Amazon e frete). */
export function readAmazonTotal(): number | null {
  return summaryRows().find((r) => /total do pedido/i.test(r.term))?.value ?? null;
}

export function readAmazonItems(): CartItem[] {
  const names = [...document.querySelectorAll(AMAZON_PAY.item)].map((el) => clean(el.textContent)).filter(Boolean);
  return [...new Set(names)].map((name) => ({ name }));
}

const promoInSummary = () => summaryRows().some((r) => AMAZON_PAY.promoTerm.test(r.term) && !/pontos/i.test(r.term));

/** Mensagem de erro visível perto do campo (o modelo escondido "Placeholder" não conta). */
function errorText(): string | null {
  const box = document.querySelector(AMAZON_PAY.errors);
  if (!box) return null;
  const alerts = [...box.querySelectorAll('.a-alert-content')].filter((el) => shown(el) && !/^placeholder$/i.test(clean(el.textContent)));
  const text = clean(alerts.map((el) => el.textContent).join(' '));
  return text || null;
}

export const throttled = () => [...document.querySelectorAll(AMAZON_PAY.throttle)].some(shown);

let lastWorked: string | null = null;

export const amazonPay: CartAdapter = {
  appliedCode() {
    return promoInSummary() ? lastWorked ?? 'CUPOM' : null;
  },
  total(changedFrom) {
    return stableValue(readAmazonTotal, changedFrom);
  },
  async apply(code): Promise<TryStatus> {
    if (throttled()) throw new Error('A Amazon bloqueou o campo de cupom por 2 horas (muitas tentativas).');
    const field = document.querySelector<HTMLInputElement>(AMAZON_PAY.input);
    const button = document.querySelector<HTMLElement>(AMAZON_PAY.apply);
    if (!field || !button) throw new Error('Não achei o campo "Insira um Cupom".');
    const before = readAmazonTotal();
    const oldError = errorText();
    field.scrollIntoView({ block: 'center' });
    field.focus();
    typeInto(field, code);
    button.click();
    // A Amazon recarrega o bloco de pagamento: sempre procura os elementos de novo.
    const outcome = await waitFor((): TryStatus | 'throttled' | null => {
      if (throttled()) return 'throttled';
      const err = errorText();
      if (err && err !== oldError) return AMAZON_PAY.ineligibleText.test(err) ? 'ineligible' : 'rejected';
      const now = readAmazonTotal();
      if (promoInSummary() || (now !== null && before !== null && now < before)) return 'worked';
      return null;
    }, 12_000, 300);
    if (outcome === 'throttled') throw new Error('A Amazon bloqueou o campo de cupom por 2 horas (muitas tentativas).');
    if (outcome === 'worked') lastWorked = code;
    if (outcome) console.info('[Discount Beast] Amazon:', code, outcome, errorText() ?? '');
    return outcome ?? (errorText() ? 'rejected' : 'unknown');
  },
  async remove() {
    throw new Error('Já tem um cupom aplicado neste pedido, e ainda não sei tirar cupom na Amazon.');
  },
  async close() {},
  items: readAmazonItems,
};
