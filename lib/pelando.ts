import { cleanCode } from '../collector/util.ts';
import type { StoreId } from './stores.ts';

/**
 * Leitor das páginas de cupons do Pelando.
 * Só roda quando VOCÊ abre o Pelando no seu Chrome: a extensão lê o que já está na tela,
 * sem robô e sem contornar a proteção do site.
 */

/** Pedaços da URL do Pelando que indicam cada loja (ex.: /cupons-de-descontos/adidas). */
const STORE_SLUGS: Record<StoreId, string[]> = {
  amazon: ['amazon'],
  mercadolivre: ['mercado-livre', 'mercadolivre'],
  adidas: ['adidas'],
  netshoes: ['netshoes'],
  centauro: ['centauro'],
  magalu: ['magazine-luiza', 'magalu', 'magazineluiza'],
};

/** Descobre a loja pela URL da página de cupons. Ex.: "/cupons-de-descontos/adidas" → "adidas". */
export function storeFromPelandoPath(pathname: string): StoreId | undefined {
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  if (!parts.some((p) => p.startsWith('cupo'))) return undefined; // só páginas de cupons
  const entry = Object.entries(STORE_SLUGS).find(([, slugs]) => parts.some((p) => slugs.includes(p)));
  return entry?.[0] as StoreId | undefined;
}

/** Nomes de campo que costumam guardar o código do cupom nos dados da página. */
const CODE_KEY = /^(code|couponcode|coupon_code|vouchercode|voucher_code|promocode|promo_code|discountcode)$/i;

/**
 * Outro campo do mesmo objeto que mostra que é um cupom (e não, por exemplo, o código de um erro
 * ou do idioma "pt-BR").
 */
const COUPON_SIBLING = /title|titulo|description|descricao|discount|desconto|expir|valid|store|loja|coupon|cupom/i;

/** Procura códigos dentro dos dados JSON que o site manda junto com a página. */
export function codesFromJson(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 40 || value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) codesFromJson(item, out, depth + 1);
    return out;
  }
  const keys = Object.keys(value);
  const looksLikeCoupon = keys.some((k) => COUPON_SIBLING.test(k) && !CODE_KEY.test(k));
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && CODE_KEY.test(key)) {
      const code = looksLikeCoupon ? cleanCode(child) : null;
      if (code && /[A-Z]/.test(code)) out.add(code);
    } else {
      codesFromJson(child, out, depth + 1);
    }
  }
  return out;
}

/**
 * Lê um texto que aparece na tela como código (ex.: "ADIDAS15").
 * Precisa estar em MAIÚSCULAS e ter pelo menos uma letra, para não pegar "10%" ou palavras comuns.
 */
export function codeFromText(text: string | null | undefined): string | null {
  const raw = (text ?? '').trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(raw) || !/[A-Z]/.test(raw)) return null;
  return cleanCode(raw);
}

/** Um código que o Pelando mostrou, com a data em que você o viu. */
export interface SeenCode {
  code: string;
  seenAt: number;
}

/** Códigos que você não vê no Pelando há mais tempo que isso saem da lista. */
export const PELANDO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Junta os códigos novos com os já guardados (novos atualizam a data) e descarta os velhos. */
export function mergeSeen(saved: SeenCode[], found: string[], now = Date.now()): SeenCode[] {
  const byCode = new Map(saved.map((s) => [s.code, s]));
  for (const code of found) byCode.set(code, { code, seenAt: now });
  return [...byCode.values()]
    .filter((s) => now - s.seenAt < PELANDO_MAX_AGE_MS)
    .sort((a, b) => b.seenAt - a.seenAt);
}
