import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { findByText, isVisible, sleep, typeInto, visible, waitFor } from './dom';

/**
 * Seletores do carrinho da adidas.com.br (conferidos no DevTools em 06/11/2026).
 * As classes da adidas têm um sufixo aleatório (ex.: "__eLaZ_"), então usamos
 * id e data-auto-id, que são estáveis. Se a adidas mudar o site, é aqui que se conserta.
 */
export const ADIDAS = {
  /** Link no "Resumo do pedido" que abre a gaveta de cupons. */
  openDrawerText: /^usar pontos ou descontos$/i,
  input: 'input#coupon-input, input[data-auto-id="add-coupon-input"]',
  submit: 'button[data-auto-id="glass-coupon-button-submit"]',
  error: '[data-auto-id="add-voucher-error"]',
  applied: '[data-auto-id="cart-coupon-applied"]',
  /** Onde fica o cartão "O seu código X foi aplicado" (o "X" de remover está aqui dentro). */
  appliedArea: '[data-auto-id="voucher-wallet-wrapper"], .cart-coupon-container, [data-auto-id="cart-coupon-applied"]',
  /** Do mais específico para o mais genérico: o primeiro visível vence. */
  removeButton: [
    '[class*="coupon-complete__close"]',
    '[data-auto-id*="remove" i], [data-auto-id*="close" i], [data-auto-id*="delete" i]',
    '[aria-label*="remov" i], [aria-label*="fechar" i], [aria-label*="close" i], [aria-label*="excluir" i]',
    'button, [role="button"]',
    'svg',
  ],
  totalText: /^total$/i,
} as const;

/** O link "Usar pontos ou descontos" está na página? (é assim que sabemos que é o carrinho) */
export function isAdidasCart(): boolean {
  return findByText(ADIDAS.openDrawerText).length > 0 || visible(ADIDAS.applied) !== null;
}

/** Lê o Total do "Resumo do pedido": acha o texto "Total" e o preço na mesma linha. */
export function readAdidasTotal(): number | null {
  for (const label of findByText(ADIDAS.totalText)) {
    let row: HTMLElement | null = label;
    for (let up = 0; row && up < 4; up++, row = row.parentElement) {
      const price = parseBRL(row.textContent ?? '');
      if (price !== null) return price;
    }
  }
  return null;
}

export const adidasCart: CartAdapter = {
  appliedCode() {
    const box = visible(ADIDAS.applied);
    if (!box) return null;
    // Texto: "O seu código ACHADOS foi aplicado"
    const match = (box.textContent ?? '').match(/(\S+)\s+foi aplicad/i);
    return match?.[1]?.toUpperCase() ?? null;
  },

  async total(changedFrom) {
    // Espera o Total mudar (até 5 s) e depois ficar parado por ~1 s.
    if (changedFrom !== undefined) await waitFor(() => { const t = readAdidasTotal(); return t !== null && t !== changedFrom; }, 5000);
    let last = readAdidasTotal();
    let stableSince = Date.now();
    const end = Date.now() + 8000;
    while (Date.now() < end && Date.now() - stableSince < 1000) {
      await sleep(200);
      const now = readAdidasTotal();
      if (now !== last) { last = now; stableSince = Date.now(); }
    }
    return last;
  },

  async apply(code) {
    const input = await openDrawer();
    const staleError = visible(ADIDAS.error);
    typeInto(input, code);
    const submit = await waitFor(() => {
      const b = visible<HTMLButtonElement>(ADIDAS.submit);
      return b && !b.disabled ? b : null;
    }, 3000);
    if (!submit) throw new Error('O botão "Continuar" da adidas não ficou disponível.');
    submit.click();

    const start = Date.now();
    let oldError: Element | null = staleError;
    const outcome = await waitFor<TryStatus>(() => {
      if (adidasCart.appliedCode() === code) return 'worked';
      const err = visible(ADIDAS.error);
      if (!err) { oldError = null; return null; }
      // Um erro que já estava na tela antes de clicar é do código anterior: espera ele sumir ou ser trocado.
      if (err !== oldError || Date.now() - start > 4000) return 'rejected';
      return null;
    }, 15_000);
    return outcome ?? 'unknown';
  },

  async remove() {
    const close = findRemoveButton();
    if (!close) {
      // Ajuda a consertar: o HTML do cartão aparece no Console (F12) da página.
      console.warn('[Discount Beast] cartão do cupom:', visible(ADIDAS.appliedArea)?.outerHTML);
      throw new Error('Não achei o "X" para tirar o cupom.');
    }
    clickLikeAPerson(close);
    const gone = await waitFor(() => !visible(ADIDAS.applied), 10_000);
    if (!gone) throw new Error('O cupom não saiu do carrinho.');
  },

  async close() {
    const input = visible(ADIDAS.input);
    if (!input) return;
    // A gaveta fecha com Esc ou com o botão de fechar (o primeiro com "fechar"/"close" no nome).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await sleep(400);
    if (!isVisible(input)) return;
    const closeBtn = [...document.querySelectorAll<HTMLElement>('button[aria-label], [data-auto-id*="close"]')].find(
      (b) => isVisible(b) && /fechar|close/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.dataset.autoId ?? ''}`),
    );
    closeBtn?.click();
  },
};

/** Procura o "X" do cupom aplicado, subindo do cartão até a área do cupom. */
function findRemoveButton(): HTMLElement | null {
  const areas = [...document.querySelectorAll<HTMLElement>(ADIDAS.appliedArea)].filter(isVisible);
  for (const selector of ADIDAS.removeButton) {
    for (const area of areas) {
      const hit = [...area.querySelectorAll(selector)].find((el) => el.getBoundingClientRect().width > 0);
      if (hit) return (hit.closest<HTMLElement>('button, [role="button"]') ?? (hit instanceof HTMLElement ? hit : hit.parentElement));
    }
  }
  return null;
}

/** Alguns botões React só reagem aos eventos de mouse completos, não só ao "click". */
function clickLikeAPerson(el: HTMLElement): void {
  const box = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', at));
  el.dispatchEvent(new MouseEvent('mousedown', at));
  el.dispatchEvent(new PointerEvent('pointerup', at));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.click();
}

/** Abre a gaveta "Usar pontos ou descontos" (se já não estiver aberta) e devolve o campo do cupom. */
async function openDrawer(): Promise<HTMLInputElement> {
  const open = visible<HTMLInputElement>(ADIDAS.input);
  if (open) return open;
  const link = findByText(ADIDAS.openDrawerText)[0];
  if (!link) throw new Error('Não achei o link "Usar pontos ou descontos".');
  (link.closest<HTMLElement>('a, button, [role="button"]') ?? link).click();
  const input = await waitFor(() => visible<HTMLInputElement>(ADIDAS.input), 8000);
  if (!input) throw new Error('A gaveta de cupons não abriu.');
  return input;
}
