import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { sleep, stableValue, typeInto, waitFor } from './dom';

/**
 * Seletores do carrinho do Mercado Livre (HTML salvo pelo Filipe em 08/11/2026,
 * www.mercadolivre.com.br/gz/cart/v2). Componentes "andes" do próprio ML.
 *
 * Resumo da compra: botão "Inserir código do cupom" (.cl-summary__coupon-button) abre a janela "Cupons"
 * (.cl-iframe-modal--coupons). O formulário mora DENTRO de um iframe do mesmo site
 * (/cupons/cart?context=general...), então lemos e preenchemos pelo `contentDocument`.
 * - campo `#inputcode-textfield-inline` (máx. 23 letras) + botão "Inserir" ao lado;
 * - erro: `.andes-helper--error` embaixo do campo, ex. "O cupom não está mais disponível." (campo com aria-invalid);
 * - lista de cupons da conta: "Você não tem cupons disponíveis" no caso do Filipe.
 * A janela fecha com qualquer clique fora dela (inclusive no cartão do Discount Beast).
 * Total: `.cl-summary__row--total`, o preço que NÃO é o riscado (`andes-money-amount--previous`), já com Pix.
 *
 * AINDA NÃO VISTO: como fica com um cupom aceito (linha no resumo? botão de remover na janela?).
 * Por isso a detecção de "aceito" usa o Total e a remoção procura um botão pelo texto.
 */
export const ML = {
  couponButton: '.cl-summary__coupon-button',
  couponRow: '.cl-summary__row--coupon',
  modal: '.cl-iframe-modal--coupons',
  frame: '.cl-iframe-modal--coupons iframe',
  closeButton: '.cl-iframe-modal--coupons .andes-modal__close-button',
  input: '#inputcode-textfield-inline',
  submit: '.andes-form-control__embedded button',
  error: '.andes-helper--error',
  totalRow: '.cl-summary__row--total',
  money: '.andes-money-amount:not(.andes-money-amount--previous)',
  itemTitle: '.cl-item-card .poly-component__title',
  ineligibleText: /produto|item|categoria|valor m[íi]nimo|compra m[íi]nima|marca|vendedor|n[ãa]o se aplica|eleg|loja/i,
  removeText: /remov|desaplic|excluir|retirar|tirar cupom|cancelar cupom/i,
  /** Rótulo do botão do resumo quando NÃO há cupom. */
  emptyLabel: /inserir c[óo]digo do cupom/i,
} as const;

/** Elementos do iframe vêm de outra "janela": `instanceof HTMLElement` falha, então medimos direto. */
const shown = (el: Element | null | undefined): el is HTMLElement => {
  if (!el) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};

export function isMercadoLivreCart(): boolean {
  return /^\/(gz\/)?cart/.test(location.pathname) && document.querySelector(ML.totalRow) !== null;
}

/** "R$ 10.924,05": o ML separa reais e centavos em spans, mas o aria-label tem "10924 reais com 05 centavos". */
export function readAndesMoney(el: Element | null): number | null {
  if (!el) return null;
  const label = el.getAttribute('aria-label') ?? '';
  const spoken = /([\d.]+)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos)?/i.exec(label);
  if (spoken?.[1]) return Number(spoken[1].replace(/\./g, '')) + Number(spoken[2] ?? 0) / 100;
  const fraction = el.querySelector('.andes-money-amount__fraction')?.textContent?.replace(/\D/g, '');
  if (!fraction) return null;
  const cents = el.querySelector('.andes-money-amount__cents')?.textContent?.replace(/\D/g, '') ?? '0';
  return Number(fraction) + Number(cents) / 100;
}

export function readMercadoLivreTotal(): number | null {
  const row = document.querySelector(ML.totalRow);
  return readAndesMoney(row?.querySelector(ML.money) ?? null);
}

export function readMercadoLivreItems(): CartItem[] {
  // Só os produtos marcados entram na compra (e no cupom): desmarcados ficam de fora do perfil do carrinho.
  const names = [...document.querySelectorAll(ML.itemTitle)]
    .filter((el) => {
      const box = el.closest('.cl-item-card')?.querySelector<HTMLInputElement>('.poly-card__checkbox input[type=checkbox]');
      return !box || box.checked;
    })
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(names)].map((name) => ({ name }));
}

const frameDoc = (): Document | null => {
  const frame = document.querySelector<HTMLIFrameElement>(ML.frame);
  try { return frame?.contentDocument ?? null; } catch { return null; }
};
const input = () => frameDoc()?.querySelector<HTMLInputElement>(ML.input) ?? null;
const errorShown = () => {
  const el = frameDoc()?.querySelector(ML.error);
  return el && (el.textContent ?? '').trim() ? el : null;
};

