import type { StoreId } from './stores';

/** Mensagem que o content script envia quando o usuário abre uma página de loja. */
export interface StoreVisitMessage {
  type: 'store-visit';
  storeId: StoreId;
  url: string;
}

export type Message = StoreVisitMessage;
