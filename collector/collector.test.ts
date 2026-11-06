import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFeed, mergeCoupons } from './merge.ts';
import { cuponomia } from './sources/cuponomia.ts';
import { meliuz } from './sources/meliuz.ts';
import { promobit } from './sources/promobit.ts';
import { cleanCode, decodeHtml, discountFrom, toIso } from './util.ts';

test('cleanCode aceita códigos reais e recusa os de "desconto no link"', () => {
  assert.equal(cleanCode(' achados '), 'ACHADOS');
  assert.equal(cleanCode('CASAAQUI'), 'CASAAQUI');
  for (const fake of ['DESCONTONOLINK', 'PEGUEAQUI', 'ACESSEEGANHE', 'CUPOMAUTOMATICO', 'desconto direto no link', '', 'AB']) {
    assert.equal(cleanCode(fake), null, fake);
  }
});

test('discountFrom, decodeHtml e toIso', () => {
  assert.equal(discountFrom('Cupom adidas com 10% OFF'), '10% OFF');
  assert.equal(discountFrom('economize R$ 50 em compras'), 'R$ 50 OFF');
  assert.equal(discountFrom('Frete grátis'), '');
  assert.equal(decodeHtml('at&#233; 15% &amp; <b>mais</b>'), 'até 15% & mais');
  assert.equal(toIso('2026-12-31T20:59:59-0300'), '2026-12-31T23:59:59.000Z');
  assert.equal(toIso(null), null);
});

test('promobit lê o __NEXT_DATA__ e ignora vencidos, outras lojas e códigos falsos', () => {
  const coupons = [
    { couponCode: 'ACHADOS', couponTitle: '10% OFF na adidas', couponDiscountShort: '10% OFF', couponStatusName: 'APPROVED', couponUntil: '2026-12-31T20:59:59-0300', storeSlug: 'adidas', visibility: 'ALL' },
    { couponCode: 'CORRE10', couponTitle: 'velho', couponStatusName: 'FINISHED', storeSlug: 'adidas', visibility: 'ALL' },
    { couponCode: 'DESCONTONOLINK', couponTitle: 'link', couponStatusName: 'APPROVED', storeSlug: 'adidas', visibility: 'ALL' },
    { couponCode: 'ZATTINI30', couponTitle: 'outra loja', couponStatusName: 'APPROVED', storeSlug: 'zattini', visibility: 'ALL' },
  ];
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serverCoupons: { coupons } } } })}</script>`;
  assert.deepEqual(promobit.parse(html, 'adidas'), [
    { code: 'ACHADOS', title: '10% OFF na adidas', discount: '10% OFF', expiresAt: '2026-12-31T23:59:59.000Z' },
  ]);
  assert.throws(() => promobit.parse('<html></html>', 'adidas'), /__NEXT_DATA__/);
});

test('meliuz lê data-offer-code', () => {
  const html = `
    <div class="cpn-layout offer-cpn" data-offer-id="1" data-offer-code="ACHADOS" data-offer-title="Cupom de desconto Adidas com 10% OFF" data-component="x">
    <div class="cpn-layout offer-cpn" data-offer-id="2" data-offer-code="" data-offer-title="Oferta sem código">
    <li data-offer-id="3"><p>Expirado</p></li>`;
  assert.deepEqual(meliuz.parse(html, 'adidas'), [
    { code: 'ACHADOS', title: 'Cupom de desconto Adidas com 10% OFF', discount: '10% OFF', expiresAt: null },
  ]);
});

test('cuponomia lê só os itens do tipo código da loja certa', () => {
  const item = (type: string, slug: string, code: string) =>
    `<li class="item scroll-item" id="1" data-type="${type}" data-store-slug="${slug}"><div class="smallTitle"><span class="smallTitle-content js-couponSmallText">10% OFF </span></div>` +
    `<h3 class="js-itemTitle" data-event="x">Use cupom adidas e receba 10% OFF </h3><span class="item-code-link js-itemCode">${code}</span></li>`;
  const html = `<ul>${item('code', 'adidas', 'ACHADOS')}${item('offer', 'adidas', '')}${item('code', 'nike', 'NIKE10')}</ul>`;
  assert.deepEqual(cuponomia.parse(html, 'adidas'), [
    { code: 'ACHADOS', title: 'Use cupom adidas e receba 10% OFF', discount: '10% OFF', expiresAt: null },
  ]);
});

test('mergeCoupons junta fontes, guarda firstSeen, remove vencidos e reaproveita fonte que falhou', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const previous = [
    { store: 'adidas' as const, code: 'ACHADOS', title: 'velho', discount: '10% OFF', expiresAt: null, sources: ['meliuz' as const], firstSeen: '2026-11-01T00:00:00.000Z' },
    { store: 'netshoes' as const, code: 'NETS20', title: '20%', discount: '20% OFF', expiresAt: null, sources: ['meliuz' as const], firstSeen: '2026-11-02T00:00:00.000Z' },
  ];
  const merged = mergeCoupons(
    [
      { source: 'promobit', store: 'adidas', coupons: [
        { code: 'ACHADOS', title: '10% OFF', discount: '10% OFF', expiresAt: null },
        { code: 'VENCIDO', title: 'x', discount: '', expiresAt: '2026-11-05T00:00:00.000Z' },
      ] },
      { source: 'meliuz', store: 'adidas', coupons: [{ code: 'ACHADOS', title: 'outro título', discount: '', expiresAt: '2026-12-31T00:00:00.000Z' }] },
      { source: 'meliuz', store: 'netshoes', coupons: [], error: 'HTTP 403' },
    ],
    previous,
    now,
  );
  assert.deepEqual(merged, [
    { store: 'adidas', code: 'ACHADOS', title: '10% OFF', discount: '10% OFF', expiresAt: '2026-12-31T00:00:00.000Z', sources: ['meliuz', 'promobit'], firstSeen: '2026-11-01T00:00:00.000Z' },
    { store: 'netshoes', code: 'NETS20', title: '20%', discount: '20% OFF', expiresAt: null, sources: ['meliuz'], firstSeen: '2026-11-02T00:00:00.000Z' },
  ]);

  const feed = buildFeed(merged, { version: 1, updatedAt: '2026-11-01T00:00:00.000Z', coupons: merged }, now);
  assert.equal(feed.updatedAt, '2026-11-01T00:00:00.000Z', 'sem mudança, updatedAt fica igual');
  assert.equal(buildFeed([], null, now).updatedAt, now.toISOString());
});
