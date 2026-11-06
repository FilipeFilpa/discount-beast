import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores do carrinho da netshoes.com.br/cart (tirados do HTML salvo pelo Filipe em 06/11/2026).
 * A Netshoes é feita em Vue: as classes são estáveis e alguns elementos têm `qa-auto`/`auto`/`data-test-id`.
 *
 * Como funciona lá: no "Resumo da compra" tem a linha "Cupom de desconto" com "Tem um código de cupom?"
 * e o botão "Inserir". Ele abre uma janela com o campo "Código do cupom" e o botão "Adicionar".
 * Código errado → "Cupom inválido." embaixo do campo.
 * AINDA NÃO VISTO: como fica o carrinho com um cupom aceito (código no cartão? botão "Remover"?).
 */
export const NETSHOES = {
  total: '[qa-auto="cart-price"]',
  /** Cartão "Tem um código de cupom?" + botão (Inserir; com cupom provavelmente vira Remover/Trocar). */
  couponCard: '.summary__item__coupon-card',
  couponCardButton: '.summary__item__coupon-card [data-test-id="button-action"], .summary__item__coupon-card button',
  couponCardTitle: '.summary__item__coupon-card [data-test-id="title-label"], .summary__item__coupon-card__title',
  modal: '.summary__modal-coupon, [role="dialog"][aria-label="Cupom de desconto"]',
  input: 'input#coupon, input[qa-auto="cart-coupon-field"]',
  submit: 'button[auto="cart-coupon-button"], .coupon-form__button--add',
  error: '.coupon-form__message--error',
  closeModal: '.modal__header__button-close, [role="dialog"] button[aria-label="Cancelar"]',
  /** Texto do botão quando não tem cupom. */
  emptyButtonText: /^\s*inserir\s*$/i,
  removeText: /remov|excluir|retirar/i,
} as const;

export function isNetshoesCart(): boolean {
  return /^\/cart/.test(location.pathname) && visible(NETSHOES.total) !== null;
}

export function readNetshoesTotal(): number | null {
  return parseBRL(visible(NETSHOES.total)?.textContent ?? '');
}

/** Último código que vimos ser aceito (caso o cartão não mostre o código). */
let lastWorked: string | null = null;

const cardButton = () => visible<HTMLButtonElement>(NETSHOES.couponCardButton);
const hasCoupon = () => {
  const button = cardButton();
  return button !== null && !NETSHOES.emptyButtonText.test(button.textContent ?? '');
};

export const netshoesCart: CartAdapter = {
  appliedCode() {
    if (!hasCoupon()) return null;
    // Palpite: o cartão mostra o código no lugar de "Tem um código de cupom?". Pegamos a palavra em MAIÚSCULAS.
    const text = visible(NETSHOES.couponCardTitle)?.textContent ?? visible(NETSHOES.couponCard)?.textContent ?? '';
    const code = text.match(/\b[A-Z0-9][A-Z0-9_-]{2,}\b/)?.[0];
    return code ?? lastWorked ?? 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readNetshoesTotal, changedFrom);
  },

  async apply(code) {
    const before = readNetshoesTotal();
    // O "Cupom inválido." do código anterior pode ficar na tela e confundir o teste:
    // fechar e abrir a janela de novo limpa o formulário.
    if (visible(NETSHOES.error)) await netshoesCart.close();
    const input = await openModal();
    const staleError = visible(NETSHOES.error);
    typeInto(input, code);
    const submit = await waitFor(() => {
      const b = visible<HTMLButtonElement>(NETSHOES.submit);
      return b && !b.disabled ? b : null;
    }, 3000);
    if (!submit) throw new Error('O botão "Adicionar" da Netshoes não ficou disponível.');
    submit.click();

    const start = Date.now();
    let oldError: Element | null = staleError;
    const outcome = await waitFor<TryStatus>(() => {
      const err = visible(NETSHOES.error);
      if (err) {
        // Erro que já estava na tela é do código anterior: espera ele ser trocado (ou 4 s).
        if (err !== oldError || Date.now() - start > 4000) return 'rejected';
        return null;
      }
      oldError = null;
      // Aceito: a janela fechou e o cartão deixou de dizer "Inserir", ou o Total mudou.
      if (hasCoupon() || (before !== null && readNetshoesTotal() !== before)) { lastWorked = code; return 'worked'; }
      return null;
    }, 15_000);
    return outcome ?? 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      await netshoesCart.close();
      const button = cardButton();
      if (!button) break;
      button.scrollIntoView({ block: 'center' });
      clickLikeAPerson(button);
      await sleep(600);
      // Se o botão abriu a janela de novo, procuramos um "Remover" lá dentro.
      const modal = visible(NETSHOES.modal);
      if (modal) {
        const remove = [...modal.querySelectorAll<HTMLElement>('button, a, [role="button"]')].find(
          (b) => isVisible(b) && NETSHOES.removeText.test(`${b.textContent} ${b.getAttribute('aria-label') ?? ''}`),
        );
        if (remove) clickLikeAPerson(remove);
      }
      if (await waitFor(() => !hasCoupon(), 6000)) return;
      console.warn('[Discount Beast] cupom continua na Netshoes depois do clique', attempt, visible(NETSHOES.couponCard)?.outerHTML);
    }
    throw new Error('Não consegui tirar o cupom da Netshoes.');
  },

  async close() {
    if (!visible(NETSHOES.modal)) return;
    visible(NETSHOES.closeModal)?.click();
    await waitFor(() => !visible(NETSHOES.modal), 3000);
  },
};

/** Abre a janela "Cupom de desconto" (se já não estiver aberta) e devolve o campo. */
async function openModal(): Promise<HTMLInputElement> {
  const open = visible<HTMLInputElement>(NETSHOES.input);
  if (open) return open;
  const button = cardButton();
  if (!button) throw new Error('Não achei o botão "Inserir" do cupom.');
  if (hasCoupon()) throw new Error('Já tem um cupom aplicado na Netshoes.');
  button.click();
  const input = await waitFor(() => visible<HTMLInputElement>(NETSHOES.input), 8000);
  if (!input) throw new Error('A janela de cupom da Netshoes não abriu.');
  return input;
}
