import type { CartItem } from '../coupon-match';
import type { CartAdapter, TryStatus } from '../coupon-runner';
import { parseBRL } from '../price';
import { clickLikeAPerson, isVisible, sleep, stableValue, typeInto, visible, waitFor } from './dom';

/**
 * Seletores da KaBuM! (tirados do HTML salvo pelo Filipe em 07/11/2026, página /endereco).
 * O campo de cupom NÃO fica no /carrinho: aparece no resumo do pedido a partir da etapa "Endereço".
 *
 * Como funciona lá: `form#couponWrapper` com o campo "Cupom de desconto" e o botão "Aplicar".
 * Código errado → um <p> vermelho no próprio form: "CUPOM INVÁLIDO, EXPIRADO OU JÁ UTILIZADO."
 * Total: `section#total` → "Total: À vista no Pix R$ 3.899,00" (o <b>), depois "ou à prazo R$ ...".
 * AINDA NÃO VISTO: como fica com um cupom aceito (botão de remover?). Por isso a remoção é um palpite.
 */
export const KABUM = {
  form: '#couponWrapper',
  input: '#inputAplicarCupom, input[data-testid="input-coupon"]',
  submit: 'button[data-testid="button-apply-coupon"]',
  /** Mensagem embaixo do campo (o erro tem fundo vermelho: bg-error-100). */
  message: '#couponWrapper p',
  errorText: /inv[áa]lido|expirado|j[áa] utilizado|n[ãa]o (encontrado|existe|é v[áa]lido|e v[áa]lido|permitido)|erro/i,
  /** Erros de "o código existe, mas não serve para este carrinho". */
  ineligibleText: /produto|item|categoria|valor m[íi]nimo|compra m[íi]nima|marca|vendedor|n[ãa]o se aplica|eleg/i,
  removeText: /remov|excluir|retirar|apagar|cancelar cupom/i,
  totalPix: '#total b',
  /** No /carrinho guardamos os nomes dos produtos aqui, porque o /endereco não mostra a lista. */
  itemsKey: 'discount-beast-kabum-items',
} as const;

/** A KaBuM! mostra o cupom nas etapas Endereço, Entrega e Pagamento. */
export function isKabumCouponPage(): boolean {
  // Só o form: com um cupom aplicado o campo pode sumir, e o cartão precisa continuar na tela.
  return visible(KABUM.form) !== null;
}

export function readKabumTotal(): number | null {
  const pix = parseBRL(visible(KABUM.totalPix)?.textContent ?? '');
  if (pix !== null) return pix;
  // Plano B: primeiro R$ da seção Total (o preço à vista vem antes do "à prazo").
  return parseBRL(visible('#total')?.textContent ?? '');
}

/**
 * No /carrinho: salva nome e vendedor de cada produto para usar depois no /endereco.
 * HTML do carrinho (07/11/2026): cada vendedor tem "Vendido e entregue por: <b>Loja Gazin</b>"
 * e seus produtos em `#ProductContainer`, com o nome em `a.productName`.
 */
export function rememberKabumItems(): void {
  if (!/^\/carrinho/.test(location.pathname)) return;
  const items: CartItem[] = [];
  for (const sellerTag of document.querySelectorAll('#sellersContainer .sellerName')) {
    const seller = sellerTag.querySelector('b')?.textContent?.trim();
    const group = sellerTag.parentElement;
    for (const link of group?.querySelectorAll('a.productName') ?? []) {
      const name = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (name) items.push(seller ? { name, seller } : { name });
    }
  }
  // Plano B, se a KaBuM! mudar o HTML: qualquer link de produto com texto.
  if (!items.length) {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('main a[href*="/produto/"]')) {
      const name = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (name.length > 10 && !items.some((i) => i.name === name)) items.push({ name });
    }
  }
  if (!items.length) return;
  try { sessionStorage.setItem(KABUM.itemsKey, JSON.stringify(items)); } catch { /* sem sessionStorage */ }
}

export function readKabumItems(): CartItem[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KABUM.itemsKey) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter((i): i is CartItem => typeof i?.name === 'string').map((i) => (typeof i.seller === 'string' ? { name: i.name, seller: i.seller } : { name: i.name }));
  } catch {
    return [];
  }
}

