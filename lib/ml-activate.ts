import { sleep, waitFor } from './carts/dom';

/**
 * Página "Cupons" do Mercado Livre (HTML salvo pelo Filipe em 08/11/2026, /cupons/filter?all=true).
 * Cada cupom é um `.coupon-card` com um botão no rodapé (`.bottom-row button`):
 * - "Aplicar" (aria-label "Aplicar cupom 30 por cento OFF em ...") → ativa o cupom na conta;
 * - "Conferir" (aria-label "Conferir produtos do cupom ...") → já ativado.
 * 30 cupons por página; paginação andes com link "Próximo" (`data-andes-pagination-control="next"`).
 * AINDA NÃO VISTO: o que acontece depois do clique. Palpite: o botão vira "Conferir" (ou some).
 */
export const ML_COUPONS = {
  card: '.coupon-card',
  button: '.coupon-card .bottom-row button, .coupon-card button.andes-button',
  next: 'a[data-andes-pagination-control="next"]',
} as const;

const label = (b: HTMLElement) => `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`.trim();
const isActivate = (b: HTMLElement) => /^\s*aplicar\b/i.test(b.textContent ?? '') || /^aplicar cupom/i.test(b.getAttribute('aria-label') ?? '');

export function couponButtonsToActivate(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(ML_COUPONS.button)].filter((b) => isActivate(b) && !b.disabled);
}

export function nextCouponsPageUrl(): string | null {
  const a = document.querySelector<HTMLAnchorElement>(ML_COUPONS.next);
  if (!a || a.getAttribute('data-andes-state') === 'disabled' || a.closest('[class*="--disabled"]')) return null;
  return a.href || null;
}

/** Clica "Aplicar" em cada cupom, um por vez, devagar (como uma pessoa), e confere se mudou. */
export async function activateCouponsOnPage(onProgress?: (done: number, total: number) => void): Promise<{ activated: number; failed: number }> {
  const buttons = couponButtonsToActivate();
  let activated = 0;
  let failed = 0;
  for (const [i, button] of buttons.entries()) {
    const card = button.closest<HTMLElement>(ML_COUPONS.card);
    const before = label(button);
    button.scrollIntoView({ block: 'center' });
    await sleep(400);
    button.click();
    // Mudou quando o botão do cartão não é mais "Aplicar" (virou "Conferir", sumiu ou foi trocado).
    const done = () => {
      const now = card?.querySelector<HTMLButtonElement>('button.andes-button') ?? null;
      return !now || !now.isConnected || !isActivate(now) || label(now) !== before;
    };
    // 10 s e uma última olhada: com a aba em segundo plano o Chrome atrasa os timers da página.
    const changed = (await waitFor(done, 10_000)) || done();
    if (changed) activated += 1;
    else { failed += 1; console.warn('[Discount Beast] ML: cupom sem resposta ao ativar:', before); }
    // Alguns cupons podem abrir uma janela (termos, QR): fecha com Esc para seguir.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    onProgress?.(i + 1, buttons.length);
    await sleep(900 + Math.random() * 600);
  }
  return { activated, failed };
}
