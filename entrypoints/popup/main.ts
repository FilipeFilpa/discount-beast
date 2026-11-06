import { couponsFor, getCouponFeed } from '@/lib/coupon-store';
import type { Coupon } from '@/lib/coupons';
import { findStoreByHost, STORES } from '@/lib/stores';

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const couponsTitleEl = document.querySelector<HTMLHeadingElement>('#coupons-title')!;
const couponsEl = document.querySelector<HTMLUListElement>('#coupons')!;
const storesEl = document.querySelector<HTMLUListElement>('#stores')!;

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

  if (!current) return;
  couponsTitleEl.hidden = false;
  couponsTitleEl.textContent = 'Cupons encontrados';
  const coupons = couponsFor(await getCouponFeed(), current.id);
  couponsTitleEl.textContent = `Cupons encontrados (${coupons.length})`;
  couponsEl.replaceChildren(
    ...(coupons.length
      ? coupons.map(couponItem)
      : [Object.assign(document.createElement('li'), { textContent: 'Nenhum cupom público agora.' })]),
  );
}

render();