const visibleMessage = () => {
  const el = visible(KABUM.message);
  return el && (el.textContent ?? '').trim() ? el : null;
};
const visibleError = () => {
  const el = visibleMessage();
  return el && (KABUM.errorText.test(el.textContent ?? '') || /error/.test(el.className)) ? el : null;
};

/** Botão de tirar o cupom (palpite): um botão no form que não é o "Aplicar", ou o próprio botão virando "Remover". */
function findRemoveButton(): HTMLElement | null {
  const form = visible(KABUM.form);
  if (!form) return null;
  const buttons = [...form.querySelectorAll<HTMLElement>('button, [role="button"], a')].filter(isVisible);
  const label = (b: HTMLElement) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''} ${b.title} ${b.dataset.testid ?? ''}`;
  return (
    buttons.find((b) => KABUM.removeText.test(label(b))) ??
    // Com cupom aplicado o campo costuma sumir e sobrar só um botão (o X).
    (!visible(KABUM.input) ? buttons.find((b) => !b.matches(KABUM.submit)) ?? null : null)
  );
}

const hasCoupon = () => {
  const input = visible<HTMLInputElement>(KABUM.input);
  if (!visible(KABUM.form)) return false;
  return findRemoveButton() !== null || !input || input.disabled || input.readOnly;
};

let lastWorked: string | null = null;

export const kabumCart: CartAdapter = {
  appliedCode() {
    if (!hasCoupon()) return null;
    const text = (visible(KABUM.form)?.textContent ?? '').replace(/cupom de desconto|aplicar|aplicado/gi, '');
    return text.match(/\b[A-Z0-9][A-Z0-9_-]{2,}\b/)?.[0] ?? lastWorked ?? 'CUPOM';
  },

  total(changedFrom) {
    return stableValue(readKabumTotal, changedFrom);
  },

  async apply(code) {
    const before = readKabumTotal();
    const input = visible<HTMLInputElement>(KABUM.input);
    if (!input || input.disabled) throw new Error(hasCoupon() ? 'Já tem um cupom aplicado na KaBuM!.' : 'Não achei o campo "Cupom de desconto".');
    input.scrollIntoView({ block: 'center' });
    typeInto(input, code);
    const submit = await waitFor(() => {
      const b = visible<HTMLButtonElement>(KABUM.submit);
      return b && !b.disabled ? b : null;
    }, 3000);
    if (!submit) throw new Error('O botão "Aplicar" da KaBuM! não ficou disponível.');
    // O erro do código anterior pode continuar na tela até a resposta do novo.
    const staleError = visibleError();
    const staleText = staleError?.textContent ?? '';
    clickLikeAPerson(submit);

    const start = Date.now();
    let oldError: Element | null = staleError;
    const outcome = await waitFor<TryStatus>(() => {
      const err = visibleError();
      if (err) {
        // Mesmo erro, mesmo elemento: espera um pouco para ter certeza de que é a resposta nova.
        if (err !== oldError || err.textContent !== staleText || Date.now() - start > 4000) {
          const text = err.textContent ?? '';
          return KABUM.ineligibleText.test(text) && !/inv[áa]lido, expirado/i.test(text) ? 'ineligible' : 'rejected';
        }
        return null;
      }
      oldError = null;
      if (hasCoupon() || (before !== null && readKabumTotal() !== before)) { lastWorked = code; return 'worked'; }
      return null;
    }, 15_000);
    return outcome ?? 'unknown';
  },

  async remove() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!hasCoupon()) return;
      const button = await waitFor(findRemoveButton, 3000);
      if (!button) {
        console.warn('[Discount Beast] área do cupom na KaBuM!:', visible(KABUM.form)?.outerHTML);
        throw new Error('Não achei o botão de tirar o cupom na KaBuM!. Clique em "Salvar carrinho" e mande o arquivo para o Claude.');
      }
      button.scrollIntoView({ block: 'center' });
      await sleep(300);
      clickLikeAPerson(button);
      if (await waitFor(() => !hasCoupon(), 6000)) return;
    }
    throw new Error('Não consegui tirar o cupom da KaBuM!.');
  },

  items: readKabumItems,

  async close() {
    // O campo fica no resumo do pedido, sem janela.
  },
};
