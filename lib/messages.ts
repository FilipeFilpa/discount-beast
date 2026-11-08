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

/** Cartão de preço: "Avisar quando baixar" (o background guarda e confere uma vez, em silêncio). */
export interface WatchAddMessage {
  type: 'watch-add';
  from: StoreId;
  product: PageProduct;
  /** Resultado do "Comparar preço", se você já clicou. */
  reports?: PriceReport[];
}

/** Popup: "Conferir agora". */
export interface WatchCheckNowMessage {
  type: 'watch-check-now';
}

export type Message = StoreVisitMessage | ComparePricesMessage | WatchAddMessage | WatchCheckNowMessage;
export type ComparePricesResponse = PriceReport[];
