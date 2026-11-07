import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestMatch, matchScore, MATCH_MIN, productFromJsonLd, searchQuery, type PageProduct } from './product-match.ts';

const duramo: PageProduct = {
  name: 'Tênis Duramo SL Masculino',
  brand: 'adidas',
  gtin: null,
  sku: 'IE7262',
  price: 399.99,
  url: 'https://www.adidas.com.br/tenis-duramo-sl/IE7262.html',
};

const hit = (title: string, price = 300, url = 'https://x.com/p') => ({ title, price, url });

test('searchQuery tira cor, tamanho e público', () => {
  assert.equal(searchQuery(duramo), 'tenis adidas duramo sl');
  assert.equal(searchQuery({ name: 'Camisa Flamengo I 24/25 adidas Masculina - Vermelho', brand: 'adidas' }), 'camisa adidas flamengo i 24 25');
});

test('mesmo modelo com título diferente bate', () => {
  for (const title of ['Tênis Adidas Duramo SL Masculino - Preto+Branco', 'Tênis adidas Duramo Sl - Masculino Tam 42', 'Tenis Adidas Duramo Sl Corrida Masculino']) {
    assert.ok(matchScore(duramo, hit(title)).score >= MATCH_MIN, title);
  }
});

test('modelo, versão, tipo, público ou marca diferentes não batem', () => {
  for (const title of [
    'Tênis Adidas Duramo Speed Masculino',
    'Tênis Adidas Duramo SL 2.0 Masculino',
    'Tênis Adidas Duramo SL Feminino',
    'Meia Adidas Duramo SL',
    'Tênis Nike Duramo SL',
    'Tênis Adidas Runfalcon 3.0',
  ]) {
    assert.ok(matchScore(duramo, hit(title)).score < MATCH_MIN, title);
  }
});

test('mesmo EAN ou código do modelo bate na hora', () => {
  assert.equal(matchScore(duramo, hit('Tênis qualquer IE7262')).score, 1);
  assert.equal(matchScore({ ...duramo, gtin: '4066765123456' }, hit('Tênis 4066765123456')).score, 1);
});

test('bestMatch pega o mais barato entre os que batem', () => {
  const best = bestMatch(duramo, [
    hit('Tênis Adidas Duramo SL Masculino', 349.9, 'a'),
    hit('Tênis Adidas Duramo SL Masculino Preto', 329.9, 'b'),
    hit('Meia Adidas Duramo', 29.9, 'c'),
  ]);
  assert.equal(best?.url, 'b');
  assert.equal(bestMatch(duramo, [hit('Tênis Nike Revolution 7', 199)]), null);
});

test('productFromJsonLd lê Product, @graph e ProductGroup', () => {
  const product = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Tênis Duramo SL',
    brand: { '@type': 'Brand', name: 'adidas' },
    sku: 'IE7262',
    gtin13: '4066765123456',
    offers: { '@type': 'Offer', price: '399.99', priceCurrency: 'BRL' },
  });
  assert.deepEqual(productFromJsonLd(['{bad json', product], 'u'), {
    name: 'Tênis Duramo SL', brand: 'adidas', gtin: '4066765123456', sku: 'IE7262', price: 399.99, url: 'u',
  });

  const graph = JSON.stringify({ '@graph': [{ '@type': 'BreadcrumbList' }, { '@type': 'Product', name: 'Bola', brand: 'Penalty', offers: [{ price: 99 }, { price: 89.9 }] }] });
  assert.equal(productFromJsonLd([graph], 'u')?.price, 89.9);

  const group = JSON.stringify({ '@type': 'ProductGroup', name: 'Camisa', productGroupID: 'JF1234', hasVariant: [{ '@type': 'Product', brand: 'adidas', gtin: '1234567890123', offers: { price: 349.99 } }] });
  const g = productFromJsonLd([group], 'u');
  assert.equal(g?.sku, 'JF1234');
  assert.equal(g?.brand, 'adidas');
  assert.equal(g?.price, 349.99);
  assert.equal(productFromJsonLd([JSON.stringify({ '@type': 'Organization', name: 'x' })], 'u'), null);
});

test('"M" no fim do nome da adidas é masculino', () => {
  const rc: PageProduct = { name: 'Tênis Adizero Drive RC M', brand: 'adidas', gtin: null, sku: null, price: 699.99, url: 'u' };
  assert.equal(searchQuery(rc), 'tenis adidas adizero drive rc');
  assert.ok(matchScore(rc, hit('Tênis Adidas Adizero Drive Rc Masculino')).score >= MATCH_MIN);
  assert.ok(matchScore(rc, hit('Tênis Masculino Adizero Drive Rc M adidas')).score >= MATCH_MIN);
  assert.ok(matchScore(rc, hit('Tênis Adidas Adizero Drive Rc Feminino')).score < MATCH_MIN);
  assert.ok(matchScore({ ...rc, name: 'Tênis Adizero Drive RC W' }, hit('Tênis Adidas Adizero Drive Rc Masculino')).score < MATCH_MIN);
});

test('na loja da marca o título não traz a marca, mas o endereço traz', () => {
  const ns: PageProduct = { name: 'Tênis Adidas Adizero Drive Rc Masculino - Pink+Preto', brand: 'Adidas', gtin: null, sku: 'FBA-86EP-492', price: 599.99, url: 'u' };
  assert.ok(matchScore(ns, hit('Tênis Adizero Drive RC M', 699.99, 'https://www.adidas.com.br/tenis-adizero-drive-rc/JR1234.html')).score >= MATCH_MIN);
  assert.ok(matchScore(ns, hit('Tênis Adizero Drive RC W', 699.99, 'https://www.adidas.com.br/tenis-adizero-drive-rc/JR9999.html')).score < MATCH_MIN);
  assert.ok(matchScore(ns, hit('Tênis Adizero Drive RC', 99, 'https://www.mercadolivre.com.br/tenis-generico/up/MLBU1')).score < MATCH_MIN);
});

test('bestMatch descarta preço absurdo (ex.: selo "R$ 20 OFF" lido como preço)', () => {
  const page = { name: 'Tênis Adidas Adizero Drive RC Masculino', brand: 'adidas', gtin: null, sku: null, price: 599.99, url: 'https://www.netshoes.com.br/p/x' };
  const hits = [
    { title: 'Tênis Adidas Adizero Drive Rc Masculino', price: 20, url: 'https://www.magazineluiza.com.br/a/p/abc123def/' },
    { title: 'Tênis Adidas Adizero Drive Rc Masculino', price: 579.99, url: 'https://www.magazineluiza.com.br/b/p/abc123deg/' },
  ];
  assert.equal(bestMatch(page, hits)?.price, 579.99);
});
