import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartKey, parseRules, profileCart, scoreCoupon, SKIP_BELOW } from './coupon-match.ts';
import { orderCandidates } from './coupon-runner.ts';

// Carrinhos salvos pelo Filipe em 06/11/2026 (o mesmo tênis nas duas lojas).
const netshoes = profileCart({ items: [{ name: 'Tênis Adidas Adizero Drive Rc Masculino', seller: 'Netshoes', stamps: '' }], subtotal: 599.99 }, 'Netshoes');
const centauro = profileCart({ items: [{ name: 'Tênis Masculino adidas Adizero Drive RC', seller: 'Centauro' }], subtotal: 749.99 }, 'Centauro');

test('parseRules lê marca, categoria e valor mínimo', () => {
  const r = parseRules({ code: 'CREATINA21', title: 'R$21 OFF com cupom Netshoes em creatina Dark Lab 1 kg', terms: 'Válido apenas em compras a partir de R$70.' });
  assert.deepEqual(r.brands, ['dark lab']);
  assert.deepEqual(r.categories, ['suplementos']);
  assert.equal(r.minValue, 70);
  assert.equal(parseRules({ code: 'BLACK40', title: '', terms: 'Válido apenas em compras acima de R$399.' }).minValue, 399);
  assert.equal(parseRules({ code: 'BLACKAPP', title: 'Esquenta', terms: 'Válido apenas no App.' }).appOnly, true);
  assert.equal(parseRules({ code: 'SELLER15', terms: 'Aplicável em produtos vendidos e entregues por outros parceiros na Netshoes.' }).storeSellerOnly, false);
  assert.equal(parseRules({ code: 'VESTELAS', title: '15% OFF' }).gender, 'feminino');
});

test('profileCart reconhece marca, tipo e esporte pelo nome do produto', () => {
  assert.deepEqual([...netshoes.brands], ['adidas']);
  assert.deepEqual([...netshoes.categories].sort(), ['corrida', 'tênis']);
  assert.ok(netshoes.genders.has('masculino'));
  assert.equal(netshoes.allStoreSeller, true);
});

const score = (code: string, title = '', terms = '', cart = netshoes) => scoreCoupon({ code, title, terms }, cart).score;

test('cupom da marca do carrinho vem antes de cupom de outra marca', () => {
  assert.ok(score('ADIDAS20', 'adidas com +20% OFF') > score('QUERO10', 'Ganhe 10% em sua compra'));
  assert.ok(score('QUERO10', 'Ganhe 10% em sua compra') > score('NIKE30', 'Produtos da marca Nike com 30% de desconto'));
  assert.ok(score('SUPLE15', 'Ganhe 15% em suplementos') < 0);
  assert.ok(score('CARIUMA20', 'Tênis Cariuma com cupom de 20% OFF') < 0, 'tênis, mas de outra marca');
  assert.ok(score('INFANTIL20', 'Tênis infantis com 20% OFF', '', centauro) < score('MAIS15', '15% OFF em Tênis', '', centauro));
});

test('valor mínimo não atingido e "só no app" ficam de fora', () => {
  assert.ok(score('BLACK40', '', 'Válido apenas em compras acima de R$399.') > SKIP_BELOW);
  const small = profileCart({ items: [{ name: 'Meia Lupo' }], subtotal: 49.9 });
  assert.ok(scoreCoupon({ code: 'BLACK40', terms: 'Válido apenas em compras acima de R$399.' }, small).score < SKIP_BELOW);
  assert.ok(score('BLACKAPP', '', 'Válido apenas no App.', centauro) < SKIP_BELOW);
});

test('selo do cupom no produto vai para o topo', () => {
  const stamped = profileCart({ items: [{ name: 'Bota Acero', stamps: 'Cupom BOTA20' }], subtotal: 300 });
  assert.ok(scoreCoupon({ code: 'BOTA20', terms: 'Válido apenas nos produtos com o selo do cupom.' }, stamped).score >= 30);
});

test('carrinho sem produtos lidos: ninguém é punido por marca', () => {
  const unknown = profileCart({ items: [], subtotal: 500 });
  assert.equal(scoreCoupon({ code: 'NIKE30', title: 'Nike' }, unknown).score, 0);
});

test('cartKey muda quando os produtos mudam', () => {
  const a = cartKey({ items: [{ name: 'Tênis A' }, { name: 'Meia B' }], subtotal: 1 });
  assert.equal(a, cartKey({ items: [{ name: 'meia b' }, { name: 'tênis a' }], subtotal: 2 }));
  assert.notEqual(a, cartKey({ items: [{ name: 'Tênis A' }], subtotal: 1 }));
});

test('orderCandidates: seus primeiro, depois pela nota; "não vale para estes itens" volta em outro carrinho', () => {
  const now = Date.UTC(2026, 10, 6);
  const day = 24 * 60 * 60 * 1000;
  const notes: Record<string, number> = { LOW: -5, MID: 2, HIGH: 12, OUT: -40, MINE: -50, ELSE: 0, SAME: 20 };
  const history = {
    ELSE: { status: 'ineligible' as const, at: now - day, cart: 'outro' },
    SAME: { status: 'ineligible' as const, at: now - day, cart: 'este' },
  };
  const order = orderCandidates(['LOW', 'MID', 'HIGH', 'OUT', 'MINE', 'ELSE', 'SAME'], history, now, 15, {
    cartKey: 'este',
    score: (c) => notes[c] ?? 0,
    keepFirst: ['MINE'],
    minScore: -15,
  });
  assert.deepEqual(order, ['MINE', 'HIGH', 'MID', 'ELSE', 'LOW']);
});
