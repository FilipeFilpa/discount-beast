import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores da Terabyte (HTML salvo pelo Filipe em 07/11/2026, página /FormasPagamento.obj, site jQuery + Vue).
 * O cupom fica na etapa de pagamento, na sanfona "Cupom de desconto" do resumo.
 *
 * Sem cupom: `input#cupom` + `button#calCupom` "Aplicar".
 * Com cupom aceito: `.cupom-box-v2` mostra "Cupons aplicados:" com `.cupom-box-v2-item` (nome em `.cupom-nome-v2`)
 * e um X `button.bt-rm-cupom`. O resumo ganha "Desconto cupom R$ 200,00" e o preço à vista cai.
 * Recusado: janela SweetAlert `.sweet-alert.visible` "Atenção! / Cupom inválido!" com botão OK (`button.confirm`).
 */
export const TERABYTE = {
  input: '#cupom',
  submit: '#calCupom',
  appliedItem: '.cupom-box-v2 .cupom-box-v2-item',
  appliedName: '.cupom-nome-v2',
  removeX: '.cupom-box-v2 .bt-rm-cupom',
  /** Botão "Remover" ao lado do campo (escondido nas capturas; plano B). */
  removeButton: '#limpaCupom',
  accordion: '[data-cupom-toggle]',
  /** Preço à vista (boleto/Pix): primeiro <p> do bloco "--avista". */
  totalPix: '.new-cart__resume-item--avista .new-cart__resume-item-info p',
  totalCard: '#valortotal',
  items: '.resume-products__name',
  alert: '.sweet-alert',
  alertOk: '.sweet-alert button.confirm',
  ineligibleText: /produto|item|categoria|valor m[íi]nimo|compra m[íi]nima|marca|n[ãa]o se aplica|eleg|forma de pagamento/i,
} as const;

export function isTerabyteCouponPage(): boolean {
  return document.querySelector(TERABYTE.input) !== null && document.querySelector(TERABYTE.submit) !== null;
}

export function readTerabyteTotal(): number | null {
  const pix = parseBRL(visible(TERABYTE.totalPix)?.textContent ?? '');
  if (pix !== null) return pix;
  return parseBRL(document.querySelector(TERABYTE.totalCard)?.textContent ?? '');
}

export function readTerabyteItems(): CartItem[] {
  const names = [...document.querySelectorAll(TERABYTE.items)].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...new Set(names)].map((name) => ({ name, seller: 'Terabyte' }));
}

const appliedItems = () => [...document.querySelectorAll<HTMLElement>(TERABYTE.appliedItem)].filter((el) => !el.closest('.hidden'));
const hasCoupon = () => appliedItems().length > 0;

/** A janela "Atenção! Cupom inválido!", se estiver aberta. */
function openAlert(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(TERABYTE.alert);
  return el && (el.classList.contains('visible') || el.classList.contains('showSweetAlert')) && isVisible(el) ? el : null;
}

async function closeAlert(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!openAlert()) return;
    const ok = document.querySelector<HTMLElement>(TERABYTE.alertOk);
    if (ok) clickLikeAPerson(ok);
    await waitFor(() => !openAlert(), 3000);
  }
}

/** Abre a sanfona do cupom se estiver fechada. */
async function openAccordion(): Promise<void> {
  const toggle = document.querySelector<HTMLElement>(TERABYTE.accordion);
  if (toggle?.getAttribute('aria-expanded') === 'false') {
    clickLikeAPerson(toggle);
    await waitFor(() => visible(TERABYTE.input), 3000);
  }
}

let lastWorked: string | null = null;
/** A Terabyte disse "Cupom já está aplicado!" sem mostrar cupom nenhum (precisa recarregar a página). */
let staleSession = false;

export const terabyteCart: CartAdapter = {
  appliedCode() {
    const item = appliedItems()[0];
    if (!item) return null;
    return (item.querySelector(TERABYTE.appliedName)?.textContent ?? '').trim() || lastWorked || 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readTerabyteTotal, changedFrom);
  },

  async apply(code) {
    await closeAlert();
    await openAccordion();
    if (hasCoupon()) throw new Error('Já tem um cupom aplicado na Terabyte.');
    const input = visible<HTMLInputElement>(TERABYTE.input);
    const submit = visible<HTMLButtonElement>(TERABYTE.submit);
    if (!input || !submit) throw new Error('Não achei o campo "Cupom de desconto" na Terabyte.');
    const before = readTerabyteTotal();
    input.scrollIntoView({ block: 'center' });
    typeInto(input, code);
    // O site é jQuery: também dispara keyup, que alguns handlers usam.
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    clickLikeAPerson(submit);

    const outcome = await waitFor<TryStatus>(() => {
      if (hasCoupon() || (before !== null && readTerabyteTotal() !== before)) { lastWorked = code; return 'worked'; }
      const alert = openAlert();
      if (!alert) return null;
      const text = (alert.querySelector('p')?.textContent ?? alert.textContent ?? '').trim();
      console.info('[Discount Beast] Terabyte recusou', code, '→', text);
      // "Cupom já está aplicado!" sem cupom na tela: o site ficou com o cupom guardado de antes.
      // Não é recusa do código; recarregar a página resolve.
      if (/j[áa] est[áa] aplicad/i.test(text)) { staleSession = true; return 'unknown'; }
      return TERABYTE.ineligibleText.test(text) && !/inv[áa]lid/i.test(text) ? 'ineligible' : 'rejected';
    }, 12_000);
    await closeAlert();
    if (staleSession) {
      staleSession = false;
      throw new Error(`A Terabyte diz que o ${code} "já está aplicado", mas ele não aparece na página. Recarregue a página (F5) e teste de novo.`);
    }
    if (outcome) return outcome;
    if (!hasCoupon() && readTerabyteTotal() === before) {
      console.info('[Discount Beast] Terabyte: sem mudança depois de', code, '(tratado como recusado)');
      return 'rejected';
    }
    return 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      const button = [...document.querySelectorAll<HTMLElement>(TERABYTE.removeX)].find(isVisible) ?? visible<HTMLElement>(TERABYTE.removeButton);
      if (!button) {
        console.warn('[Discount Beast] área do cupom na Terabyte:', document.querySelector('.cupom-box-v2')?.outerHTML);
        throw new Error('Não achei o X do cupom na Terabyte. Clique em "Salvar carrinho" e mande o arquivo para o Claude.');
      }
      button.scrollIntoView({ block: 'center' });
      await sleep(300);
      clickLikeAPerson(button);
      if (await waitFor(() => !hasCoupon(), 6000)) return;
      await closeAlert();
    }
    throw new Error('Não consegui tirar o cupom da Terabyte.');
  },

  items: readTerabyteItems,

  async close() {
    await closeAlert();
  },
};
