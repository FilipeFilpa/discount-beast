import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, readPriceByLabel, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores da Pichau (HTML salvo pelo Filipe em 07/11/2026, página /cart, site em React + MUI).
 * As classes são geradas (mui-xxxx), e os campos têm ids repetidos ("my-input"), então
 * achamos o cupom pelo título da sanfona: "Cupom de desconto" (há também "Cupom de afiliado", que ignoramos).
 *
 * Sem cupom: campo de texto (maxlength 50) + botão "Aplicar".
 * Com cupom aceito (BLACKAMD5): o campo fica desabilitado com o código, o botão vira "Remover"
 * e o resumo ganha a linha "BLACKAMD5  -R$ 61,76". O Total à vista no Pix é o primeiro `[class*=price_vista]`.
 * A Pichau também mostra "Cupons disponíveis para este carrinho" (chips com aria-label "Aplicar cupom X"):
 * esses vão para o começo da fila.
 * Código recusado (captura de 07/11/2026): abre uma janela MUI (`.MuiDialog-root [role=dialog]`)
 * "Ocorreu um erro no seu carrinho!" / "Cupom inválido. Verifique o código e tente novamente." com botão OK.
 * Ela trava a página até alguém clicar em OK, então o testador lê a mensagem e fecha.
 */
export const PICHAU = {
  sectionTitle: /^cupom de desconto$/i,
  input: 'input[type="text"]',
  submit: 'button[type="submit"]',
  summary: '[data-cy="cart-summary"]',
  totalPix: '[data-cy="cart-summary"] [class*="price_vista"]',
  suggested: '[aria-label^="Aplicar cupom "]',
  items: 'table[aria-label="cart list"] [class*="productName"]',
  /** Janela de erro do carrinho (o chat "Pru da Pichau" também é role=dialog, mas não fica dentro de .MuiDialog-root). */
  errorDialog: '.MuiDialog-root [role="dialog"]',
  /** Avisos flutuantes comuns em sites MUI (Snackbar, notistack, Toastify). */
  toast: '[role="alert"], .MuiSnackbar-root, .MuiAlert-message, #notistack-snackbar, .Toastify__toast, [class*="snackbar" i], [class*="toast" i]',
  errorText: /inv[áa]lid|expirad|n[ãa]o (encontrad|existe|[ée] v[áa]lid|permitid|aplic|pode)|j[áa] (foi )?utilizad|erro|indispon/i,
  ineligibleText: /produto|item|categoria|valor m[íi]nimo|compra m[íi]nima|marca|n[ãa]o se aplica|eleg/i,
} as const;

/** A sanfona "Cupom de desconto" (o bloco inteiro, com título e formulário). */
function couponSection(): HTMLElement | null {
  for (const title of document.querySelectorAll<HTMLElement>('.MuiAccordion-root h5, .MuiAccordion-root h3, [class*="Accordion"] h5')) {
    if (!PICHAU.sectionTitle.test((title.textContent ?? '').trim())) continue;
    const section = title.closest<HTMLElement>('.MuiAccordion-root') ?? title.parentElement?.parentElement?.parentElement ?? null;
    if (section) return section;
  }
  return null;
}

/** Abre a sanfona se estiver fechada (o formulário só aparece aberto). */
async function openSection(): Promise<HTMLElement | null> {
  const section = couponSection();
  if (!section) return null;
  const header = section.querySelector<HTMLElement>('[aria-expanded]');
  if (header?.getAttribute('aria-expanded') === 'false') {
    clickLikeAPerson(header);
    await waitFor(() => visible(PICHAU.input, section), 3000);
  }
  return section;
}

const input = () => { const s = couponSection(); return s ? s.querySelector<HTMLInputElement>(PICHAU.input) : null; };
const submit = () => { const s = couponSection(); return s ? s.querySelector<HTMLButtonElement>(PICHAU.submit) : null; };
const buttonSaysRemove = () => /remov/i.test(submit()?.textContent ?? '');

const hasCoupon = () => {
  const field = input();
  return buttonSaysRemove() || (field !== null && field.disabled);
};

export function isPichauCart(): boolean {
  return /^\/cart/.test(location.pathname) && couponSection() !== null;
}

export function readPichauTotal(): number | null {
  const pix = parseBRL(visible(PICHAU.totalPix)?.textContent ?? '');
  if (pix !== null) return pix;
  // Plano B: a linha "Total" do resumo (preço no cartão).
  return readPriceByLabel(/^total$/i, parseBRL);
}

/** Códigos que a própria Pichau sugere para este carrinho (chips "BLACKAMD5 — 5% OFF"). */
export function readPichauSuggested(): string[] {
  return [...document.querySelectorAll<HTMLElement>(PICHAU.suggested)]
    .map((chip) => (chip.getAttribute('aria-label') ?? '').replace(/^Aplicar cupom\s+/i, '').trim().toUpperCase())
    .filter((code) => /^[A-Z0-9_-]{3,50}$/.test(code));
}

