import { browser } from 'wxt/browser';
import { parseCodes } from './codes';
import { STORES, type StoreId } from './stores';

/**
 * "Meus cupons": códigos que você recebeu por e-mail, app ou adiClub.
 * Ficam no storage.sync: o Chrome leva para todo computador logado na mesma conta Google
 * (com a sincronização de "Extensões" ligada). Nunca vão para o GitHub.
 *
 * Cada loja é um item separado ("myCoupons.adidas"), porque o sync aceita no máximo 8 KB por item.
 */
export type MyCoupons = Partial<Record<StoreId, string[]>>;

const PREFIX = 'myCoupons.';
/** Teto por loja: 100 códigos de até 60 letras cabem folgados nos 8 KB de um item do sync. */
export const MAX_PER_STORE = 100;
const STORE_IDS = new Set<string>(STORES.map((s) => s.id));

const keyOf = (store: StoreId) => `${PREFIX}${store}`;

/** true se a mudança no storage mexeu em "Meus cupons" (para quem escuta storage.onChanged). */
export function isMyCouponsChange(changes: Record<string, unknown>, area: string): boolean {
  return area === 'sync' && Object.keys(changes).some((k) => k.startsWith(PREFIX));
}

/** Mantém os mais novos (os do fim da lista) quando passa do teto. */
function capped(codes: string[]): string[] {
  return codes.length > MAX_PER_STORE ? codes.slice(-MAX_PER_STORE) : codes;
}

/**
 * Versões antigas guardavam tudo em storage.local ("myCoupons"). Na primeira leitura,
 * junta esses códigos com os do sync (sem perder nenhum dos dois lados) e só então apaga o antigo.
 */
let migration: Promise<void> | undefined;
function migrateFromLocal(): Promise<void> {
  migration ??= (async () => {
    const { myCoupons: old } = (await browser.storage.local.get('myCoupons')) as { myCoupons?: MyCoupons };
    if (!old) return;
    await mergeIntoSync(old);
    await browser.storage.local.remove('myCoupons');
  })().catch((error) => {
    migration = undefined; // tenta de novo na próxima leitura
    console.warn('[Discount Beast] não consegui migrar Meus cupons', error);
  });
  return migration;
}

/** Junta códigos novos com os que já estão no sync, loja por loja. Devolve quantos entraram. */
async function mergeIntoSync(incoming: MyCoupons): Promise<number> {
  const stores = (Object.keys(incoming) as StoreId[]).filter((s) => STORE_IDS.has(s));
  if (!stores.length) return 0;
  const current = (await browser.storage.sync.get(stores.map(keyOf))) as Record<string, string[] | undefined>;
  const update: Record<string, string[]> = {};
  let added = 0;
  for (const store of stores) {
    const before = current[keyOf(store)] ?? [];
    const codes = capped([...new Set([...before, ...parseCodes((incoming[store] ?? []).join(' '))])]);
    added += codes.filter((c) => !before.includes(c)).length;
    if (codes.length !== before.length || codes.some((c, i) => c !== before[i])) update[keyOf(store)] = codes;
  }
  if (Object.keys(update).length) await browser.storage.sync.set(update);
  return added;
}

/** Todos os seus códigos, de todas as lojas. */
export async function getAllMyCoupons(): Promise<MyCoupons> {
  await migrateFromLocal();
  const all = (await browser.storage.sync.get(null)) as Record<string, unknown>;
  const result: MyCoupons = {};
  for (const [key, value] of Object.entries(all)) {
    const store = key.slice(PREFIX.length);
    if (key.startsWith(PREFIX) && STORE_IDS.has(store) && Array.isArray(value) && value.length) {
      result[store as StoreId] = value as string[];
    }
  }
  return result;
}

export async function getMyCoupons(store: StoreId): Promise<string[]> {
  await migrateFromLocal();
  const saved = (await browser.storage.sync.get(keyOf(store))) as Record<string, string[] | undefined>;
  return saved[keyOf(store)] ?? [];
}

/** Adiciona os códigos do texto colado. Devolve a lista nova da loja. */
export async function addMyCoupons(store: StoreId, text: string): Promise<string[]> {
  await mergeIntoSync({ [store]: parseCodes(text) });
  return getMyCoupons(store);
}

export async function removeMyCoupon(store: StoreId, code: string): Promise<string[]> {
  const codes = (await getMyCoupons(store)).filter((c) => c !== code);
  if (codes.length) await browser.storage.sync.set({ [keyOf(store)]: codes });
  else await browser.storage.sync.remove(keyOf(store));
  return codes;
}

/** Backup em texto (JSON) de todas as lojas, para levar a um Chrome que não sincroniza. */
export async function exportMyCoupons(): Promise<string> {
  return JSON.stringify(await getAllMyCoupons());
}

/** Lê um backup colado (o JSON de exportMyCoupons). Devolve quantos códigos novos entraram, ou null se o texto não é um backup. */
export async function importMyCoupons(text: string): Promise<number | null> {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const incoming: MyCoupons = {};
  for (const [store, codes] of Object.entries(data)) {
    if (STORE_IDS.has(store) && Array.isArray(codes)) incoming[store as StoreId] = codes.map(String);
  }
  return mergeIntoSync(incoming);
}
