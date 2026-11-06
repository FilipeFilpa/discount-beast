// Sonda temporária: descobre a estrutura das páginas de cupom.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const urls = [
  'https://www.cuponomia.com.br/desconto/adidas',
  'https://www.cuponomia.com.br/desconto/netshoes',
  'https://www.cuponomia.com.br/desconto/centauro',
  'https://www.cuponomia.com.br/desconto/amazon',
  'https://www.cuponomia.com.br/desconto/mercado-livre',
  'https://www.cuponomia.com.br/desconto/magazine-luiza',
  'https://www.promobit.com.br/cupons/loja/adidas/',
  'https://www.promobit.com.br/cupons/loja/netshoes/',
  'https://www.promobit.com.br/cupons/loja/centauro/',
  'https://www.promobit.com.br/cupons/loja/amazon/',
  'https://www.promobit.com.br/cupons/loja/mercado-livre/',
  'https://www.promobit.com.br/cupons/loja/magazine-luiza/',
  'https://www.pelando.com.br/cupons-de-descontos/adidas',
  'https://www.pelando.com.br/cupons/adidas',
  'https://www.meliuz.com.br/desconto/cupom-adidas',
];
for (const url of urls) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' } });
    const h = await r.text();
    console.log(`\n### ${r.status} ${r.url} len=${h.length}`);
    console.log('next:', h.includes('__NEXT_DATA__'), 'ldjson:', (h.match(/application\/ld\+json/g) || []).length, 'nuxt:', h.includes('__NUXT'), 'apollo:', h.includes('__APOLLO'));
    if (!url.includes('adidas')) continue;
    for (const kw of ['ACHADOS', 'CORRE10', 'SEXTOUNOAPP', 'Pegar cupom', 'Ver Cupom']) {
      const i = h.indexOf(kw);
      if (i >= 0) console.log(`--- ${kw} @${i}:\n` + h.slice(Math.max(0, i - 700), i + 300).replace(/\s+/g, ' '));
    }
    const nd = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nd) {
      const j = JSON.parse(nd[1]);
      const walk = (o, p, d) => { if (d > 5 || !o || typeof o !== 'object') return; for (const k of Object.keys(o)) { const v = o[k]; const t = Array.isArray(v) ? `array[${v.length}]` : typeof v; console.log(p + '.' + k, t); if (typeof v === 'object') walk(v, p + '.' + k, d + 1); } };
      walk(j.props?.pageProps, 'pageProps', 0);
      const s = JSON.stringify(j); const i = s.indexOf('CORRE10'); if (i >= 0) console.log('NEXT ctx:', s.slice(Math.max(0, i - 1500), i + 500));
    }
  } catch (e) { console.log(`\n### ERR ${url} ${e}`); }
}
