import { defineConfig } from 'wxt';
import { STORE_MATCHES } from './lib/stores';

export default defineConfig({
  manifest: {
    name: 'Discount Beast',
    description: 'Encontra e testa cupons de desconto nas lojas que você mais usa.',
    permissions: ['storage', 'alarms'],
    // Permite ao popup ler a URL da aba quando ela é de uma loja suportada.
    host_permissions: STORE_MATCHES,
  },
});
