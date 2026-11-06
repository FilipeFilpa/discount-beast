/**
 * Lê o texto que você colou e devolve só os códigos, em MAIÚSCULAS e sem repetidos.
 * Aceita um por linha, separados por vírgula, ponto e vírgula ou espaço.
 * Ignora coisas que não parecem código (muito curtas, muito longas ou com símbolos estranhos).
 */
export function parseCodes(text: string): string[] {
  const codes = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => /^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(c));
  return [...new Set(codes)];
}

/** Junta os seus códigos (primeiro) com os públicos, sem repetir. */
export function mergeCodes(mine: string[], publicCodes: string[]): string[] {
  return [...new Set([...mine, ...publicCodes])];
}
