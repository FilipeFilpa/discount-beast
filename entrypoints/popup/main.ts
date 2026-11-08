import { couponsFor, getCouponFeed } from '@/lib/coupon-store';
import type { Coupon } from '@/lib/coupons';
import { addMyCoupons, exportMyCoupons, getMyCoupons, importMyCoupons, removeMyCoupon } from '@/lib/my-coupons';
import { getPelandoCoupons } from '@/lib/pelando-coupons';
import { formatBRL } from '@/lib/price';
import { getWatches, isWatchChange, removeWatch, type Watch } from '@/lib/price-watch';
import { findStoreByHost, STORES, type StoreId } from '@/lib/stores';

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const couponsTitleEl = document.querySelector<HTMLHeadingElement>('#coupons-title')!;
const couponsEl = document.querySelector<HTMLUListElement>('#coupons')!;
const storesEl = document.querySelector<HTMLUListElement>('#stores')!;
const mineStoreEl = document.querySelector<HTMLSelectElement>('#mine-store')!;
const mineInputEl = document.querySelector<HTMLTextAreaElement>('#mine-input')!;
const mineAddEl = document.querySelector<HTMLButtonElement>('#mine-add')!;
const mineMsgEl = document.querySelector<HTMLParagraphElement>('#mine-msg')!;
const mineListEl = document.querySelector<HTMLUListElement>('#mine-list')!;
const backupCopyEl = document.querySelector<HTMLButtonElement>('#backup-copy')!;
const backupInputEl = document.querySelector<HTMLTextAreaElement>('#backup-input')!;
const backupImportEl = document.querySelector<HTMLButtonElement>('#backup-import')!;
const backupMsgEl = document.querySelector<HTMLParagraphElement>('#backup-msg')!;

const watchTitleEl = document.querySelector<HTMLHeadingElement>('#watch-title')!;
const watchMsgEl = document.querySelector<HTMLParagraphElement>('#watch-msg')!;
const watchListEl = document.querySelector<HTMLUListElement>('#watch-list')!;
const watchNowEl = document.querySelector<HTMLButtonElement>('#watch-now')!;

/** Lojas onde a extensão já testa cupons sozinha no carrinho. */
const AUTO_TEST: StoreId[] = ['amazon', 'adidas', 'netshoes', 'centauro', 'kabum', 'pichau', 'terabyte', 'magalu', 'mercadolivre'];

/** Uma linha da lista: código (clique para copiar), desconto e descrição. */
function couponItem(coupon: Coupon): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'coupon';

  const code = document.createElement('button');
  code.className = 'code';
  code.textContent = coupon.code;
  code.title = 'Clique para copiar';
  code.addEventListener('click', async () => {
    await navigator.clipboard.writeText(coupon.code);
    code.textContent = 'Copiado!';
    setTimeout(() => (code.textContent = coupon.code), 1200);
  });

  const info = document.createElement('span');
  info.className = 'info';
  const extra = coupon.sources.length > 1 ? ` · ${coupon.sources.length} sites` : '';
  info.textContent = `${coupon.discount || 'Desconto'}${extra} · ${coupon.title}`;

  li.append(code, info);
  return li;
}

/** "Meus cupons": mostra os códigos salvos da loja escolhida, com um × para apagar. */
async function renderMine(message = '') {
  const store = mineStoreEl.value as StoreId;
  const codes = await getMyCoupons(store);
  const auto = AUTO_TEST.includes(store)
    ? 'Vou testar esses primeiro quando você clicar em "Testar cupons" no carrinho.'
    : 'Por enquanto só guardo; o teste automático nesta loja vem depois.';
  mineMsgEl.textContent = message || (codes.length ? auto : '');
  mineListEl.replaceChildren(
    ...codes.map((code) => {
      const li = document.createElement('li');
      li.className = 'coupon';
      const label = Object.assign(document.createElement('span'), { className: 'code', textContent: code });
      const remove = Object.assign(document.createElement('button'), { className: 'remove', textContent: '×', title: 'Apagar' });
      remove.addEventListener('click', async () => {
        await removeMyCoupon(store, code);
        await renderMine();
      });
      li.append(label, remove);
      return li;
    }),
  );
}

function setupMine(current: StoreId | undefined) {
  mineStoreEl.replaceChildren(
    ...STORES.map((s) => Object.assign(document.createElement('option'), { value: s.id, textContent: s.name })),
  );
  mineStoreEl.value = current ?? 'adidas';
  mineStoreEl.addEventListener('change', () => renderMine());
  mineAddEl.addEventListener('click', async () => {
    const store = mineStoreEl.value as StoreId;
    const before = (await getMyCoupons(store)).length;
    const after = (await addMyCoupons(store, mineInputEl.value)).length;
    const added = after - before;
    mineInputEl.value = '';
    await renderMine(added ? `${added === 1 ? '1 código salvo' : `${added} códigos salvos`}.` : 'Não achei nenhum código novo no texto.');
  });
  backupCopyEl.addEventListener('click', async () => {
    await navigator.clipboard.writeText(await exportMyCoupons());
    backupMsgEl.textContent = 'Backup copiado. Cole no outro Chrome, aqui mesmo.';
  });
  backupImportEl.addEventListener('click', async () => {
    const added = await importMyCoupons(backupInputEl.value);
    backupMsgEl.textContent = added === null ? 'Isso não parece um backup do Discount Beast.' : `${added === 1 ? "1 código novo importado" : `${added} códigos novos importados`}.`;
    if (added !== null) backupInputEl.value = '';
    await renderMine();
  });
  return renderMine();
}

