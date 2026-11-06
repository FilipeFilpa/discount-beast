/** Funções pequenas usadas por todas as fontes de cupom. */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Baixa uma página HTML. Tenta de novo uma vez se der erro de rede ou 5xx. */
export async function fetchHtml(url: string, attempts = 2): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return await res.text();
      lastError = new Error(`HTTP ${res.status} em ${url}`);
      if (res.status < 500) break; // 403/404 não melhoram tentando de novo
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw lastError;
}

/** Troca entidades HTML (&amp;, &#233;, &nbsp;) pelo caractere de verdade e limpa espaços. */
export function decodeHtml(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Códigos que os sites usam para dizer "o desconto já vem no link".
 * Não são cupons de verdade, então não adianta digitar no carrinho.
 */
const FAKE_CODE =
  /NOLINK|JAATIVO|AUTOMATICO|^(PEGUE|APROVEITE|RESGATE|GANHE|CLIQUE|ACESSE)(AQUI|EGANHE)$|^(SEMCUPOM|SEMCODIGO|DIRETONOLINK)$/;

/** Normaliza o código e devolve null se ele não parece um cupom digitável. */
export function cleanCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code)) return null; // vazio, com espaço, etc.
  if (FAKE_CODE.test(code)) return null;
  return code;
}

/** Tenta achar o desconto no texto: "10%" vira "10% OFF", "R$ 50" vira "R$ 50 OFF". */
export function discountFrom(text: string): string {
  const percent = text.match(/(\d{1,2})\s?%/);
  if (percent) return `${percent[1]}% OFF`;
  const money = text.match(/R\$\s?(\d[\d.]*(?:,\d{2})?)/);
  if (money) return `R$ ${money[1]} OFF`;
  return '';
}

/** Lê o valor de um atributo dentro de uma tag HTML. */
export function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeHtml(match[1]!) : null;
}

/** Converte uma data vinda do site para ISO 8601, ou null se for inválida. */
export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  // Promobit usa "-0300"; o Date do JavaScript entende melhor "-03:00".
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
