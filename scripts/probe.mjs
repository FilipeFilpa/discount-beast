// Sonda temporária v2
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' } }); return [r.status, r.url, await r.text()]; };
const flat = (s) => s.replace(/\s+/g, ' ');
// Cuponomia
for (const slug of ['adidas', 'netshoes']) {
  const [st, u, h] = await get(`https://www.cuponomia.com.br/desconto/${slug}`);
  console.log(`\n### CUPONOMIA ${st} ${u} len=${h.length} ldjson=${(h.match(/ld\+json/g)||[]).length}`);
  if (slug === 'adidas') { let i = h.indexOf('ACHADOS'); let n = 0; while (i >= 0 && n < 3) { console.log('--- ctx:', flat(h.slice(Math.max(0, i - 900), i + 200))); i = h.indexOf('ACHADOS', i + 2000); n++; } }
}
// Meliuz
for (const slug of ['cupom-adidas', 'cupom-netshoes', 'cupom-centauro', 'cupom-amazon', 'cupom-mercado-livre', 'cupom-magazine-luiza', 'cupom-magalu']) {
  const [st, u, h] = await get(`https://www.meliuz.com.br/desconto/${slug}`);
  const codes = [...h.matchAll(/data-offer-code="([^"]*)"/g)].map((m) => m[1]);
  console.log(`\n### MELIUZ ${st} ${u} len=${h.length} codes=${JSON.stringify(codes)}`);
  if (slug === 'cupom-adidas') {
    const m = h.match(/<div class="cpn-layout offer-cpn"[\s\S]{0,4000}/); if (m) console.log('--- first offer:', flat(m[0]).slice(0, 3500));
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1].slice(0, 600)); console.log('--- ld:', ld);
  }
}
// Promobit
for (const slug of ['adidas', 'netshoes', 'centauro', 'amazon', 'mercado-livre', 'magazine-luiza']) {
  const [st, u, h] = await get(`https://www.promobit.com.br/cupons/loja/${slug}/`);
  const nd = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const found = []; const paths = new Set();
  const walk = (o, p) => { if (!o || typeof o !== 'object') return; if (typeof o.couponCode === 'string') { found.push(o); paths.add(p.replace(/\.\d+$/, '[]')); return; } for (const k of Object.keys(o)) walk(o[k], p + '.' + k); };
  if (nd) walk(JSON.parse(nd[1]), '');
  const byStatus = {}; for (const c of found) byStatus[c.couponStatusName] = (byStatus[c.couponStatusName] || 0) + 1;
  console.log(`\n### PROMOBIT ${st} ${slug} total=${found.length} ${JSON.stringify(byStatus)} paths=${[...paths]}`);
  console.log(found.filter((c) => c.couponStatusName === 'APPROVED').slice(0, 8).map((c) => `${c.couponCode} | ${c.couponTitle} | until=${c.couponUntil} | store=${c.storeSlug} | vis=${c.visibility}`).join('\n'));
  if (slug === 'adidas') console.log('keys:', Object.keys(found[0] || {}).join(','));
}
