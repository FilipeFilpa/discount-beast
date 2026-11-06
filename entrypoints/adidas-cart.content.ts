import { adidasCart, isAdidasCart } from '@/lib/carts/adidas';
import { mergeCodes } from '@/lib/codes';
import { getCouponHistory, saveCouponResults } from '@/lib/coupon-history';
import { findBestCoupon, orderCandidates, type RunReport } from '@/lib/coupon-runner';
import { couponsFor, getCouponFeed } from '@/lib/coupon-store';
import { getMyCoupons } from '@/lib/my-coupons';
import { formatBRL } from '@/lib/price';

/**
 * No carrinho da adidas, mostra um cartão no canto da tela com o botão "Testar cupons".
 * O teste aplica cada código, anota o Total, tira e no fim deixa aplicado o melhor.
 */
export default defineContentScript({
  matches: ['https://adidas.com.br/*', 'https://*.adidas.com.br/*'],
  runAt: 'document_idle',
  main() {
    let panel: Panel | null = null;
    // A adidas troca de página sem recarregar, então conferimos de tempos em tempos.
    setInterval(() => {
      const inCart = isAdidasCart();
      if (inCart && !panel) panel = createPanel();
      if (panel) panel.host.hidden = !inCart && !panel.busy;
    }, 1500);
  },
});

interface Panel {
  host: HTMLElement;
  busy: boolean;
}

function createPanel(): Panel {
  const host = document.createElement('discount-beast-panel');
  // Shadow DOM: o CSS da adidas não bagunça o nosso cartão (e vice-versa).
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 280px;
        padding: 14px; border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 14px/1.45 system-ui, sans-serif; }
      h1 { margin: 0 0 6px; font-size: 15px; }
      p { margin: 0 0 10px; }
      button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #16a34a; color: #fff;
        font: 600 14px system-ui, sans-serif; cursor: pointer; }
      button:disabled { background: #9ca3af; cursor: default; }
      ul { margin: 0 0 10px; padding: 0; list-style: none; font-size: 12px; max-height: 160px; overflow-y: auto; }
      li { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #e5e7eb; }
      .best { color: #16a34a; font-weight: 600; }
      .x { position: absolute; top: 6px; right: 10px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <h1>🦁 Discount Beast</h1>
      <p class="msg">Procurando cupons…</p>
      <ul class="list" hidden></ul>
      <button class="go" disabled>Testar cupons</button>
    </div>`;
  document.body.append(host);

  const panel: Panel = { host, busy: false };
  const msg = root.querySelector<HTMLParagraphElement>('.msg')!;
  const list = root.querySelector<HTMLUListElement>('.list')!;
  const go = root.querySelector<HTMLButtonElement>('.go')!;
  root.querySelector('.x')!.addEventListener('click', () => host.remove());

  let candidates: string[] = [];
  const load = async (updateMessage = true) => {
    const mine = await getMyCoupons('adidas');
    const coupons = couponsFor(await getCouponFeed(), 'adidas');
    const codes = mergeCodes(mine, coupons.map((c) => c.code));
    candidates = orderCandidates(codes, await getCouponHistory('adidas'));
    go.disabled = candidates.length === 0;
    if (!updateMessage) return;
    const mineCount = candidates.filter((c) => mine.includes(c)).length;
    const yours = mineCount ? ` (${mineCount} seus)` : '';
    msg.textContent = candidates.length
      ? `${candidates.length} cupons para testar neste carrinho${yours}. Leva uns segundos por cupom.`
      : 'Nenhum cupom novo para testar agora.';
  };
  load().catch(() => (msg.textContent = 'Não consegui carregar a lista de cupons.'));
  // Se você adicionar um código em "Meus cupons" com o carrinho aberto, a contagem atualiza na hora.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.myCoupons && !panel.busy) load().catch(() => {});
  });

  go.addEventListener('click', async () => {
    panel.busy = true;
    go.disabled = true;
    list.hidden = true;
    try {
      const report = await findBestCoupon(adidasCart, candidates, ({ index, count, code }) => {
        msg.textContent = `Testando ${index} de ${count}: ${code}…`;
      });
      await saveCouponResults('adidas', report.results);
      showReport(report);
    } catch (error) {
      console.warn('[Discount Beast]', error);
      msg.textContent = `Parei: ${(error as Error).message} A adidas pode ter mudado a página.`;
    } finally {
      panel.busy = false;
      go.textContent = 'Testar de novo';
      await load(false).catch(() => {});
    }
  });

  function showReport({ best, baseline, finalTotal, results }: RunReport) {
    msg.innerHTML = '';
    if (best) {
      const strong = document.createElement('strong');
      strong.textContent = best.code;
      msg.append('Apliquei ', strong, `. Você economiza ${formatBRL(best.saving ?? 0)}: o Total foi de ${formatBRL(baseline)} para ${formatBRL(finalTotal ?? best.total ?? baseline)}.`);
    } else {
      msg.textContent = 'Nenhum cupom baixou o Total deste carrinho.';
    }
    const label = { worked: '✓', rejected: '✗ recusado', unknown: '? sem resposta' } as const;
    list.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        if (r.code === best?.code) li.className = 'best';
        const saving = r.saving ?? 0;
        // Alguns cupons (ex.: 15% do adiClub) trocam as promoções do site e deixam o Total mais caro.
        const worked = saving >= 0 ? `✓ −${formatBRL(saving)}` : `↑ +${formatBRL(-saving)} (mais caro)`;
        const text = r.status === 'worked' ? worked : label[r.status];
        li.append(Object.assign(document.createElement('span'), { textContent: r.code }), Object.assign(document.createElement('span'), { textContent: text }));
        return li;
      }),
    );
    list.hidden = results.length === 0;
  }

  return panel;
}
