import { defineConfig } from 'wxt';
import { STORE_MATCHES } from './lib/stores';

export default defineConfig({
  manifest: {
    name: 'Discount Beast',
    description: 'Encontra e testa cupons de desconto nas lojas que você mais usa.',
    // scripting: ler a página de busca das outras lojas no comparador de preços.
    permissions: ['storage', 'alarms', 'scripting'],
    // Permite ao popup ler a URL da aba e ao comparador ler as buscas das lojas suportadas.
    host_permissions: STORE_MATCHES,
  },
});
