import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitsFromNextData } from './next-data.ts';

const MAGALU = /magazineluiza\.com\.br\/[^?#]*\/p\/[a-z0-9]{6,}/i;

test('hitsFromNextData lê produtos do JSON do Next.js (preço Pix, ignora preço antigo)', () => {
  const data = {
    props: {
      pageProps: {
        data: {
          search: {
            products: [
              { title: 'Tênis adidas Adizero Drive RC Masculino', path: 'tenis-adidas-adizero-drive-rc/p/jk6bd8a1e0/es/tnis/', price: { fullPrice: '799.99', price: '599.99', bestPrice: '569.99' } },
              { title: 'Banner', path: 'selecao/ofertas/', price: { price: '10.00' } },
              { title: 'Tênis adidas Duramo SL', url: 'https://www.magazineluiza.com.br/tenis-duramo/p/ab12cd34ef/es/tnis/', price: 349.9 },
            ],
          },
        },
      },
    },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  assert.deepEqual(hitsFromNextData(html, 'https://www.magazineluiza.com.br', MAGALU), [
    { title: 'Tênis adidas Adizero Drive RC Masculino', price: 569.99, url: 'https://www.magazineluiza.com.br/tenis-adidas-adizero-drive-rc/p/jk6bd8a1e0/es/tnis/' },
    { title: 'Tênis adidas Duramo SL', price: 349.9, url: 'https://www.magazineluiza.com.br/tenis-duramo/p/ab12cd34ef/es/tnis/' },
  ]);
  assert.deepEqual(hitsFromNextData('<html>nada</html>', 'https://x', MAGALU), []);
});
