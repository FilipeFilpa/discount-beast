import { defineConfig } from 'wxt';
import { STORE_MATCHES } from './lib/stores';

export default defineConfig({
  manifest: {
    name: 'Discount Beast',
    description: 'Encontra e testa cupons de desconto nas lojas que você mais usa.',
    // scripting: ler a página de busca das outras lojas no comparador de preços. notifications: aviso de queda de preço.
    permissions: ['storage', 'alarms', 'scripting', 'notifications'],
    // Permite ao popup ler a URL da aba e ao comparador ler as buscas das lojas suportadas.
    host_permissions: STORE_MATCHES,
    // Chave pública só para fixar o ID da extensão (hepdplopbcjbpbkghblccdinkjfjfldh) em todo computador.
    // Sem ela, cada pasta gera um ID diferente e o storage.sync ("Meus cupons") não sincroniza entre Mac e Windows.
    // Não é segredo: a chave privada não é usada nem guardada.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk2OaFULVqvAW/I6bDKr/AFRXjo2PaROiu4P6Up25+2wDxUlxqI3JPNWJl6P/a+8oaq5houlcub0TdWQ+RsT3QRk0Ueo9y3f8hOODFALTdEf3jMvJnWrwe2nXB3qoTrU4IKRLHcv8du/Sr/ByTl8LQ8AZW9UXHjr5EhxnOsukWw8W8JiaAi73snZ9u+7nkR4H9BFl2da2xXWiUaSy3ODuHQiR7nhou2uL64XvaTtRIlevc5jQQCVu6kzdvsCLpq4kTk1jAFu0fYAV3nRcR0H6GvgXuy4JzBJxVFK0GRqgCIiDuwHEqZm+GFcuzt/jeQ8hZYSKDwfGchXeFP0ejJiE2wIDAQAB',
  },
});
