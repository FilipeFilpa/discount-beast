/** Lojas suportadas. Para adicionar uma loja nova, basta incluir uma entrada aqui. */
export interface Store {
  id: StoreId;
  name: string;
  /** Domínios da loja (sem "www."). */
  domains: string[];
}

export type StoreId = 'amazon' | 'mercadolivre' | 'adidas' | 'netshoes' | 'magalu';

export const STORES: Store[] = [
  { id: 'amazon', name: 'Amazon', domains: ['amazon.com.br'] },
  { id: 'mercadolivre', name: 'Mercado Livre', domains: ['mercadolivre.com.br'] },
  { id: 'adidas', name: 'adidas', domains: ['adidas.com.br'] },
  { id: 'netshoes', name: 'Netshoes', domains: ['netshoes.com.br'] },
  { id: 'magalu', name: 'Magalu', domains: ['magazineluiza.com.br', 'magalu.com'] },
];

/** Padrões de URL usados no manifest para injetar o content script. */
export const STORE_MATCHES = STORES.flatMap((s) =>
  s.domains.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
);

/** Descobre a loja a partir do hostname (ex.: "www.netshoes.com.br"). */
export function findStoreByHost(hostname: string): Store | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return STORES.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`)));
}
