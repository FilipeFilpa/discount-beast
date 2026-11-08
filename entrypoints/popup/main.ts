import { couponsFor, getCouponFeed } from '@/lib/coupon-store';
import type { Coupon } from '@/lib/coupons';
import { addMyCoupons, getMyCoupons, removeMyCoupon } from '@/lib/my-coupons';
import { getPelandoCoupons } from '@/lib/pelando-coupons';
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

/** Lojas onde a extensão já testa cupons sozinha no carrinho. */
const AUTO_TEST: StoreId[] = ['adidas', 'netshoes', 'centauro', 'kabum', 'pichau', 'terabyte', 'magalu'];

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
  return renderMine();
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

  await setupMine(current?.id);

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
