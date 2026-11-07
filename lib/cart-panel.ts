import { browser } from 'wxt/browser';
import { mergeCodes } from './codes';
import { getCouponHistory, saveCouponResults } from './coupon-history';
import { cartKey, describeCart, profileCart, scoreCoupon, SKIP_BELOW, type CartInfo } from './coupon-match';
import { findBestCoupon, orderCandidates, type CartAdapter, type RunReport, type RunState } from './coupon-runner';
import { couponsFor, getCouponFeed } from './coupon-store';
import { getMyCoupons } from './my-coupons';
import { getPelandoCoupons } from './pelando-coupons';
import { formatBRL } from './price';
import type { StoreId } from './stores';

/**
 * Parte comum do testador de cupons, igual em todas as lojas: o cartão no canto
 * da tela com o botão "Testar cupons". Cada loja só entrega o seu adaptador
 * (lib/carts/<loja>.ts) e uma função que diz se a página atual é o carrinho.
 */
export interface CartPanelOptions {
  store: StoreId;
  /** Nome que aparece nas mensagens (ex.: "Netshoes"). */
  storeName: string;
  cart: CartAdapter;
  /** A página aberta agora é o carrinho? */
  isCart: () => boolean;
}

/** Liga o cartão. Lojas que trocam de página sem recarregar (SPA) são conferidas a cada 1,5 s. */
export function mountCartPanel(options: CartPanelOptions): void {
  let panel: Panel | null = null;
  setInterval(() => {
    const inCart = options.isCart();
    if (inCart && !panel) panel = createPanel(options);
    if (panel) panel.host.hidden = !inCart && !panel.busy;
  }, 1500);
}

interface Panel {
  host: HTMLElement;
  busy: boolean;
}

