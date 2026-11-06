import type { SearchHit } from './product-match';

/**
 * Mercado Livre: numa aba de fundo a lista não é desenhada, mas o HTML da busca traz os produtos
 * num JSON ("polycards") dentro de um <script>. Aqui lemos título, preço atual e link de cada um.
 * Texto puro, sem DOM: roda no background e dá para testar com `npm test`.
 */
export function hitsFromPolycards(html: string, max = 30): SearchHit[] {
  // O JSON vem escapado dentro de uma string JavaScript: \" vira " e / vira /.
  const text = html.replace(/\\\\"/g, '"').replace(/\\"/g, '"').replace(/\\\\u002F|\\u002F/gi, '/');
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const cards = text.split('"polycard":{').slice(1);
  for (const card of cards) {
    const id = card.match(/"metadata":\{"id":"(MLB\d+)"/)?.[1];
    const title = card.match(/"type":"title","id":"title","title":\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
    const price = Number(card.match(/"current_price":\{"value":([\d.]+)/)?.[1] ?? NaN);
    if (!id || !title || !(price > 0) || seen.has(id)) continue;
    seen.add(id);
    const url = card.match(/"metadata":\{[^}]*?"url":"([^"]+)"/)?.[1] ?? '';
    // Anúncio patrocinado tem link de contagem de clique; troca pelo link direto do anúncio.
    const link = url && !/click1\.|mclics/.test(url) ? `https://${url.replace(/^https?:\/\//, '')}` : `https://produto.mercadolivre.com.br/${id.replace(/^MLB/, 'MLB-')}`;
    hits.push({ title: title.replace(/\\(.)/g, '$1'), price, url: link });
    if (hits.length >= max) break;
  }
  return hits;
}
