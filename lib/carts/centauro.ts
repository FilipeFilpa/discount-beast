import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores do carrinho da centauro.com.br/checkouts/carrinho (tirados do HTML salvo pelo Filipe em 06/11/2026).
 * A Centauro é feita em React (Next.js): as classes mudam a cada versão, então usamos `data-testid`.
 *
 * Como funciona lá: o campo "Digite o cupom" fica direto na página, com o botão "Adicionar"
 * (desabilitado até digitar). Código errado → "Cupom não encontrado. Verifique a digitação..."
 * O Total do resumo é o preço no Pix ("R$ 749,99 no Pix"); serve igual para comparar cupons.
 * AINDA NÃO VISTO: como fica o carrinho com um cupom aceito (código + botão de remover?).
 */
export const CENTAURO = {
  total: '[data-testid="total-order"]',
  section: '[data-testid="discount-coupon"]',
  input: 'input[data-testid="discount-coupon-input"]',
  submit: 'button[data-testid="coupon-button"]',
  error: '#discount-coupon-error, [data-testid="discount-coupon"] [data-testid="hint"]',
  removeText: /remov|excluir|retirar|apagar/i,
  /** Produto do carrinho: nome e "Vendido e Entregue por: <strong>Centauro</strong>". */
  item: '[data-testid="product-cart-card"]',
  itemName: '[data-testid="product-name"]',
  itemAttributes: '[data-testid="product-attributes"]',
  /** "não é válido para um ou mais itens" (Cód CHK167): o código existe, mas não serve para estes produtos. */
  ineligibleText: /CHK167|n[ãa]o (é|e) v[áa]lido para|n[ãa]o se aplica|itens? (n[ãa]o )?eleg/i,
} as const;

export function readCentauroItems(): CartItem[] {
  return [...document.querySelectorAll(CENTAURO.item)].flatMap((card) => {
    const name = card.querySelector(CENTAURO.itemName)?.textContent?.trim();
    if (!name) return [];
    const attrs = card.querySelector(CENTAURO.itemAttributes)?.textContent ?? '';
    const seller = attrs.match(/vendido e entregue por:?\s*(.+)$/i)?.[1]?.trim();
    return [{ name, seller }];
  });
}

export function isCentauroCart(): boolean {
  return /\/checkouts\/carrinho/.test(location.pathname) && visible(CENTAURO.section) !== null;
}

export function readCentauroTotal(): number | null {
  return parseBRL(visible(CENTAURO.total)?.textContent ?? '');
}

/** Botão de tirar o cupom dentro da área "Cupom de desconto" (palpite: texto ou aria-label com "remover"). */
function findRemoveButton(): HTMLElement | null {
  const section = visible(CENTAURO.section);
  if (!section) return null;
  return (
    [...section.querySelectorAll<HTMLElement>('button, [role="button"], a')].find(
      (b) => isVisible(b) && !b.matches(CENTAURO.submit) && CENTAURO.removeText.test(`${b.textContent} ${b.getAttribute('aria-label') ?? ''} ${b.dataset.testid ?? ''}`),
    ) ?? null
  );
}

/** Com cupom aplicado, o campo some ou aparece um botão de remover. */
const hasCoupon = () => findRemoveButton() !== null || (visible(CENTAURO.section) !== null && !visible(CENTAURO.input));

let lastWorked: string | null = null;

const visibleError = () => {
  const el = visible(CENTAURO.error);
  return el && (el.textContent ?? '').trim() ? el : null;
};

export const centauroCart: CartAdapter = {
  appliedCode() {
    if (!hasCoupon()) return null;
    const text = visible(CENTAURO.section)?.textContent?.replace(/cupom de desconto/i, '') ?? '';
    return text.match(/\b[A-Z0-9][A-Z0-9_-]{2,}\b/)?.[0] ?? lastWorked ?? 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readCentauroTotal, changedFrom);
  },

  async apply(code) {
    const before = readCentauroTotal();
    const input = visible<HTMLInputElement>(CENTAURO.input);
    if (!input) throw new Error(hasCoupon() ? 'Já tem um cupom aplicado na Centauro.' : 'Não achei o campo "Digite o cupom".');
    input.scrollIntoView({ block: 'center' });
    typeInto(input, code);
    const submit = await waitFor(() => {
      const b = visible<HTMLButtonElement>(CENTAURO.submit);
      return b && !b.disabled ? b : null;
    }, 3000);
    if (!submit) throw new Error('O botão "Adicionar" da Centauro não ficou disponível.');
    // Erro do código anterior que continua na tela depois de digitar o novo.
    const staleError = visibleError();
    submit.click();

    const start = Date.now();
    let oldError: Element | null = staleError;
    const outcome = await waitFor<TryStatus>(() => {
      const err = visibleError();
      if (err) {
        if (err !== oldError || Date.now() - start > 4000) return CENTAURO.ineligibleText.test(err.textContent ?? '') ? 'ineligible' : 'rejected';
        return null;
      }
      oldError = null;
      if (hasCoupon() || (before !== null && readCentauroTotal() !== before)) { lastWorked = code; return 'worked'; }
      return null;
    }, 15_000);
    return outcome ?? 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      const button = await waitFor(findRemoveButton, 3000);
      if (!button) {
        console.warn('[Discount Beast] área do cupom na Centauro:', visible(CENTAURO.section)?.outerHTML);
        throw new Error('Não achei o botão de tirar o cupom na Centauro.');
      }
      button.scrollIntoView({ block: 'center' });
      await sleep(300);
      clickLikeAPerson(button);
      if (await waitFor(() => !hasCoupon(), 6000)) return;
    }
    throw new Error('Não consegui tirar o cupom da Centauro.');
  },

  items: readCentauroItems,

  async close() {
    // A Centauro não usa janela para o cupom: o campo fica na própria página.
  },
};
