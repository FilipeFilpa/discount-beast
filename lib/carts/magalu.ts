import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores da sacola da Magalu (HTML salvo pelo Filipe em 08/11/2026, sacola.magazineluiza.com.br/r/,
 * React + Tailwind). As classes são utilitárias (mudam fácil), então usamos os data-testid.
 *
 * Resumo da sacola: faixa verde "1 cupom para você" + botão "Ver cupons" (data-testid=coupon-button),
 * que abre a janela "Quer inserir um cupom?" (data-testid=dialog-container) com:
 * - campo "Código do cupom" (data-testid=cupom-input), sem botão ao lado: o código vai com Enter;
 * - erro: "Este cupom não foi aplicado. Pode ter algum erro de digitação ou não estar mais ativo."
 *   (data-testid=modalSheet-icon-message-error);
 * - sucesso: "Cupom aplicado" (data-testid=modalSheet-icon-message-success) e, no resumo,
 *   a linha "Cupom: - R$ 350,00" (data-testid=additional-price-info-coupon-amount);
 * - lista "Ou escolha um dos cupons disponíveis": "R$ 350,00 OFF com cupom: LU350" + botão "Aplicar"
 *   (aria-label "Copiar código LU350"); depois de aplicado vira "Aplicado" + botão "Remover" (data-testid=coupon-remove).
 * Total: "R$ 42.749,05 no PIX" (depois "ou R$ 44.999,00 no cartão"); usamos o do Pix, como nas outras lojas.
 */
export const MAGALU = {
  openButton: '[data-testid="coupon-button"]',
  dialog: '[data-testid="dialog-container"]',
  closeButton: '[data-testid="close-dialog"]',
  input: '[data-testid="cupom-input"]',
  clearInput: '[data-testid="modalSheet-icon-remove"]',
  error: '[data-testid="modalSheet-icon-message-error"]',
  success: '[data-testid="modalSheet-icon-message-success"]',
  couponAmount: '[data-testid="additional-price-info-coupon-amount"]',
  listedCoupon: '[data-testid="cupom-code-container"]',
  listedApply: '[data-testid="coupon-code-button"]',
  listedRemove: '[data-testid="coupon-remove"]',
  listedApplied: '[data-testid="coupon-code-copied"]',
  summary: '#subtotal-container, [data-testid="subtotal-container"]',
  items: '[data-testid="product-name"]',
  sellerGroup: 'input[id^="product-group-checkbox-"]',
  ineligibleText: /produto|item|categoria|valor m[íi]nimo|compra m[íi]nima|marca|n[ãa]o se aplica|eleg|vendedor|seller/i,
} as const;

const dialog = () => [...document.querySelectorAll<HTMLElement>(MAGALU.dialog)].find(isVisible) ?? null;
const input = () => dialog()?.querySelector<HTMLInputElement>(MAGALU.input) ?? null;
const errorShown = () => visible(MAGALU.error);

/** Tem cupom aplicado? A linha "Cupom: - R$ ..." no resumo aparece com a janela aberta ou fechada. */
const hasCoupon = () => document.querySelector(MAGALU.couponAmount) !== null || visible(MAGALU.success) !== null;

export function isMagaluCart(): boolean {
  return /^sacola\./.test(location.hostname) && document.querySelector(MAGALU.openButton) !== null;
}

export function readMagaluTotal(): number | null {
  const summary = document.querySelector<HTMLElement>(MAGALU.summary) ?? document.body;
  const text = (summary.textContent ?? '').replace(/\s+/g, ' ');
  // "Total: R$ 42.749,05 no PIX ou R$ 44.999,00 no cartão"
  const total = /Total:\s*(R\$\s*[\d.]+,\d{2})/i.exec(text);
  return total?.[1] ? parseBRL(total[1]) : null;
}

/** Últimos códigos vistos na lista da janela (ela só existe no HTML enquanto está aberta). */
let seenSuggested: string[] = [];

/** Códigos que a própria Magalu oferece para esta sacola ("R$ 350,00 OFF com cupom: LU350"). */
export function readMagaluSuggested(): string[] {
  const now = readListedCodes();
  if (now.length) seenSuggested = now;
  return seenSuggested;
}

/**
 * A lista de cupons sugeridos só aparece com a janela "Ver cupons" aberta. Se a faixa verde
 * diz que há cupom ("1 cupom para você"), abrimos a janela uma vez, lemos os códigos e fechamos.
 */
export async function peekMagaluSuggested(): Promise<void> {
  const banner = document.querySelector('[data-testid="coupon-text"]')?.textContent ?? '';
  if (!/\d+\s+cupo/i.test(banner) || dialog()) { readMagaluSuggested(); return; }
  if (!(await openDialog())) return;
  await waitFor(() => readListedCodes().length > 0, 3000);
  readMagaluSuggested();
  await closeDialog();
}

function readListedCodes(): string[] {
  const codes = new Set<string>();
  for (const button of document.querySelectorAll<HTMLElement>(MAGALU.listedApply)) {
    const code = (button.getAttribute('aria-label') ?? '').replace(/^Copiar c[óo]digo\s+/i, '').trim().toUpperCase();
    if (/^[A-Z0-9_-]{3,40}$/.test(code)) codes.add(code);
  }
  for (const p of document.querySelectorAll<HTMLElement>(`${MAGALU.listedCoupon} p`)) {
    const code = /com cupom:\s*([A-Z0-9_-]{3,40})/i.exec(p.textContent ?? '')?.[1];
    if (code) codes.add(code.toUpperCase());
  }
  return [...codes];
}

