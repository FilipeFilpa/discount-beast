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
