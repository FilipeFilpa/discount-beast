// Sonda temporária v3
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' } }); return [r.status, r.url, await r.text()]; };
const flat = (s) => s.replace(/\s+/g, ' ');
{
  const [st, u, h] = await get('https://www.meliuz.com.br/desconto/cupom-adidas');
  const tags = [...h.matchAll(/<div class="cpn-layout[^"]*"[^>]*data-offer-code[^>]*>/g)].map((m) => m[0]);
  console.log('MELIUZ tags:', tags.length); tags.slice(0, 3).forEach((t) => console.log(t));
  const i = h.indexOf('data-offer-code="ACHADOS"'); console.log('AFTER:', flat(h.slice(i, i + 2500)).replace(/<svg.*?<\/svg>/g, ''));
  for (const kw of ['expirad', 'Expirad', 'Válido até', 'validade', 'Vence']) { const j = h.indexOf(kw); if (j >= 0) console.log(`KW ${kw}:`, flat(h.slice(Math.max(0, j - 300), j + 200)).replace(/<svg.*?<\/svg>/g, '')); }
}
{
  const [st, u, h] = await get('https://www.cuponomia.com.br/desconto/adidas');
  console.log(`CUPONOMIA ${st} ${u} len=${h.length}`);
  const i = h.indexOf('ACHADOS'); console.log('CTX:', i, flat(h.slice(Math.max(0, i - 1500), i + 300)).replace(/<svg.*?<\/svg>/g, ''));
  console.log('data-attrs:', [...new Set([...h.matchAll(/data-[a-z-]+(?==)/g)].map((m) => m[0]))].join(' '));
}