export function readMagaluItems(): CartItem[] {
  // O grupo de produtos tem o vendedor no id ("product-group-checkbox-Magalu").
  const seller = document.querySelector(MAGALU.sellerGroup)?.id.replace('product-group-checkbox-', '') || undefined;
  const names = [...document.querySelectorAll(MAGALU.items)].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...new Set(names)].map((name) => ({ name, seller }));
}

/** Bloco da lista "cupons disponíveis" que corresponde a este código (se a Magalu oferecer ele). */
function listedBlock(code: string): HTMLElement | null {
  for (const block of document.querySelectorAll<HTMLElement>(MAGALU.listedCoupon)) {
    const button = block.querySelector(MAGALU.listedApply);
    const label = `${button?.getAttribute('aria-label') ?? ''} ${block.querySelector('p')?.textContent ?? ''}`;
    if (new RegExp(`(c[óo]digo|cupom:)\\s*${code.replace(/[^A-Z0-9_-]/gi, '')}\\b`, 'i').test(label)) return block;
  }
  return null;
}

async function openDialog(): Promise<HTMLElement | null> {
  if (dialog()) return dialog();
  const button = visible(MAGALU.openButton);
  if (!button) return null;
  button.scrollIntoView({ block: 'center' });
  clickLikeAPerson(button);
  return waitFor(() => (input() ? dialog() : null), 4000);
}

async function closeDialog(): Promise<void> {
  for (let attempt = 0; attempt < 2 && dialog(); attempt++) {
    const x = dialog()?.querySelector<HTMLElement>(MAGALU.closeButton);
    if (x) clickLikeAPerson(x);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !dialog(), 3000);
  }
}

/** O campo da Magalu não tem botão "Aplicar": o código vai com Enter. */
function pressEnter(field: HTMLInputElement): void {
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  field.dispatchEvent(new KeyboardEvent('keydown', opts));
  field.dispatchEvent(new KeyboardEvent('keypress', opts));
  field.dispatchEvent(new KeyboardEvent('keyup', opts));
}

let lastWorked: string | null = null;

export const magaluCart: CartAdapter = {
  appliedCode() {
    if (!hasCoupon()) return null;
    for (const block of document.querySelectorAll<HTMLElement>(MAGALU.listedCoupon)) {
      if (!block.querySelector(MAGALU.listedApplied) && !block.querySelector(MAGALU.listedRemove)) continue;
      const code = /com cupom:\s*([A-Z0-9_-]{3,40})/i.exec(block.querySelector('p')?.textContent ?? '')?.[1];
      if (code) return code.toUpperCase();
    }
    return input()?.value.trim() || lastWorked || 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readMagaluTotal, changedFrom);
  },

  async apply(code) {
    if (!(await openDialog())) throw new Error('Não achei a janela "Ver cupons" na sacola da Magalu.');
    if (hasCoupon()) throw new Error('Já tem um cupom aplicado na Magalu (só vale 1 por pedido).');
    // Erro do código anterior ainda na tela: fecha e abre a janela para começar limpo.
    if (errorShown()) {
      await closeDialog();
      await openDialog();
    }
    const staleError = errorShown();
    const before = readMagaluTotal();

    const listed = listedBlock(code)?.querySelector<HTMLElement>(MAGALU.listedApply);
    if (listed) {
      // A própria Magalu oferece esse código: o botão "Aplicar" da lista é o caminho mais seguro.
      listed.scrollIntoView({ block: 'center' });
      clickLikeAPerson(listed);
    } else {
      const field = input();
      if (!field) throw new Error('Não achei o campo "Código do cupom" na Magalu.');
      typeInto(field, code);
      await sleep(150);
      pressEnter(field);
    }

    const outcome = await waitFor<TryStatus>(() => {
      if (hasCoupon() || (before !== null && readMagaluTotal() !== before)) { lastWorked = code; return 'worked'; }
      const err = errorShown();
      if (!err || err === staleError) return null;
      const text = err.textContent ?? '';
      console.info('[Discount Beast] Magalu recusou', code, '→', text.trim());
      return MAGALU.ineligibleText.test(text) && !/digita[çc][ãa]o|n[ãa]o estar mais ativo/i.test(text) ? 'ineligible' : 'rejected';
    }, 12_000);
    if (outcome) return outcome;
    // Nada mudou em 12 s: sem linha de cupom e Total igual → não aceitou (ou o Enter não foi aceito).
    if (!hasCoupon() && readMagaluTotal() === before) {
      console.info('[Discount Beast] Magalu: sem mudança depois de', code, '(tratado como recusado)');
      return 'rejected';
    }
    return 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      await openDialog();
      // Cupom da lista: botão "Remover". Cupom digitado: o "x" do campo (aria-label "Remover cupom").
      const button = visible(MAGALU.listedRemove) ?? dialog()?.querySelector<HTMLElement>(MAGALU.clearInput) ?? null;
      if (!button) {
        console.warn('[Discount Beast] janela de cupom da Magalu:', dialog()?.outerHTML);
        throw new Error('Não achei o botão "Remover" do cupom na Magalu. Clique em "Salvar carrinho" e mande o arquivo para o Claude.');
      }
      button.scrollIntoView({ block: 'center' });
      await sleep(300);
      clickLikeAPerson(button);
      if (await waitFor(() => !hasCoupon(), 6000)) return;
    }
    throw new Error('Não consegui tirar o cupom da Magalu.');
  },

  items: readMagaluItems,
  suggested: readMagaluSuggested,

  async close() {
    await closeDialog();
  },
};