function createPanel({ store, storeName, cart }: CartPanelOptions): Panel {
  const host = document.createElement('discount-beast-panel');
  // Shadow DOM: o CSS da loja não bagunça o nosso cartão (e vice-versa).
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
  let key = '';
  /** true enquanto um teste interrompido por recarga continua: o load() inicial não mexe no cartão. */
  let resuming = false;
  /** Lê o carrinho (produtos + Total) e põe os cupons que combinam com ele na frente. */
  const load = async (updateMessage = true) => {
    const mine = await getMyCoupons(store);
    const coupons = couponsFor(await getCouponFeed(), store);
    // Ordem: os seus, depois os que você viu no Pelando, depois os do feed público (pela nota de compatibilidade).
    const pelando = await getPelandoCoupons(store);
    // Os que a própria loja sugere para este carrinho vêm antes de tudo.
    const suggested = cart.suggested?.() ?? [];
    const personal = mergeCodes(suggested, mergeCodes(mine, pelando));
    const codes = mergeCodes(personal, coupons.map((c) => c.code));
    if (resuming) return;
    const info: CartInfo = { items: cart.items?.() ?? [], subtotal: await cart.total() };
    const profile = profileCart(info, storeName);
    const byCode = new Map(coupons.map((c) => [c.code, c]));
    key = cartKey(info);
    const notes = new Map(codes.map((code) => [code, scoreCoupon(byCode.get(code) ?? { code }, profile)]));
    candidates = orderCandidates(codes, await getCouponHistory(store), Date.now(), undefined, {
      cartKey: key,
      score: (code) => notes.get(code)?.score ?? 0,
      keepFirst: personal,
      minScore: SKIP_BELOW,
    });
    console.info('[Discount Beast] carrinho lido:', info, 'ordem dos testes:', candidates.map((c) => `${c} (${notes.get(c)?.score ?? 0}: ${notes.get(c)?.why.join(', ') ?? ''})`));
    go.disabled = candidates.length === 0;
    if (!updateMessage) return;
    const mineCount = candidates.filter((c) => mine.includes(c)).length;
    const pelandoCount = candidates.filter((c) => pelando.includes(c) && !mine.includes(c) && !suggested.includes(c)).length;
    const suggestedCount = candidates.filter((c) => suggested.includes(c)).length;
    const parts = [suggestedCount && `${suggestedCount} sugeridos pela ${storeName}`, mineCount && `${mineCount} seus`, pelandoCount && `${pelandoCount} do Pelando`].filter(Boolean);
    const yours = parts.length ? ` (${parts.join(', ')})` : '';
    const seen = describeCart(profile);
    const read = info.items.length
      ? `Li no carrinho: ${info.items.length} ${info.items.length === 1 ? 'produto' : 'produtos'}${seen ? ` (${seen})` : ''}${info.subtotal !== null ? `, ${formatBRL(info.subtotal)}` : ''}. `
      : '';
    const skipped = [...notes.values()].filter((n) => n.score < SKIP_BELOW).length;
    const skippedText = skipped ? ` ${skipped} não servem para este carrinho (valor mínimo, só no app...).` : '';
    msg.textContent = candidates.length
      ? `${read}Vou testar ${candidates.length} cupons${yours}, os que combinam com ele primeiro.${skippedText} Leva uns segundos por cupom.`
      : `${read}Nenhum cupom novo para testar agora.${skippedText}`;
  };
  load().catch(() => (msg.textContent = 'Não consegui carregar a lista de cupons.'));
  // Se você adicionar um código em "Meus cupons" ou abrir o Pelando com o carrinho aberto, a contagem atualiza na hora.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.myCoupons || changes.pelandoCoupons) && !panel.busy) load().catch(() => {});
  });

  // Lojas que recarregam a página ao aplicar/tirar cupom (Terabyte): o teste fica salvo na aba
  // (sessionStorage) e continua sozinho quando a página volta.
  const runKey = `discount-beast-run-${store}`;
  const saveRun = (state: RunState) => {
    try { sessionStorage.setItem(runKey, JSON.stringify({ state, key, at: Date.now() })); } catch { /* sem sessionStorage */ }
  };
  const clearRun = () => { try { sessionStorage.removeItem(runKey); } catch { /* idem */ } };
  const savedRun = (): { state: RunState; key: string } | null => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(runKey) ?? 'null') as { state: RunState; key: string; at: number } | null;
      // Só continua se a página voltou logo (uma recarga leva segundos, não minutos).
      return saved && Date.now() - saved.at < 3 * 60_000 && saved.state?.phase !== 'done' ? saved : null;
    } catch {
      return null;
    }
  };

  const run = async (resume: { state: RunState; key: string } | null) => {
    panel.busy = true;
    go.disabled = true;
    list.hidden = true;
    try {
      if (resume) {
        resuming = true;
        key = resume.key;
        msg.textContent = 'A página recarregou; continuando o teste…';
      } else {
        // A página pode ter mudado desde que o cartão abriu (produto novo, quantidade): lê de novo.
        await load(false);
      }
      const report = await findBestCoupon(cart, candidates, ({ index, count, code }) => {
        msg.textContent = `Testando ${index} de ${count}: ${code}…`;
      }, { state: resume?.state, save: saveRun });
      clearRun();
      await saveCouponResults(store, report.results, key);
      showReport(report);
    } catch (error) {
      clearRun();
      console.warn('[Discount Beast]', error);
      msg.textContent = `Parei: ${(error as Error).message} A ${storeName} pode ter mudado a página.`;
    } finally {
      resuming = false;
      panel.busy = false;
      go.textContent = 'Testar de novo';
      await load(false).catch(() => {});
    }
  };
  go.addEventListener('click', () => { clearRun(); void run(null); });
  const pending = savedRun();
  if (pending) void run(pending);

  function showReport({ best, baseline, finalTotal, results }: RunReport) {
    msg.innerHTML = '';
    if (best) {
      const strong = document.createElement('strong');
      strong.textContent = best.code;
      msg.append('Apliquei ', strong, `. Você economiza ${formatBRL(best.saving ?? 0)}: o Total foi de ${formatBRL(baseline)} para ${formatBRL(finalTotal ?? best.total ?? baseline)}.`);
    } else {
      msg.textContent = 'Nenhum cupom baixou o Total deste carrinho.';
    }
    const label = { worked: '✓', rejected: '✗ recusado', ineligible: '✗ não vale p/ estes itens', unknown: '? sem resposta' } as const;
    list.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        if (r.code === best?.code) li.className = 'best';
        const saving = r.saving ?? 0;
        // Alguns cupons (ex.: 15% do adiClub da adidas) trocam as promoções do site e deixam o Total mais caro.
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
