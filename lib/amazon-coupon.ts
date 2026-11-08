import { clickLikeAPerson, isVisible, waitFor } from './carts/dom';

/**
 * Cupom "Aplicar cupom" da página de produto da Amazon (o "clip coupon").
 * Não é um código: é uma caixinha (ou botão) perto do preço. Marcando, o desconto entra sozinho
 * no fechamento do pedido.
 *
 * AINDA NÃO VISTO NA AMAZON.COM.BR (a Amazon bloqueia o acesso do Claude): os seletores abaixo vêm
 * do HTML conhecido da Amazon em outros países, onde o bloco fica em #promoPriceBlockMessage_feature_div:
 *   <label id="couponTextpctchXXXX" for="checkboxpctchXXXX">Aplicar cupom de 10%</label>
 *   <input type="checkbox" id="checkboxpctchXXXX">
 * e depois do clique o texto vira "Cupom de 10% aplicado...". Por isso a busca é por texto ("cupom" +
 * "aplicar"), dentro de blocos com cara de cupom, e nunca em botões de carrinho/compra.
 */
export const AMAZON_COUPON = {
  /** Blocos onde o cupom costuma aparecer (o primeiro é o mais comum). */
  blocks: '#promoPriceBlockMessage_feature_div, [id^="couponFeature"], [id*="couponBadge" i], [id^="vpcButton"], [class*="couponFeature" i], [class*="couponLabel" i], [id^="couponText"]',
  /** Área do produto principal, para não pegar cupom de produto patrocinado/carrossel. */
  main: '#centerCol, #ppd, #apex_desktop, #corePriceDisplay_desktop_feature_div, #dp-container, #rightCol',
} as const;

// "Resgatar" + "Código: DEVOLTA1000" (promoção Prime vista no iPhone, 08/11/2026) também conta, mesmo sem a palavra "cupom".
const COUPON = /\bcupo(m|ns)\b|\bcoupon|\bc[óo]digo\b|\bresgatar\b/i;
/** Botão de ação de cupom/promoção (texto exato). */
const ACTION_BUTTON = /^(aplicar( cupom)?|resgatar( cupom)?|apply|clip coupon)$/i;
const APPLY = /\b(aplicar|resgatar|apply|clip)\b/i;
// "Utilizado" (com ✓) é o que a promoção "Resgatar" mostra depois do clique (visto no Chrome do Filipe, 08/11/2026).
const APPLIED = /\b(aplicado|resgatado|utilizado|applied|clipped)\b/i;
/** Botões que nunca clicamos, mesmo perto do cupom. */
const NEVER = /carrinho|comprar|assin|subscri|garantia|prote[çc][ãa]o|cart\b|buy\b/i;

// Só o texto VISÍVEL (innerText): a Amazon deixa escondido na página o estado "✓ Utilizado" do botão Resgatar,
// e com textContent a extensão achava que o cupom já estava usado (visto no relógio Invicta, 08/11/2026).
const text = (el: Element | null | undefined) =>
  ((el instanceof HTMLElement ? el.innerText : el?.textContent) ?? '').replace(/\s+/g, ' ').trim();

export interface CouponOffer {
  /** O que clicar: a caixinha ou o botão "Aplicar". */
  control: HTMLElement;
  /** O bloco do cupom, para conferir se mudou para "aplicado". */
  block: HTMLElement;
  /** "10%" ou "R$ 20,00" (quando dá para ler). */
  amount: string | null;
  label: string;
}

export function couponAmount(label: string): string | null {
  return label.match(/R\$\s?\d[\d.]*(?:,\d{2})?/)?.[0] ?? label.match(/\d+(?:,\d+)?\s?%/)?.[0]?.replace(/\s/g, '') ?? null;
}

/** Texto que descreve uma caixinha: o <label for>, o label em volta ou o "couponText" com o mesmo sufixo. */
function checkboxLabel(input: HTMLInputElement, doc: Document): string {
  const parts = [...(input.labels ?? [])].map(text);
  const suffix = input.id.replace(/^checkbox/i, '');
  if (suffix && suffix !== input.id) parts.push(text(doc.getElementById(`couponText${suffix}`)));
  parts.push(text(input.closest('label')));
  return parts.filter(Boolean).join(' ');
}

