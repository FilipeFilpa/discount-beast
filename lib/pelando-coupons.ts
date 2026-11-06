import { browser } from 'wxt/browser';
import { mergeSeen, type SeenCode } from './pelando';
import type { StoreId } from './stores';

/** Códigos lidos do Pelando, por loja. Ficam só no storage.local do seu Chrome. */
type PelandoCoupons = Partial<Record<StoreId, SeenCode[]>>;

async function getAll(): Promise<PelandoCoupons> {
  const { pelandoCoupons } = (await browser.storage.local.get('pelandoCoupons')) as { pelandoCoupons?: PelandoCoupons };
  return pelandoCoupons ?? {};
}

export async function getPelandoCoupons(store: StoreId): Promise<string[]> {
  return ((await getAll())[store] ?? []).map((s) => s.code);
}

/** Guarda os códigos achados na página. Devolve quantos eram novos. */
export async function savePelandoCoupons(store: StoreId, codes: string[]): Promise<number> {
  const all = await getAll();
  const before = new Set((all[store] ?? []).map((s) => s.code));
  const merged = mergeSeen(all[store] ?? [], codes);
  await browser.storage.local.set({ pelandoCoupons: { ...all, [store]: merged } });
  return codes.filter((c) => !before.has(c)).length;
}
