import { findStoreByHost, STORES } from '@/lib/stores';

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const storesEl = document.querySelector<HTMLUListElement>('#stores')!;

async function render() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? new URL(tab.url).hostname : '';
  const current = findStoreByHost(host);

  statusEl.textContent = current
    ? `Você está na ${current.name}. Em breve vou testar cupons aqui.`
    : 'Abra uma das lojas abaixo para eu procurar cupons.';
  statusEl.classList.toggle('ok', Boolean(current));

  storesEl.replaceChildren(
    ...STORES.map((store) => {
      const li = document.createElement('li');
      li.textContent = store.name;
      if (store.id === current?.id) li.classList.add('active');
      return li;
    }),
  );
}

render();