/** Blocos de cupom do produto principal que estão na tela. */
function couponBlocks(doc: Document): HTMLElement[] {
  const main = [...doc.querySelectorAll<HTMLElement>(AMAZON_COUPON.main)];
  const blocks = [...doc.querySelectorAll<HTMLElement>(AMAZON_COUPON.blocks)]
    .filter((b) => isVisible(b) && COUPON.test(text(b)) && (!main.length || main.some((m) => m.contains(b))));
  // Plano B: botão "Resgatar"/"Aplicar" em qualquer lugar do produto principal, com o bloco de texto em volta
  // (sobe até achar um pai que fale de desconto). Não sabemos o id do bloco da promoção "Exclusivo Prime".
  for (const button of doc.querySelectorAll<HTMLElement>('button, .a-button, a, input[type="submit"]')) {
    const label = text(button) || (button as HTMLInputElement).value || '';
    if (!ACTION_BUTTON.test(label) || !isVisible(button) || (main.length && !main.some((m) => m.contains(button)))) continue;
    let block: HTMLElement | null = button.parentElement;
    for (let up = 0; block && up < 5; up++, block = block.parentElement) {
      const t = text(block);
      if (t.length > 600) { block = null; break; }
      if (t !== label && /off|desconto|c[óo]digo|cupom|R\$|%/i.test(t)) break;
    }
    if (block && !blocks.some((b) => b.contains(block!))) blocks.push(block);
  }
  // Fica só com o bloco mais de fora (os seletores se sobrepõem).
  return blocks.filter((b) => !blocks.some((o) => o !== b && o.contains(b)));
}

/** Código escrito no bloco ("Código: DEVOLTA1000", "Salve o cupom R$40 : IWZKJIIDSVSQ"), para guardar em "Meus cupons".
 * Só MAIÚSCULAS/números: "Cupom: Aplicar..." não vira o código APLICAR. */
export function promoCodes(doc: Document = document): string[] {
  const codes = couponBlocks(doc).flatMap((b) => [...text(b).matchAll(/(?:[Cc][óo]digo|[Cc]upom[^:]{0,25}):\s*([A-Z0-9][A-Z0-9_-]{3,24})\b/g)].map((m) => m[1]!));
  return [...new Set(codes)];
}

/** Há texto de cupom no produto principal? (serve para saber se vale salvar a página quando não conseguimos clicar). */
export function pageMentionsCoupon(doc: Document = document): boolean {
  // Só quando pede ação ("Aplicar/Resgatar cupom"): "ganhe cupom na próxima compra" não conta.
  return couponBlocks(doc).some((b) => APPLY.test(text(b)) && !APPLIED.test(text(b)));
}

/** Acha o cupom ainda não ativado do produto principal. */
export function findCouponOffer(doc: Document = document): CouponOffer | null {
  for (const block of couponBlocks(doc)) {
    // 1) Caixinha "Aplicar cupom de X".
    for (const input of block.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const label = checkboxLabel(input, doc) || text(block);
      if (input.checked || input.disabled || NEVER.test(label) || !APPLY.test(label) || APPLIED.test(label)) continue;
      // O <input> da Amazon costuma ser invisível (a caixinha desenhada é um <i>): clica no que está na tela.
      const shown = input.getBoundingClientRect().width > 0;
      const control: HTMLElement = shown ? input : ([...(input.labels ?? [])].find(isVisible) ?? input.closest<HTMLElement>('label, .a-checkbox') ?? input);
      return { control, block, amount: couponAmount(label), label };
    }
    // 2) Botão/link "Aplicar" / "Resgatar".
    for (const el of block.querySelectorAll<HTMLElement>('button, a, input[type="submit"], input[type="button"], .a-button')) {
      const label = text(el) || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '';
      if (!isVisible(el) || NEVER.test(label) || !/^(aplicar|resgatar|apply|clip)\b/i.test(label) || APPLIED.test(label)) continue;
      // .a-button da Amazon: o clique de verdade fica no <input class="a-button-input"> de dentro.
      const control = el.matches('.a-button') ? (el.querySelector<HTMLElement>('input, button, a') ?? el) : el;
      return { control, block, amount: couponAmount(text(block)), label: text(block) };
    }
  }
  return null;
}

/** O cupom do produto principal já está ativado? */
export function couponAlreadyApplied(doc: Document = document): string | null {
  const block = couponBlocks(doc).find((b) => APPLIED.test(text(b)) || !!b.querySelector('input[type="checkbox"]:checked'));
  return block ? text(block) : null;
}

/** Clica e espera a Amazon confirmar ("aplicado", caixinha marcada ou o botão sumir). */
export async function clipCoupon(offer: CouponOffer, timeoutMs = 8000): Promise<boolean> {
  offer.control.scrollIntoView({ block: 'center' });
  clickLikeAPerson(offer.control);
  const done = () => {
    if (!offer.block.isConnected) return !!couponAlreadyApplied(offer.block.ownerDocument);
    const box = offer.block.querySelector<HTMLInputElement>('input[type="checkbox"]');
    return APPLIED.test(text(offer.block)) || !!box?.checked || !offer.control.isConnected;
  };
  return !!(await waitFor(done, timeoutMs)) || done();
}
