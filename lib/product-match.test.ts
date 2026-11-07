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

// ===== Informática (KaBuM!, Pichau, Terabyte) =====
const tech = (name: string, brand: string, price = 2000): PageProduct => ({ name, brand, gtin: null, sku: '520369', price, url: 'https://www.kabum.com.br/produto/520369/x' });

test('informática: mesma placa de vídeo com títulos de lojas diferentes bate', () => {
  const kabum = tech('Placa de Vídeo RTX 4060 Asus Dual O8G NVIDIA GeForce, 8GB GDDR6, DLSS, Ray Tracing - DUAL-RTX4060-O8G', 'ASUS');
  for (const title of [
    'Placa de Video Asus GeForce RTX 4060 Dual OC, 8GB, GDDR6, 128-bit, DUAL-RTX4060-O8G',
    'Placa de Video Asus Dual GeForce RTX 4060 OC 8GB GDDR6 128bit',
  ]) {
    assert.ok(matchScore(kabum, hit(title, 1800)).score >= MATCH_MIN, title);
  }
});

test('informática: outro modelo, versão ou linha não bate', () => {
  const kabum = tech('Placa de Vídeo RTX 4060 Asus Dual O8G NVIDIA GeForce, 8GB GDDR6, DLSS, Ray Tracing - DUAL-RTX4060-O8G', 'ASUS');
  for (const title of [
    'Placa de Video Asus Dual GeForce RTX 4070 OC 12GB GDDR6X',
    'Placa de Video Asus Dual GeForce RTX 4060 Ti OC 8GB GDDR6',
    'Placa de Video Asus Dual GeForce RTX 4060Ti 8GB',
    'Placa de Video Asus TUF Gaming GeForce RTX 4060 OC 8GB GDDR6',
    // Mesmo chip (RTX4060) no código, mas é outra placa (TUF).
    'Placa de Video Asus TUF Gaming RTX 4060 OC, 8GB, GDDR6, TUF-RTX4060-O8G-GAMING',
    'Placa de Video Gigabyte GeForce RTX 4060 Eagle OC 8GB',
  ]) {
    assert.ok(matchScore(kabum, hit(title, 1800)).score < MATCH_MIN, title);
  }
});

test('informática: processador, SSD e capacidade', () => {
  const ryzen = tech('Processador AMD Ryzen 5 5600, 3.5GHz (4.4GHz Max Turbo), Cache 35MB, 6 Núcleos, 12 Threads, AM4 - 100-100000927BOX', 'AMD', 700);
  assert.ok(matchScore(ryzen, hit('Processador AMD Ryzen 5 5600, 6-Core, 12-Threads, 3.5GHz (4.4GHz Turbo), Cache 35MB, AM4, 100-100000927BOX')).score >= MATCH_MIN);
  assert.ok(matchScore(ryzen, hit('Processador AMD Ryzen 5 5600 3.5GHz (4.4GHz Turbo) 6-Cores 12-Threads Cache 35MB AM4')).score >= MATCH_MIN);
  assert.ok(matchScore(ryzen, hit('Processador AMD Ryzen 5 7600, 3.8GHz (5.1GHz Turbo), 6-Cores 12-Threads, AM5')).score < MATCH_MIN);
  assert.ok(matchScore(ryzen, hit('Processador AMD Ryzen 5 5600X, 3.7GHz (4.6GHz Turbo), 6-Cores 12-Threads, AM4')).score < MATCH_MIN);
  assert.ok(matchScore(ryzen, hit('Processador AMD Ryzen 7 5700X, 3.4GHz, 8-Cores, AM4')).score < MATCH_MIN);

  const ssd = tech('SSD 1TB Kingston NV2, M.2 2280 PCIe, NVMe, Leitura: 3500 MB/s e Gravação: 2100 MB/s - SNV2S/1000G', 'Kingston', 400);
  assert.ok(matchScore(ssd, hit('SSD Kingston NV2, 1TB, M.2 NVMe, PCIe 4.0, Leitura 3500MB/s, SNV2S/1000G')).score >= MATCH_MIN);
  assert.ok(matchScore(ssd, hit('SSD Kingston NV2 1TB M.2 NVMe 2280 Leitura 3500MBs')).score >= MATCH_MIN);
  assert.ok(matchScore(ssd, hit('SSD Kingston NV2 500GB M.2 NVMe 2280')).score < MATCH_MIN);
});

test('informática: busca sem especificações e sem código de peça', () => {
  assert.equal(
    searchQuery({ name: 'Placa de Vídeo RTX 4060 Ti Asus Dual NVIDIA GeForce, 8GB GDDR6, DLSS - DUAL-RTX4060TI-O8G', brand: 'ASUS' }),
    'placa asus rtx 4060 ti dual 8gb',
  );
  assert.equal(searchQuery({ name: 'SSD 1TB Kingston NV2, M.2 2280 PCIe, NVMe', brand: 'Kingston' }), 'ssd kingston 1tb nv2');
});

test('esporte continua igual: número de versão diferente não bate', () => {
  assert.ok(matchScore(duramo, hit('Tênis Adidas Duramo SL 2.0 Masculino')).score < MATCH_MIN);
});

test('informática: celular e monitor', () => {
  const iphone = tech('Smartphone Apple iPhone 15, 128GB, Câmera Dupla 48MP, Tela 6.1", Preto', 'Apple', 5000);
  assert.ok(matchScore(iphone, hit('Apple iPhone 15 128GB Preto Smartphone')).score >= MATCH_MIN);
  assert.ok(matchScore(iphone, hit('Smartphone Apple iPhone 15 Pro 128GB')).score < MATCH_MIN);
  assert.ok(matchScore(iphone, hit('Smartphone Apple iPhone 16 128GB')).score < MATCH_MIN);
  assert.ok(matchScore(iphone, hit('Smartphone Apple iPhone 15 256GB')).score < MATCH_MIN);
  const lg = tech('Monitor Gamer LG UltraGear 27", 180Hz, Full HD, IPS, 1ms, HDMI e DisplayPort, HDR10 - 27GS60F-B', 'LG', 900);
  assert.ok(matchScore(lg, hit('Monitor Gamer LG UltraGear 27GS60F-B 27 Pol IPS Full HD 180Hz 1ms')).score >= MATCH_MIN);
  assert.ok(matchScore(lg, hit('Monitor Gamer LG UltraGear 24GS60F-B 24 Pol IPS Full HD 180Hz')).score < MATCH_MIN);
});
