import { activateCouponsOnPage, couponButtonsToActivate, nextCouponsPageUrl } from '@/lib/ml-activate';

/**
 * Página "Cupons" do Mercado Livre (www.mercadolivre.com.br/cupons...). Os cupons de lá ficam ligados
 * à conta: cada cartão tem o botão "Aplicar" (ativa) ou "Conferir" (já ativado). Um cartão no canto
 * ativa todos os da página e, se o Filipe quiser, segue para as próximas páginas sozinho.
 * O andamento entre páginas fica no sessionStorage (só nesta aba).
 */
const RUN_KEY = 'discount-beast-ml-activate';

interface Run { pagesLeft: number; activated: number; failed: number; at: number }

function readRun(): Run | null {
  try {
    const run = JSON.parse(sessionStorage.getItem(RUN_KEY) ?? 'null') as Run | null;
    // Uma execução parada há mais de 5 min não continua sozinha.
    return run && Date.now() - run.at < 5 * 60_000 ? run : null;
  } catch { return null; }
}
function saveRun(run: Run | null): void {
  try {
    if (run) sessionStorage.setItem(RUN_KEY, JSON.stringify({ ...run, at: Date.now() }));
    else sessionStorage.removeItem(RUN_KEY);
  } catch { /* sem sessionStorage */ }
}

export default defineContentScript({
  matches: ['https://www.mercadolivre.com.br/cupons*'],
  runAt: 'document_idle',
  main() {
    // A janela de cupons do carrinho (/cupons/cart) é outra coisa: lá o testador do carrinho cuida.
    if (/^\/cupons\/cart/.test(location.pathname) || window.top !== window) return;
    let card: Card | null = null; // eslint-disable-line prefer-const
    const timer = setInterval(() => {
      if (!document.querySelector('.coupon-card')) return;
      clearInterval(timer);
      card = mountCard();
      const run = readRun();
      if (run) void go(card, run);
    }, 1000);
  },
});

interface Card { msg: HTMLElement; button: HTMLButtonElement; pages: HTMLInputElement; refresh(): void }

function mountCard(): Card {
  const host = document.createElement('discount-beast-panel');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 280px; padding: 14px;
        border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 14px/1.45 system-ui, sans-serif; }
      h1 { margin: 0 0 6px; font-size: 15px; } p { margin: 0 0 10px; }
      label { display: block; margin: 0 0 10px; font-size: 13px; }
      input { width: 52px; margin-left: 4px; }
      button.go { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #16a34a; color: #fff;
        font: 600 14px system-ui, sans-serif; cursor: pointer; }
      button.go:disabled { background: #9ca3af; cursor: default; }
      .x { position: absolute; top: 6px; right: 10px; border: 0; background: none; color: #6b7280; font-size: 16px; cursor: pointer; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <h1>🦁 Discount Beast</h1>
      <p class="msg"></p>
      <label>Páginas para percorrer:<input class="pages" type="number" min="1" max="100" value="1"></label>
      <button class="go">Ativar cupons</button>
    </div>`;
  document.body.append(host);
  const card: Card = {
    msg: root.querySelector('.msg')!,
    button: root.querySelector('.go')!,
    pages: root.querySelector('.pages')!,
    refresh() {
      const n = couponButtonsToActivate().length;
      card.msg.textContent = n ? `${n} cupons para ativar nesta página.` : 'Todos os cupons desta página já estão ativados.';
    },
  };
  root.querySelector('.x')!.addEventListener('click', () => { saveRun(null); host.remove(); });
  card.button.addEventListener('click', () => {
    const pages = Math.max(1, Math.min(100, Number(card.pages.value) || 1));
    void go(card, { pagesLeft: pages, activated: 0, failed: 0, at: Date.now() });
  });
  card.refresh();
  return card;
}

async function go(card: Card, run: Run): Promise<void> {
  card.button.disabled = true;
  card.pages.disabled = true;
  saveRun(run);
  const result = await activateCouponsOnPage((done, total) => {
    card.msg.textContent = `Ativando ${done} de ${total} nesta página... (${run.activated + done} no total)`;
    saveRun(run);
  });
  run.activated += result.activated;
  run.failed += result.failed;
  run.pagesLeft -= 1;
  const next = nextCouponsPageUrl();
  if (run.pagesLeft > 0 && next) {
    saveRun(run);
    card.msg.textContent = `${run.activated} ativados até agora. Indo para a próxima página...`;
    await new Promise((r) => setTimeout(r, 1500));
    location.href = next;
    return;
  }
  saveRun(null);
  card.button.disabled = false;
  card.pages.disabled = false;
  card.msg.textContent = `Pronto: ${run.activated} cupons ativados${run.failed ? `, ${run.failed} sem resposta` : ''}. ` +
    'O Mercado Livre usa os ativados sozinho no checkout, quando o produto se encaixa.';
}
