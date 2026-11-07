import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBestCoupon, orderCandidates, type CartAdapter, type RunState, type TryStatus } from './coupon-runner.ts';
import { mergeCodes, parseCodes } from './codes.ts';
import { parseBRL } from './price.ts';

test('parseBRL lê preços da adidas', () => {
  assert.equal(parseBRL('R$1.094,95'), 1094.95);
  assert.equal(parseBRL('Total R$ 11,00'), 11);
  assert.equal(parseBRL('Grátis'), null);
});

test('orderCandidates: os que funcionaram primeiro, recusados recentes ficam de fora', () => {
  const now = Date.UTC(2026, 10, 6);
  const day = 24 * 60 * 60 * 1000;
  const coupons = ['A', 'B', 'C', 'D', 'E'];
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

test('parseCodes aceita vários formatos e ignora lixo', () => {
  assert.deepEqual(parseCodes(' adiclub10\nESQUENTA15, promo-2026; ab  esquenta15 R$50 '), ['ADICLUB10', 'ESQUENTA15', 'PROMO-2026']);
  assert.deepEqual(parseCodes(''), []);
  // Códigos pessoais da adidas são longos: REBR15_ + 5 blocos.
  assert.deepEqual(parseCodes('rebr15_fw2610-aaaa-bbbb-cccc-dddd'), ['REBR15_FW2610-AAAA-BBBB-CCCC-DDDD']);
});

test('Meus cupons vêm antes dos públicos, sem repetir', () => {
  const codes = mergeCodes(['MEU10', 'ACHADOS'], ['ACHADOS', 'PROMOBIT']);
  assert.deepEqual(codes, ['MEU10', 'ACHADOS', 'PROMOBIT']);
  assert.deepEqual(orderCandidates(codes, {}), ['MEU10', 'ACHADOS', 'PROMOBIT']);
});

test('Meus cupons entram mesmo se foram recusados há pouco', () => {
  const now = Date.now();
  const history = { MEU200: { status: 'rejected' as TryStatus, at: now - 60_000 }, PUB: { status: 'rejected' as TryStatus, at: now - 60_000 } };
  assert.deepEqual(orderCandidates(['MEU200', 'PUB', 'NOVO'], history, now, undefined, { keepFirst: ['MEU200'] }), ['MEU200', 'NOVO']);
});

test('findBestCoupon continua depois que a página recarrega no meio', async () => {
  // Loja que "recarrega" ao aplicar/tirar: o apply/remove muda o carrinho e o script morre (lança Reload).
  class Reload extends Error {}
  const prices: Record<string, number> = { A: 900, B: 800 };
  let applied: string | null = null;
  const cart: CartAdapter = {
    appliedCode: () => applied,
    total: async () => (applied ? prices[applied]! : 1000),
    apply: async (code) => { if (!prices[code]) return 'rejected'; applied = code; throw new Reload(); },
    remove: async () => { applied = null; throw new Reload(); },
    close: async () => {},
  };
  let saved: RunState | undefined;
  const save = (s: RunState) => { saved = JSON.parse(JSON.stringify(s)) as RunState; };
  let report;
  for (let loads = 0; loads < 20 && !report; loads++) {
    try { report = await findBestCoupon(cart, ['A', 'X', 'B'], () => {}, { state: saved, save }); } catch (e) { if (!(e instanceof Reload)) throw e; }
  }
  assert.ok(report);
  assert.deepEqual(report.results.map((r) => [r.code, r.status, r.saving]), [['A', 'worked', 100], ['X', 'rejected', undefined], ['B', 'worked', 200]]);
  assert.equal(report.best?.code, 'B');
  assert.equal(report.finalTotal, 800);
  assert.equal(applied, 'B');
});
