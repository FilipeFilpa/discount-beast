import type { CouponSource } from '../../lib/coupons.ts';
import type { StoreId } from '../../lib/stores.ts';

/** Cupom do jeito que sai de uma fonte, antes de juntar com as outras. */
export interface RawCoupon {
  code: string;
  title: string;
  discount: string;
  expiresAt: string | null;
}

/** Um site de cupons. Para adicionar outro, crie um arquivo nesta pasta e registre em collector/collect.ts. */
export interface Source {
  id: CouponSource;
  /** Endereço da página de cupons de cada loja. Loja sem endereço é ignorada. */
  urls: Partial<Record<StoreId, string>>;
  /** Extrai os cupons ativos do HTML da página. */
  parse(html: string, store: StoreId): RawCoupon[];
}
