# Discount Beast

Extensão pessoal do Chrome que encontra e testa cupons de desconto na Amazon, Mercado Livre, adidas, Netshoes, Centauro e Magalu.

## Status

- [x] Passo 1: base da extensão (detecta as lojas e mostra um popup)
- [ ] Passo 2: coletor de cupons grátis (GitHub Actions + JSON)
- [ ] Passo 3: aplicar cupons automaticamente em uma loja
- [ ] Passo 4: expandir para as outras lojas e comparar preços

## Como instalar no seu Chrome

Você precisa do [Node.js](https://nodejs.org) (versão 20 ou mais nova) instalado.

```bash
git clone https://github.com/FilipeFilpa/discount-beast.git
cd discount-beast
npm install
npm run build
```

Depois:

1. Abra `chrome://extensions` no Chrome.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `.output/chrome-mv3`.
4. Fixe o ícone do Discount Beast na barra do Chrome.

Abra qualquer uma das lojas: o ícone ganha um ✓ verde e o popup mostra a loja detectada.

## Desenvolvimento

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Abre um Chrome de teste com a extensão e recarrega a cada mudança no código |
| `npm run build` | Gera a versão final em `.output/chrome-mv3` |
| `npm run check` | Confere os tipos do TypeScript |

## Estrutura

```
entrypoints/
  background.ts      # roda em segundo plano, marca o ícone quando você está numa loja
  store.content.ts   # roda dentro das páginas das lojas
  popup/             # janelinha que abre ao clicar no ícone
lib/
  stores.ts          # lista das lojas suportadas
  messages.ts        # formato das mensagens entre as partes da extensão
```

Feito com [WXT](https://wxt.dev) e TypeScript.
