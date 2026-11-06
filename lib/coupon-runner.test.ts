import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Coupon } from './coupons.ts';
import { findBestCoupon, orderCandidates, type CartAdapter, type TryStatus } from './coupon-runner.ts';
import { parseBRL } from './price.ts';

test('parseBRL lê preços da adidas', () => {
  assert.equal(parseBRL('R$1.094,95'), 1094.95);
  assert.equal(parseBRL('Total R$ 11,00'), 11);
  assert.equal(parseBRL('Grátis'), null);
});

const coupon = (code: string): Coupon => ({ store: 'adidas', code, title: '', discount: '', expiresAt: null, sources: ['promobit'], firstSeen: '' });

test('orderCandidates: os que funcionaram primeiro, recusados recentes ficam de fora', () => {
  const now = Date.UTC(2026, 10, 6);
  const day = 24 * 60 * 60 * 1000;
  const coupons = ['A', 'B', 'C', 'D', 'E'].map(coupon);
  const history = {
    B: { status: 'rejected' as const, at: now - day },
    C: { status: 'worked' as const, saving: 5, at: now - day },
    D: { status: 'rejected' as const, at: now - 4 * day },
    E: { status: 'worked' as const, saving: 20, at: now - day },
  };
  assert.deepEqual(orderCandidates(coupons, history, now), ['E', 'C', 'A', 'D']);
  assert.deepEqual(orderCandidates(coupons, history, now, 2), ['E', 'C']);
});

/** Carrinho de mentira: cada código válido tira uma porcentagem do Total. */
function fakeCart(base: number, valid: Record<string, number>, startWith: string | null = null) {
  let applied = startWith;
  const log: string[] = [];
  const cart: CartAdapter = {
    appliedCode: () => applied,
    total: async () => Math.round(base * (1 - (applied ? valid[applied] ?? 0 : 0)) * 100) / 100,
    apply: async (code): Promise<TryStatus> => {
      log.push(`apply ${code}`);
      if (applied) throw new Error('já tem cupom');
      if (!(code in valid)) return 'rejected';
      applied = code;
      return 'worked';
    },
    remove: async () => { log.push('remove'); applied = null; },
    close: async () => {},
  };
  return { cart, log, applied: () => applied };
}

test('findBestCoupon testa um por vez e deixa aplicado o que mais desconta', async () => {
  const { cart, applied } = fakeCart(1000, { ACHADOS: 0.1, ESQUENTA15: 0.15, FRETEGRATIS: 0 });
  const report = await findBestCoupon(cart, ['ACHADOS', 'XYZ', 'ESQUENTA15', 'FRETEGRATIS']);
  assert.equal(report.baseline, 1000);
  assert.equal(report.best?.code, 'ESQUENTA15');
  assert.equal(report.best?.saving, 150);
  assert.equal(report.finalTotal, 850);
  assert.equal(applied(), 'ESQUENTA15');
  assert.deepEqual(report.results.map((r) => r.status), ['worked', 'rejected', 'worked', 'worked']);
});

test('findBestCoupon tira o cupom que já estava aplicado e o inclui no teste', async () => {
  const { cart, applied } = fakeCart(1000, { ACHADOS: 0.1 }, 'ACHADOS');
  const report = await findBestCoupon(cart, ['XYZ']);
  assert.equal(report.baseline, 1000);
  assert.equal(report.best?.code, 'ACHADOS');
  assert.equal(applied(), 'ACHADOS');
});

test('findBestCoupon não aplica nada se nenhum cupom ajuda', async () => {
  const { cart, applied } = fakeCart(500, { FRETEGRATIS: 0 });
  const report = await findBestCoupon(cart, ['XYZ', 'FRETEGRATIS']);
  assert.equal(report.best, null);
  assert.equal(applied(), null);
});
