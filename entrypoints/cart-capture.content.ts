import { cleanPageHtml, downloadText } from '@/lib/page-capture';
import { findStoreByHost } from '@/lib/stores';

/**
 * Lojas onde o testador ainda não sabe mexer no carrinho. Na página do carrinho
 * aparece um botão que baixa o HTML limpo, para o Filipe mandar e a gente achar os seletores.
 * Quando a loja ganhar adaptador (lib/carts/<loja>.ts), tire ela daqui.
 */
export default defineContentScript({
  matches: [
    'https://*.netshoes.com.br/*', 'https://netshoes.com.br/*', 'https://*.centauro.com.br/*', 'https://centauro.com.br/*',
    'https://*.kabum.com.br/*', 'https://kabum.com.br/*',
    'https://*.pichau.com.br/*', 'https://pichau.com.br/*', 'https://*.terabyteshop.com.br/*', 'https://terabyteshop.com.br/*',
  ],
  runAt: 'document_idle',
  main() {
    // Netshoes/Centauro já têm adaptador: o botão fica só no carrinho, para salvar o caso
    // "cupom aceito" quando aparecer um código válido (ainda não vimos esse HTML).
    // KaBuM!: o botão serve para salvar o caso "cupom aceito".
    // Pichau/Terabyte: ainda sem adaptador; o botão serve para descobrir os seletores do carrinho.
    // Nelas ainda não sabemos a URL exata do carrinho, então aceitamos qualquer caminho com carrinho/cart/checkout.
    let host: HTMLElement | null = null;
    setInterval(() => {
      const loose = /pichau|terabyteshop/.test(location.hostname);
      const inCart = loose
        ? /cart|carrinho|checkout|pagamento|sacola|endereco|formaspagamento/i.test(location.pathname)
        : /^\/cart|\/checkouts\/carrinho|^\/carrinho|^\/pagamento|^\/checkout|^\/endereco/.test(location.pathname);
      if (inCart && !host) host = createButton();
      if (host) host.hidden = !inCart;
    }, 1500);
  },
});

function createButton(): HTMLElement {
  const store = findStoreByHost(location.hostname);
  const host = document.createElement('discount-beast-capture');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .card { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; width: 250px; padding: 12px;
        border-radius: 12px; background: #fff; color: #111827; box-shadow: 0 8px 24px rgb(0 0 0 / .2);
        font: 13px/1.4 system-ui, sans-serif; }
      p { margin: 0 0 8px; }
      button { width: 100%; padding: 9px; border: 0; border-radius: 8px; background: #2563eb; color: #fff;
        font: 600 13px system-ui, sans-serif; cursor: pointer; }
      .x { position: absolute; top: 4px; right: 8px; width: auto; padding: 0; background: none; color: #6b7280; font-size: 16px; }
    </style>
    <div class="card">
      <button class="x" title="Fechar">×</button>
      <p><strong>🦁 Discount Beast</strong><br>Salve o carrinho (sem cupom, com cupom recusado e com cupom aceito) e mande os arquivos para o Claude.</p>
      <button class="go">Salvar carrinho para o Discount Beast</button>
      <p class="msg" style="margin:8px 0 0"></p>
    </div>`;
  document.body.append(host);
  root.querySelector('.x')!.addEventListener('click', () => host.remove());
  const msg = root.querySelector<HTMLParagraphElement>('.msg')!;
  let count = 0;
  root.querySelector('.go')!.addEventListener('click', () => {
    count += 1;
    const time = new Date().toTimeString().slice(0, 8).replaceAll(':', '');
    downloadText(`discount-beast-${store?.id ?? 'loja'}-${count}-${time}.html`, cleanPageHtml());
    msg.textContent = `Arquivo ${count} salvo em Downloads. Mande para o Claude.`;
  });
  return host;
}
