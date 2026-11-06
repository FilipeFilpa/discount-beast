import { savePelandoCoupons } from '@/lib/pelando-coupons';
import { codeFromText, codesFromJson, storeFromPelandoPath } from '@/lib/pelando';
import { STORES, type StoreId } from '@/lib/stores';

/**
 * Quando VOCÊ abre uma página de cupons do Pelando (ex.: pelando.com.br/cupons-de-descontos/adidas),
 * a extensão lê os códigos que já estão na tela e guarda no seu Chrome, para o teste do carrinho usar.
 * Nada de robô: só lê a página que você mesmo abriu.
 */
export default defineContentScript({
  matches: ['https://pelando.com.br/*', 'https://*.pelando.com.br/*'],
  runAt: 'document_idle',
  main() {
    const seen = new Map<StoreId, Set<string>>();
    let toast: Toast | null = null;

    // O Pelando troca de página sem recarregar e mostra alguns códigos só depois do clique em
    // "Pegar cupom", então lemos de novo a cada 2 segundos.
    const tick = async () => {
      const store = storeFromPelandoPath(location.pathname);
      if (!store) return;
      const known = seen.get(store) ?? new Set<string>();
      seen.set(store, known);
      const found = readCodes(document);
      const fresh = found.filter((c) => !known.has(c));
      if (!fresh.length) return;
      fresh.forEach((c) => known.add(c));
      await savePelandoCoupons(store, fresh);
      toast ??= createToast();
      toast.show(store, [...known]);
    };
    tick().catch((e) => console.warn('[Discount Beast]', e));
    setInterval(() => tick().catch((e) => console.warn('[Discount Beast]', e)), 2000);
  },
});

/** Junta os códigos achados de três jeitos diferentes, porque ainda não sabemos qual o Pelando usa. */
function readCodes(doc: Document): string[] {
  const codes = new Set<string>();
  const from: Record<string, string[]> = { dados: [], atributos: [], tela: [] };

  // 1. Dados JSON que vêm junto com a página.
  for (const script of doc.querySelectorAll<HTMLScriptElement>(
    'script#__NEXT_DATA__, script[type="application/json"], script[type="application/ld+json"]',
  )) {
    try {
      for (const c of codesFromJson(JSON.parse(script.textContent ?? ''))) from.dados!.push(c);
    } catch {
      // script que não é JSON: ignora
    }
  }

  // 2. Atributos que guardam o código para o botão "copiar".
  for (const el of doc.querySelectorAll('[data-code], [data-coupon-code], [data-clipboard-text]')) {
    for (const name of ['data-code', 'data-coupon-code', 'data-clipboard-text']) {
      const c = codeFromText(el.getAttribute(name));
      if (c) from.atributos!.push(c);
    }
  }

  // 3. Texto na tela dentro de algo que se chame "code", "cupom" ou "coupon".
  for (const el of doc.querySelectorAll<HTMLElement>(
    '[class*="code" i], [class*="cupom" i], [class*="coupon" i], [data-testid*="code" i], [data-testid*="coupon" i]',
  )) {
    if (el.closest('discount-beast-toast')) continue;
    const c = codeFromText(el.childElementCount === 0 ? el.textContent : ownText(el));
    if (c) from.tela!.push(c);
  }

  for (const list of Object.values(from)) list.forEach((c) => codes.add(c));
  if (codes.size) console.info('[Discount Beast] Pelando: códigos achados', from);
  return [...codes];
}

/** Só o texto direto do elemento, sem o dos filhos. */
function ownText(el: Element): string {
  return [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('');
}

interface Toast {
  show(store: StoreId, codes: string[]): void;
}

/** Aviso pequeno no canto da tela dizendo o que foi guardado. */
function createToast(): Toast {
  const host = document.createElement('discount-beast-toast');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 260px; padding: 12px 14px;
        border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 13px/1.45 system-ui, sans-serif; }
      strong { display: block; margin-bottom: 4px; font-size: 14px; }
      p { margin: 0; }
      .codes { margin-top: 6px; font: 12px ui-monospace, monospace; color: #16a34a; word-break: break-word; }
      button { position: absolute; top: 4px; right: 8px; border: 0; background: none; color: #6b7280; font-size: 16px; cursor: pointer; }
    </style>
    <div class="card">
      <button title="Fechar">×</button>
      <strong>🦁 Discount Beast</strong>
      <p class="msg"></p>
      <p class="codes"></p>
    </div>`;
  document.body.append(host);
  root.querySelector('button')!.addEventListener('click', () => (host.hidden = true));
  const msg = root.querySelector('.msg')!;
  const list = root.querySelector('.codes')!;
  return {
    show(store, codes) {
      const name = STORES.find((s) => s.id === store)?.name ?? store;
      host.hidden = false;
      msg.textContent = `Guardei ${codes.length === 1 ? '1 cupom' : `${codes.length} cupons`} da ${name} que estão nesta página. Vou testar no carrinho.`;
      list.textContent = codes.join(', ');
    },
  };
}