/** Texto do botão do resumo: "Inserir código do cupom" sem cupom; com cupom, imaginamos que mostre o código/desconto. */
const couponRowText = () => (document.querySelector(ML.couponRow)?.textContent ?? '').replace(/\s+/g, ' ').trim();
const removeButtonIn = (root: ParentNode | null | undefined): HTMLElement | null => {
  if (!root) return null;
  const candidates = [...root.querySelectorAll<HTMLElement>('button, [role="button"], a')].filter(shown);
  const label = (b: HTMLElement) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''} ${b.title}`;
  return candidates.find((b) => ML.removeText.test(label(b))) ?? null;
};

let lastWorked: string | null = null;
let baseTotal: number | null = null;

/**
 * Texto da linha "Cupons" antes de testarmos qualquer código. Cupons da sua conta (ativados em /cupons,
 * ex.: LIQUIDA 30% OFF) já chegam aplicados: "Cupons (1/1 em uso)". Eles não têm botão de tirar e
 * acumulam com o código digitado, então NÃO contam como "cupom aplicado" para o testador.
 */
let initialRow: string | null = null;
const snapshotRow = () => { if (initialRow === null && lastWorked === null) initialRow = couponRowText(); };

const hasCoupon = () => {
  if (removeButtonIn(frameDoc()) !== null) return true;
  const row = couponRowText();
  if (!row || ML.emptyLabel.test(row)) return false;
  return initialRow === null ? true : row !== initialRow;
};

async function openModal(): Promise<Document | null> {
  if (input()) return frameDoc();
  const button = document.querySelector<HTMLElement>(ML.couponButton);
  if (!button) return null;
  button.scrollIntoView({ block: 'center' });
  button.click();
  return waitFor(() => (input() ? frameDoc() : null), 8000);
}

async function closeModal(): Promise<void> {
  for (let attempt = 0; attempt < 2 && document.querySelector(ML.modal); attempt++) {
    document.querySelector<HTMLElement>(ML.closeButton)?.click();
    await waitFor(() => !document.querySelector(ML.modal), 3000);
  }
}

export const mercadoLivreCart: CartAdapter = {
  appliedCode() {
    snapshotRow();
    if (!hasCoupon()) return null;
    const fromRow = couponRowText().match(/\b[A-Z0-9][A-Z0-9_-]{3,22}\b/)?.[0];
    return fromRow ?? lastWorked ?? 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readMercadoLivreTotal, changedFrom);
  },

  async apply(code) {
    snapshotRow();
    const before = readMercadoLivreTotal();
    if (baseTotal === null) baseTotal = before;
    if (!(await openModal())) throw new Error('Não consegui abrir a janela "Inserir código do cupom" do Mercado Livre.');
    const field = input();
    if (!field) throw new Error('Não achei o campo do cupom na janela do Mercado Livre.');
    // O ML tem reCAPTCHA nessa janela: vamos devagar, como uma pessoa.
    await sleep(1200);
    typeInto(field, code);
    // Ao digitar, o erro do código anterior some; esperamos isso para não ler a resposta velha.
    await waitFor(() => !errorShown(), 1500);
    const submit = frameDoc()?.querySelector<HTMLButtonElement>(ML.submit);
    if (!submit) throw new Error('Não achei o botão "Inserir" na janela de cupons do Mercado Livre.');
    const stale = errorShown();
    submit.click();

    // Se o erro antigo não sumiu ao digitar, só aceitamos erro depois que ele sumir (ou após 3 s).
    const start = Date.now();
    let cleared = !stale;
    const outcome = await waitFor<TryStatus>(() => {
      const err = errorShown();
      if (!cleared) {
        if (err && Date.now() - start < 3000) return null;
        cleared = true;
      }
      if (err) {
        const text = (err.textContent ?? '').trim();
        console.info('[Discount Beast] Mercado Livre recusou', code, '→', text);
        return ML.ineligibleText.test(text) && !/n[ãa]o est[áa] mais dispon|inv[áa]lido|n[ãa]o existe/i.test(text) ? 'ineligible' : 'rejected';
      }
      const now = readMercadoLivreTotal();
      if (hasCoupon() || (before !== null && now !== null && now !== before)) { lastWorked = code; return 'worked'; }
      return null;
    }, 15_000);
    if (outcome) return outcome;
    console.warn('[Discount Beast] janela de cupons do ML depois de', code, ':', frameDoc()?.body?.innerText);
    return 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      // Palpite: botão "Remover" na janela de cupons ou na linha do cupom no resumo.
      const doc = await openModal();
      const button = removeButtonIn(doc) ?? removeButtonIn(document.querySelector(ML.couponRow)?.parentElement);
      if (!button) {
        console.warn('[Discount Beast] janela de cupons do ML:', doc?.body?.innerHTML, 'resumo:', couponRowText());
        throw new Error('Não achei como tirar o cupom no Mercado Livre. Use "Salvar daqui a 5 s" com o cupom aplicado e a janela aberta, e mande o arquivo para o Claude.');
      }
      button.click();
      if (await waitFor(() => !hasCoupon(), 6000)) return;
    }
    throw new Error('Não consegui tirar o cupom do Mercado Livre.');
  },

  items: readMercadoLivreItems,

  async close() {
    await closeModal();
  },
};
