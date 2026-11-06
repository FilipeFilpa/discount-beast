/** Ajudantes para mexer em páginas de loja (feitas em React) a partir da extensão. */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repete `check` até ele devolver algo diferente de null/false, ou estourar o tempo. */
export async function waitFor<T>(check: () => T | null | undefined | false, timeoutMs = 10_000, everyMs = 200): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await sleep(everyMs);
  }
  return null;
}

/** Está na tela? (elementos escondidos não têm tamanho) */
export function isVisible(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Primeiro elemento visível que bate com o seletor. */
export function visible<E extends Element = HTMLElement>(selector: string, root: ParentNode = document): E | null {
  return [...root.querySelectorAll<E>(selector)].find(isVisible) ?? null;
}

/** Acha elementos visíveis pelo texto exato (sem diferenciar maiúsculas). */
export function findByText(pattern: RegExp, root: Node = document.body): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && pattern.test((node.textContent ?? '').trim()) && isVisible(parent)) found.push(parent);
  }
  return found;
}

/**
 * Preenche um campo de um site React. Só mudar `input.value` não basta: o React
 * não percebe. Por isso usamos o "setter" original e disparamos o evento "input".
 */
export function typeInto(input: HTMLInputElement, value: string): void {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Lê um preço pelo rótulo (ex.: "Total"): acha o texto do rótulo e sobe até
 * 4 níveis no HTML procurando um "R$" na mesma linha.
 */
export function readPriceByLabel(label: RegExp, parsePrice: (text: string) => number | null): number | null {
  for (const el of findByText(label)) {
    let row: HTMLElement | null = el;
    for (let up = 0; row && up < 4; up++, row = row.parentElement) {
      const price = parsePrice(row.textContent ?? '');
      if (price !== null) return price;
    }
  }
  return null;
}

/**
 * Espera o Total mudar (se `changedFrom` vier, até 5 s) e depois ficar parado por ~1 s.
 * Serve para todas as lojas: depois de aplicar um cupom o site recalcula o carrinho.
 */
export async function stableValue(read: () => number | null, changedFrom?: number): Promise<number | null> {
  if (changedFrom !== undefined) await waitFor(() => { const t = read(); return t !== null && t !== changedFrom; }, 5000);
  let last = read();
  let stableSince = Date.now();
  const end = Date.now() + 8000;
  while (Date.now() < end && Date.now() - stableSince < 1000) {
    await sleep(200);
    const now = read();
    if (now !== last) { last = now; stableSince = Date.now(); }
  }
  return last;
}

/** Alguns botões React só reagem aos eventos de mouse completos, não só ao "click". */
export function clickLikeAPerson(el: HTMLElement): void {
  const box = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', at));
  el.dispatchEvent(new MouseEvent('mousedown', at));
  el.dispatchEvent(new PointerEvent('pointerup', at));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.click();
}
