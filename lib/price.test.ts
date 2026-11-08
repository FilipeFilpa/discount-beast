import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainPrice } from './price.ts';

test('plainPrice pega o preço à vista do item e ignora parcela, cupom e economia', () => {
  assert.equal(plainPrice('Smart TV 55" Samsung R$ 4.999,00 R$ 4.749,05 no Pix ou 10x de R$ 499,90 sem juros'), 4749.05);
  assert.equal(plainPrice('Cupom R$ 350,00 OFF Economize R$ 250,00 R$ 2.999,00'), 2999);
  assert.equal(plainPrice('Frete: R$ 19,90 Notebook R$ 3.499,90'), 3499.9);
  assert.equal(plainPrice('Cupom: - R$ 350,00 R$ 1.200,00'), 1200);
  assert.equal(plainPrice('sem preço'), null);
});
