import { cleanPageHtml, downloadText } from '@/lib/page-capture';
import { findStoreByHost } from '@/lib/stores';

/**
 * Lojas onde o testador ainda não sabe mexer no carrinho. Na página do carrinho
 * aparece um botão (em todas as páginas da loja) que baixa o HTML limpo, para o Filipe mandar e a gente achar os seletores.
 * Quando a loja ganhar adaptador (lib/carts/<loja>.ts), tire ela daqui.
 */
export default defineContentScript({
  matches: ['https://*.netshoes.com.br/*', 'https://netshoes.com.br/*', 'https://*.centauro.com.br/*', 'https://centauro.com.br/*'],
  runAt: 'document_idle',
  main() {
    // Não sabemos ainda o endereço exato do carrinho de cada loja, então o botão aparece em todas as páginas delas.
    createButton();
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
      <p><strong>🦁 Discount Beast</strong><br>Ainda estou aprendendo esta loja. Abra o carrinho e clique abaixo.</p>
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
