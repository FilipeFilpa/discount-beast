import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeFromText, codesFromJson, mergeSeen, PELANDO_MAX_AGE_MS, storeFromPelandoPath } from './pelando.ts';

test('storeFromPelandoPath reconhece a loja pela URL de cupons', () => {
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/adidas'), 'adidas');
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/magazine-luiza'), 'magalu');
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/aliexpress'), 'aliexpress');
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/shopee'), 'shopee');
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/mercado-livre/'), 'mercadolivre');
  assert.equal(storeFromPelandoPath('/d/tenis-adidas-123'), undefined); // não é página de cupons
  assert.equal(storeFromPelandoPath('/cupons-de-descontos/shein'), undefined);
});

test('codesFromJson só pega "code" de objetos que parecem cupom', () => {
  const data = {
    props: {
      locale: { code: 'pt-BR' },
      error: { code: 'NOT_FOUND', status: 404 },
      coupons: [
        { title: '10% OFF', code: 'achados' },
        { couponCode: 'PROMOBIT', discount: '10%' },
        { title: 'Desconto no link', code: 'NOLINK' },
        { title: 'Número', code: '12345' },
      ],
    },
  };
  assert.deepEqual([...codesFromJson(data)].sort(), ['ACHADOS', 'PROMOBIT']);
});

test('codeFromText aceita só textos em maiúsculas com letra', () => {
  assert.equal(codeFromText(' ADIDAS15 '), 'ADIDAS15');
  assert.equal(codeFromText('Pegar cupom'), null);
  assert.equal(codeFromText('2024'), null);
  assert.equal(codeFromText('PEGUEAQUI'), null);
});

test('mergeSeen atualiza a data dos revistos e apaga os velhos', () => {
  const now = Date.UTC(2026, 10, 6);
  const saved = [
    { code: 'A', seenAt: now - 1000 },
    { code: 'OLD', seenAt: now - PELANDO_MAX_AGE_MS - 1 },
  ];
  assert.deepEqual(mergeSeen(saved, ['B', 'A'], now), [
    { code: 'A', seenAt: now },
    { code: 'B', seenAt: now },
  ]);
});
