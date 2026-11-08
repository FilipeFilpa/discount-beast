/** Lê um preço em reais ("R$1.094,95", "R$ 11,00") e devolve o número (1094.95). */
export function parseBRL(text: string): number | null {
  const match = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (!match?.[1]) return null;
  return Number(match[1].replace(/\./g, '').replace(',', '.'));
}

/** Mostra um número como preço em reais: 1094.95 → "R$ 1.094,95". */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Preço à vista de um item, lendo o texto do bloco dele (ex.: o item na sacola):
 * "R$ 44.999,00 R$ 42.749,05 no Pix ou 10x de R$ 4.499,90" → 42749.05.
 * Fica com o menor R$, ignorando parcela ("10x de R$"), economia/desconto/cupom/frete.
 */
export function plainPrice(text: string): number | null {
  const flat = text.replace(/\s+/g, ' ');
  let best: number | null = null;
  for (const m of flat.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/g)) {
    const before = flat.slice(Math.max(0, m.index - 24), m.index);
    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 6);
    if (/\d+\s*x\s*(de\s*)?$/i.test(before) || /(economi\w*|desconto|cupom|frete|off|-)\s*:?\s*(de\s*)?$/i.test(before) || /^\s*off/i.test(after)) continue;
    const value = Number(`${m[1]!.replace(/\./g, '')}.${m[2]}`);
    if (value > 0 && (best === null || value < best)) best = value;
  }
  return best;
}
