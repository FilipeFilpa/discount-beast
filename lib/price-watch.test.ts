import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCheck, cheapest, isDue, newWatch, watchId } from './price-watch.ts';
import type { PriceReport } from './price-compare.ts';
import type { StoreId } from './stores.ts';

const product = { name: 'Tênis Adizero Drive RC', brand: 'adidas', gtin: null, sku: 'IE7262', price: 699.99, url: 'https://www.netshoes.com.br/p/tenis-adizero-FBA-86EP-492?cor=preto#top' };

function report(store: StoreId, price: number | null, extra: Partial<PriceReport> = {}): PriceReport {
  return {
    store,
    storeName: store,
    searchUrl: `https://${store}/busca`,
    hits: price ? 5 : 0,
    match: price ? { title: `Adizero ${store}`, url: `https://${store}/p`, price, score: 1, why: 'mesmo modelo' } : null,
    ...extra,
  };
}

test('watchId ignora ?parâmetros, #âncora e www', () => {
  assert.equal(watchId(product.url), watchId('https://netshoes.com.br/p/tenis-adizero-FBA-86EP-492/'));
  assert.notEqual(watchId(product.url), watchId('https://www.netshoes.com.br/p/outro'));
});

test('newWatch parte do menor entre o preço da página e o que o Comparar achou', () => {
  const w = newWatch(product, 'netshoes', 'Netshoes', [report('centauro', 789.99), report('mercadolivre', 573.28)], 1);
  assert.equal(w.low?.price, 573.28);
  assert.equal(w.low?.store, 'mercadolivre');
  assert.equal(newWatch(product, 'netshoes', 'Netshoes', [], 1).low?.price, 699.99);
});

test('cheapest pula lojas sem resultado', () => {
  assert.equal(cheapest([report('amazon', null), report('magalu', 650)])?.store, 'magalu');
  assert.equal(cheapest([report('amazon', null)]), null);
});

test('applyCheck avisa só quando baixa do menor preço visto', () => {
  const w = newWatch(product, 'netshoes', 'Netshoes', [], 1);
  const same = applyCheck(w, [report('centauro', 699.99)], 2);
  assert.equal(same.drop, null);
  assert.equal(same.watch.lastCheckAt, 2);
  const cents = applyCheck(w, [report('centauro', 699.79)], 2);
  assert.equal(cents.drop, null, 'centavos não contam');
  const down = applyCheck(w, [report('centauro', 789.99), report('mercadolivre', 640)], 3);
  assert.deepEqual(down.drop && { from: down.drop.from, to: down.drop.to.price }, { from: 699.99, to: 640 });
  assert.equal(down.watch.low?.price, 640);
  // Mesmo preço de novo: não repete o aviso.
  assert.equal(applyCheck(down.watch, [report('mercadolivre', 640)], 4).drop, null);
  // Subiu: o menor visto continua 640, "last" mostra o de agora.
  const up = applyCheck(down.watch, [report('mercadolivre', 700)], 5);
  assert.equal(up.watch.low?.price, 640);
  assert.equal(up.watch.last?.price, 700);
});

test('applyCheck registra erro quando todas as lojas falharam', () => {
  const w = newWatch(product, 'netshoes', 'Netshoes', [], 1);
  const r = applyCheck(w, [report('amazon', null, { error: 'timeout' })], 2);
  assert.equal(r.watch.lastError, 'timeout');
  assert.equal(r.watch.low?.price, 699.99);
  assert.equal('lastError' in applyCheck(w, [report('amazon', 650)], 2).watch, false);
});

test('isDue: pula se o outro computador conferiu há pouco', () => {
  const w = { ...newWatch(product, 'netshoes', 'Netshoes'), lastCheckAt: 0 };
  assert.equal(isDue(w, 6 * 3600_000), true);
  assert.equal(isDue({ ...w, lastCheckAt: 1000 }, 1000 + 3600_000), false);
});
