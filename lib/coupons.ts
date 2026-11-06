import type { StoreId } from './stores.ts';

/** De onde o cupom veio. */
export type CouponSource = 'promobit' | 'meliuz' | 'cuponomia' | 'cuponation' | 'cuponeria';

/** Um cupom público encontrado pelo coletor (collector/collect.ts). */
export interface Coupon {
  store: StoreId;
  /** Código para digitar no carrinho, sempre em MAIÚSCULAS. */
  code: string;
  /** Descrição curta, do jeito que o site de cupons escreveu. */
  title: string;
  /** Ex.: "10% OFF", "R$ 50 OFF". Vazio quando o site não informa. */
  discount: string;
  /** Validade em ISO 8601, ou null quando o site não informa. */
  expiresAt: string | null;
  /**
   * Regras do cupom, quando o site informa (ex.: "Válido apenas nos produtos com o selo do cupom.").
   * Ajuda a entender por que um código foi recusado no carrinho.
   */
  terms?: string;
  /** Sites onde o cupom apareceu. Quanto mais fontes, mais confiável. */
  sources: CouponSource[];
  /** Primeira vez que o coletor viu o cupom (ISO 8601). */
  firstSeen: string;
}

/** Formato do arquivo data/coupons.json. */
export interface CouponFeed {
  version: 1;
  /** Última vez que a lista de cupons mudou (ISO 8601). */
  updatedAt: string;
  coupons: Coupon[];
}

/** Endereço público do JSON que o GitHub Actions atualiza 2x por dia. */
export const COUPONS_URL =
  'https://raw.githubusercontent.com/FilipeFilpa/discount-beast/main/data/coupons.json';
