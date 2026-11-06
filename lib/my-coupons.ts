import { browser } from 'wxt/browser';
import { parseCodes } from './codes';
import type { StoreId } from './stores';

/**
 * "Meus cupons": códigos que você recebeu por e-mail, app ou adiClub.
 * Ficam só no storage.local do seu Chrome. Nunca vão para o GitHub.
 */
type MyCoupons = Partial<Record<StoreId, string[]>>;

async function getAll(): Promise<MyCoupons> {
  const { myCoupons } = (await browser.storage.local.get('myCoupons')) as { myCoupons?: MyCoupons };
  return myCoupons ?? {};
}

export async function getMyCoupons(store: StoreId): Promise<string[]> {
  return (await getAll())[store] ?? [];
}

/** Adiciona os códigos do texto colado. Devolve a lista nova da loja. */
export async function addMyCoupons(store: StoreId, text: string): Promise<string[]> {
  const all = await getAll();
  const codes = [...new Set([...(all[store] ?? []), ...parseCodes(text)])];
  await browser.storage.local.set({ myCoupons: { ...all, [store]: codes } });
  return codes;
}

export async function removeMyCoupon(store: StoreId, code: string): Promise<string[]> {
  const all = await getAll();
  const codes = (all[store] ?? []).filter((c) => c !== code);
  await browser.storage.local.set({ myCoupons: { ...all, [store]: codes } });
  return codes;
}
