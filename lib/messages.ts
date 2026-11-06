import type { StoreId } from './stores';
import type { PageProduct } from './product-match';
import type { PriceReport } from './price-compare';

/** Mensagem que o content script envia quando o usuário abre uma página de loja. */
export interface StoreVisitMessage {
  type: 'store-visit';
  storeId: StoreId;
  url: string;
}

/** O cartão "Comparar preço" pede ao background para buscar o produto nas outras lojas. */
export interface ComparePricesMessage {
  type: 'compare-prices';
  from: StoreId;
  product: PageProduct;
}

export type Message = StoreVisitMessage | ComparePricesMessage;
export type ComparePricesResponse = PriceReport[];