/** "há 3 h", "há 2 dias". */
function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

function watchItem(watch: Watch): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'watch-item';
  const text = Object.assign(document.createElement('div'), { className: 'text' });
  const best = watch.low;
  const link = Object.assign(document.createElement('a'), { href: best?.url ?? watch.product.url, target: '_blank', textContent: watch.product.name, title: watch.product.name });
  const low = Object.assign(document.createElement('div'), {
    className: 'low',
    textContent: best ? `Menor visto: ${formatBRL(best.price)} na ${best.storeName}` : 'Ainda sem preço',
  });
  const now = watch.last ? `agora ${formatBRL(watch.last.price)} na ${watch.last.storeName} · ` : '';
  const meta = Object.assign(document.createElement('div'), {
    className: 'meta',
    textContent: watch.lastCheckAt ? `${now}conferido ${ago(watch.lastCheckAt)}${watch.lastError ? ' (erro)' : ''}` : 'conferindo pela primeira vez…',
  });
  text.append(link, low, meta);
  const remove = Object.assign(document.createElement('button'), { className: 'remove', textContent: '×', title: 'Parar de avisar' });
  remove.addEventListener('click', async () => {
    await removeWatch(watch.id);
    await renderWatches();
  });
  li.append(text, remove);
  return li;
}

/** "Vigiando preços": produtos marcados no cartão "Comparar preço". */
async function renderWatches() {
  const watches = await getWatches();
  watchTitleEl.textContent = `Vigiando preços (${watches.length})`;
  watchNowEl.hidden = !watches.length;
  if (!watchNowEl.disabled) {
    watchMsgEl.textContent = watches.length
      ? 'Confiro todas as lojas a cada 6 h (com o Chrome aberto) e aviso quando baixar do menor preço visto.'
      : 'Na página de um produto, clique em "🔔 Avisar quando baixar" no cartão de preço.';
  }
  watchListEl.replaceChildren(...watches.map(watchItem));
}

function setupWatches() {
  watchNowEl.addEventListener('click', async () => {
    watchNowEl.disabled = true;
    watchMsgEl.textContent = 'Conferindo numa janela minimizada… (uns 20 s por produto; pode fechar o popup)';
    const res = (await browser.runtime.sendMessage({ type: 'watch-check-now' }).catch((e) => ({ error: String(e) }))) as { count?: number; error?: string };
    watchNowEl.disabled = false;
    await renderWatches();
    watchMsgEl.textContent = res?.error ? `Erro: ${res.error}` : `Pronto: ${res?.count ?? 0} produto(s) conferido(s).`;
  });
  // A conferência termina em segundo plano: atualiza a lista sozinha.
  browser.storage.onChanged.addListener((changes, area) => {
    if (isWatchChange(changes, area)) renderWatches();
  });
  return renderWatches();
}

async function render() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? new URL(tab.url).hostname : '';
  const current = findStoreByHost(host);

  statusEl.textContent = current
    ? `Você está na ${current.name}.`
    : 'Abra uma das lojas abaixo para eu procurar cupons.';
  statusEl.classList.toggle('ok', Boolean(current));

  storesEl.replaceChildren(
    ...STORES.map((store) => {
      const li = document.createElement('li');
      li.textContent = store.name;
      if (store.id === current?.id) li.classList.add('active');
      return li;
    }),
  );

  await Promise.all([setupMine(current?.id), setupWatches()]);

  if (!current) return;
  couponsTitleEl.hidden = false;
  couponsTitleEl.textContent = 'Cupons encontrados';
  const feed = couponsFor(await getCouponFeed(), current.id);
  // Códigos que você viu no Pelando e que o feed público não tem.
  const fromPelando: Coupon[] = (await getPelandoCoupons(current.id))
    .filter((code) => !feed.some((c) => c.code === code))
    .map((code) => ({ store: current.id, code, title: 'Visto por você no Pelando', discount: '', expiresAt: null, sources: [], firstSeen: '' }));
  const coupons = [...fromPelando, ...feed];
  couponsTitleEl.textContent = `Cupons encontrados (${coupons.length})`;
  couponsEl.replaceChildren(
    ...(coupons.length
      ? coupons.map(couponItem)
      : [Object.assign(document.createElement('li'), { textContent: 'Nenhum cupom público agora.' })]),
  );
}

render();
