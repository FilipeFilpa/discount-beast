import { clipCoupon, couponAlreadyApplied, findCouponOffer, pageMentionsCoupon, promoCodes } from '@/lib/amazon-coupon';
import { addMyCoupons, getMyCoupons } from '@/lib/my-coupons';
import { cleanPageHtml, downloadText } from '@/lib/page-capture';

/**
 * Página de produto da Amazon: se o produto tem "Aplicar cupom", a extensão marca sozinha e avisa
 * num cartão pequeno no topo, à direita (embaixo ficam os cartões de preço e de cupons).
 * A Amazon troca de produto (cor/tamanho) sem recarregar a página: confere a cada 1,5 s, uma vez por produto.
 * Se a página fala de cupom mas não achamos o que clicar, o cartão oferece salvar a página para o Claude.
 */
const ASIN = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i;

export default defineContentScript({
  matches: ['https://www.amazon.com.br/*', 'https://amazon.com.br/*'],
  runAt: 'document_idle',
  main() {
    if (window.top !== window) return;
    const seen = new Set<string>();
    let busy = false;
    let firstSeenAt = 0;
    let lastAsin = '';
    setInterval(async () => {
      const asin = location.pathname.match(ASIN)?.[1]?.toUpperCase();
      if (!asin || busy || seen.has(asin)) return;
      if (asin !== lastAsin) { lastAsin = asin; firstSeenAt = Date.now(); }
      // Primeiro procura algo para clicar; "já ativado" só quando não há nada a fazer
      // (uma página pode ter uma promoção já usada e outra com "Resgatar").
      const offer = findCouponOffer();
      const applied = offer ? null : couponAlreadyApplied();
      // Código escrito na promoção ("Código: DEVOLTA1000"): vai para "Meus cupons" da Amazon,
      // para o testador da página de pagamento tentar primeiro.
      const kept = (applied || offer) ? await keepCodes() : '';
      if (applied) {
        seen.add(asin);
        toast(`Cupom já ativado neste produto: “${short(applied)}”.${kept}`);
        return;
      }
      if (!offer) {
        // O bloco de cupom pode chegar depois do resto da página: espera 8 s antes de desistir deste produto.
        if (Date.now() - firstSeenAt < 8000) return;
        seen.add(asin);
        if (pageMentionsCoupon()) toast('Este produto tem cupom, mas não achei onde clicar. Salve a página e mande para o Claude.', { save: true });
        return;
      }
      busy = true;
      seen.add(asin);
      const ok = await clipCoupon(offer);
      busy = false;
      const next = /pr[óo]xima compra/i.test(offer.label);
      if (ok && next) toast(`Promoção${offer.amount ? ` de ${offer.amount}` : ''} resgatada ✓ Vale na sua próxima compra.${kept}`);
      else if (ok) toast(`Cupom${offer.amount ? ` de ${offer.amount}` : ''} ativado ✓ O desconto entra no fechamento do pedido.${kept}`);
      else toast(`Cliquei em “${short(offer.label)}”, mas a Amazon não confirmou. Salve a página e mande para o Claude.${kept}`, { save: true });
    }, 1500);
  },
});

/** Guarda os códigos novos em "Meus cupons" e devolve a frase para o aviso. */
async function keepCodes(): Promise<string> {
  try {
    const before = await getMyCoupons('amazon');
    const fresh = promoCodes().filter((c) => !before.includes(c));
    if (!fresh.length) return '';
    await addMyCoupons('amazon', fresh.join(' '));
    return ` Guardei o código ${fresh.join(', ')} em "Meus cupons" para testar no pagamento.`;
  } catch {
    return '';
  }
}

const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}...` : s);

function toast(message: string, opts: { save?: boolean } = {}): void {
  document.querySelector('discount-beast-amazon-coupon')?.remove();
  const host = document.createElement('discount-beast-amazon-coupon');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; right: 16px; top: 72px; z-index: 2147483647; width: 280px; padding: 12px 14px;
        border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 13px/1.45 system-ui, sans-serif; }
      p { margin: 0; } strong { display: block; margin-bottom: 4px; }
      button.save { width: 100%; margin-top: 8px; padding: 8px; border: 0; border-radius: 8px; background: #2563eb;
        color: #fff; font: 600 13px system-ui, sans-serif; cursor: pointer; }
      .x { position: absolute; top: 4px; right: 8px; border: 0; background: none; color: #6b7280; font-size: 16px; cursor: pointer; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <strong>🦁 Discount Beast</strong>
      <p class="msg"></p>
      ${opts.save ? '<button class="save">Salvar página para o Claude</button>' : ''}
    </div>`;
  root.querySelector('.msg')!.textContent = message;
  root.querySelector('.x')!.addEventListener('click', () => host.remove());
  root.querySelector('.save')?.addEventListener('click', () => {
    const asin = location.pathname.match(ASIN)?.[1] ?? 'produto';
    downloadText(`discount-beast-amazon-${asin}-${Date.now()}.html`, cleanPageHtml());
    root.querySelector('.msg')!.textContent = 'Arquivo salvo em Downloads. Mande para o Claude no chat.';
  });
  document.body.append(host);
  // Aviso de sucesso some sozinho; o de "salvar página" fica até você fechar.
  if (!opts.save) setTimeout(() => host.remove(), 9000);
}
