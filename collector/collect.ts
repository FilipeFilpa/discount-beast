/**
 * Coletor de cupons públicos do Discount Beast.
 *
 * Roda no GitHub Actions (.github/workflows/collect-coupons.yml) 2x por dia:
 * 1. Abre a página de cupons de cada loja em cada site (Promobit, Méliuz, Cuponomia).
 * 2. Junta tudo, tira repetidos e vencidos.
 * 3. Salva em data/coupons.json, que a extensão baixa.
 *
 * Para rodar no seu computador: npm run collect
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import type { CouponFeed } from '../lib/coupons.ts';
import { STORES } from '../lib/stores.ts';
import { buildFeed, mergeCoupons, type SourceResult } from './merge.ts';
import { cuponomia } from './sources/cuponomia.ts';
import { meliuz } from './sources/meliuz.ts';
import { promobit } from './sources/promobit.ts';
import { fetchHtml } from './util.ts';

const SOURCES = [promobit, meliuz, cuponomia];
const OUTPUT = new URL('../data/coupons.json', import.meta.url);

async function readPrevious(): Promise<CouponFeed | null> {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8')) as CouponFeed;
  } catch {
    return null; // primeira vez: ainda não existe arquivo
  }
}

async function main() {
  const now = new Date();
  const previous = await readPrevious();

  // Busca todas as páginas em paralelo (são só ~18 páginas).
  const jobs = SOURCES.flatMap((source) =>
    STORES.flatMap((store) => {
      const url = source.urls[store.id];
      if (!url) return [];
      return [
        (async (): Promise<SourceResult> => {
          try {
            const coupons = source.parse(await fetchHtml(url), store.id);
            return { source: source.id, store: store.id, coupons };
          } catch (error) {
            return { source: source.id, store: store.id, coupons: [], error: String(error) };
          }
        })(),
      ];
    }),
  );
  const results = await Promise.all(jobs);

  // Relatório no log do GitHub Actions.
  const lines = ['| Loja | Fonte | Cupons | Códigos |', '| --- | --- | --- | --- |'];
  for (const r of results) {
    const codes = r.error ? `⚠️ ${r.error}` : [...new Set(r.coupons.map((c) => c.code))].join(', ');
    lines.push(`| ${r.store} | ${r.source} | ${r.coupons.length} | ${codes} |`);
  }
  console.log(lines.join('\n'));

  const failed = results.filter((r) => r.error);
  if (failed.length === results.length) {
    console.error('Todas as fontes falharam. Mantendo o arquivo antigo.');
    process.exit(1);
  }

  const coupons = mergeCoupons(results, previous?.coupons ?? [], now);
  const feed = buildFeed(coupons, previous, now);
  await mkdir(new URL('.', OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(feed, null, 2)}\n`);

  const perStore = STORES.map((s) => `${s.name}: ${coupons.filter((c) => c.store === s.id).length}`).join(' · ');
  const summary = `**${coupons.length} cupons** (${perStore}). Fontes com erro: ${failed.length}/${results.length}.`;
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n\n${lines.join('\n')}\n`);
  }
}

await main();
