import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitsFromPolycards } from './polycards.ts';

// Trecho no formato do HTML real do ML (JSON escapado dentro de uma string JavaScript).
const card = (id: string, url: string, title: string, price: number) =>
  String.raw`{\"id\":\"POLYCARD\",\"polycard\":{\"unique_id\":\"x\",\"metadata\":{\"id\":\"${id}\",\"url\":\"${url}\",\"url_params\":\"\"},\"components\":[{\"type\":\"title\",\"id\":\"title\",\"title\":{\"text\":\"${title}\",\"title_tag\":\"h3\"}},{\"type\":\"price\",\"id\":\"price_v2\",\"price\":{\"price_labels\":[{\"price\":{\"value\":899.9,\"previous\":true}}],\"current_price\":{\"value\":${price},\"currency\":\"BRL\"},\"installments\":{\"values\":[{\"price\":{\"value\":47.78}}]}}}]}}`;

test('hitsFromPolycards lê título, preço atual e link (troca link de anúncio pelo direto)', () => {
  const html = `<script>_n.ctx.r=JSON.parse("[${card('MLB3938351091', String.raw`www.mercadolivre.com.br/tenis-adizero/up/MLBU3938351091`, 'Tênis Masculino Adizero Drive Rc adidas', 573.28)},${card('MLB3999288441', String.raw`click1.mercadolivre.com.br/mclics/clicks`, 'Tênis adidas Adizero Drive Rc', 693.4)}]")</script>`;
  assert.deepEqual(hitsFromPolycards(html), [
    { title: 'Tênis Masculino Adizero Drive Rc adidas', price: 573.28, url: 'https://www.mercadolivre.com.br/tenis-adizero/up/MLBU3938351091' },
    { title: 'Tênis adidas Adizero Drive Rc', price: 693.4, url: 'https://produto.mercadolivre.com.br/MLB-3999288441' },
  ]);
  assert.deepEqual(hitsFromPolycards('<html>sem produtos</html>'), []);
});