export function readPichauItems(): CartItem[] {
  const names = [...document.querySelectorAll(PICHAU.items)].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  // A Pichau vende os próprios produtos.
  return [...new Set(names)].map((name) => ({ name, seller: 'Pichau' }));
}

/** Janela de erro aberta (ex.: "Cupom inválido. Verifique o código e tente novamente."). */
function errorDialog(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(PICHAU.errorDialog)].find(isVisible) ?? null;
}

/** Clica no OK da janela de erro e espera ela sumir. */
async function closeErrorDialog(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const dialog = errorDialog();
    if (!dialog) return;
    const ok = [...dialog.querySelectorAll<HTMLElement>('button')].find((b) => /^(ok|fechar|entendi)$/i.test((b.textContent ?? '').trim()))
      ?? dialog.querySelector<HTMLElement>('.MuiDialogActions-root button');
    if (ok) clickLikeAPerson(ok);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !errorDialog(), 3000);
  }
}

/** Mensagem de erro, se houver (só as que apareceram depois do clique contam). */
function errorToast(ignore: Set<Element>): HTMLElement | null {
  const dialog = errorDialog();
  if (dialog) return dialog.querySelector<HTMLElement>('.MuiDialogContent-root, #alert-dialog-description') ?? dialog;
  for (const el of document.querySelectorAll<HTMLElement>(PICHAU.toast)) {
    if (ignore.has(el) || !isVisible(el)) continue;
    if (el.closest('discount-beast-panel, discount-beast-capture')) continue;
    if (PICHAU.errorText.test(el.textContent ?? '') || /error/i.test(el.className)) return el;
  }
  // Mensagem de ajuda embaixo do campo (MUI FormHelperText).
  const helper = couponSection()?.querySelector<HTMLElement>('.MuiFormHelperText-root, .Mui-error p, p.Mui-error');
  return helper && isVisible(helper) && (helper.textContent ?? '').trim() && !ignore.has(helper) ? helper : null;
}

let lastWorked: string | null = null;

export const pichauCart: CartAdapter = {
  appliedCode() {
    if (!hasCoupon()) return null;
    const value = input()?.value.trim();
    return value || lastWorked || 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readPichauTotal, changedFrom);
  },

  async apply(code) {
    const section = await openSection();
    const field = input();
    if (!section || !field) throw new Error('Não achei o campo "Cupom de desconto" na Pichau.');
    if (hasCoupon()) throw new Error('Já tem um cupom aplicado na Pichau.');
    await closeErrorDialog();
    const before = readPichauTotal();
    const oldToasts = new Set<Element>(document.querySelectorAll(PICHAU.toast));
    const oldHelper = section.querySelector('.MuiFormHelperText-root');
    if (oldHelper) oldToasts.add(oldHelper);

    field.scrollIntoView({ block: 'center' });
    typeInto(field, code);
    const button = await waitFor(() => { const b = submit(); return b && !b.disabled ? b : null; }, 3000);
    if (!button) throw new Error('O botão "Aplicar" da Pichau não ficou disponível.');
    clickLikeAPerson(button);

    const outcome = await waitFor<TryStatus>(() => {
      if (hasCoupon() || (before !== null && readPichauTotal() !== before)) { lastWorked = code; return 'worked'; }
      const err = errorToast(oldToasts);
      if (!err) return null;
      const text = err.textContent ?? '';
      console.info('[Discount Beast] Pichau recusou', code, '→', text.trim());
      void closeErrorDialog();
      return PICHAU.ineligibleText.test(text) && !/inv[áa]lid/i.test(text) ? 'ineligible' : 'rejected';
    }, 12_000);
    if (outcome) {
      await closeErrorDialog();
      return outcome;
    }
    // Nada mudou em 12 s: o campo continua livre e o Total igual → a Pichau não aceitou.
    // (o aviso de erro dela pode ter sumido antes de a gente ver)
    if (!hasCoupon() && readPichauTotal() === before) {
      console.info('[Discount Beast] Pichau: sem mudança depois de', code, '(tratado como recusado)');
      return 'rejected';
    }
    return 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      const button = submit();
      if (!button || !buttonSaysRemove()) {
        console.warn('[Discount Beast] área do cupom na Pichau:', couponSection()?.outerHTML);
        throw new Error('Não achei o botão "Remover" do cupom na Pichau. Clique em "Salvar carrinho" e mande o arquivo para o Claude.');
      }
      button.scrollIntoView({ block: 'center' });
      await sleep(300);
      clickLikeAPerson(button);
      if (await waitFor(() => !hasCoupon(), 6000)) return;
    }
    throw new Error('Não consegui tirar o cupom da Pichau.');
  },

  items: readPichauItems,
  suggested: readPichauSuggested,

  async close() {
    // O campo fica no resumo do carrinho; só fecha a janela de erro, se ficou aberta.
    await closeErrorDialog();
  },
};
