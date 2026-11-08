# Discount Beast

Extensão pessoal do Chrome que encontra e testa cupons de desconto na Amazon, Mercado Livre, adidas, Netshoes, Centauro, Magalu, AliExpress, Shopee, KaBuM!, Pichau e Terabyte.

## Status

- [x] Passo 1: base da extensão (detecta as lojas e mostra um popup)
- [x] Passo 2: coletor de cupons grátis (GitHub Actions + JSON)
- [x] Passo 3: testar cupons automaticamente no carrinho da adidas
- [x] Meus cupons: cole seus códigos pessoais no popup
- [x] Testar cupons também na Netshoes e na Centauro
- [x] Comparar preço: adidas, Netshoes, Centauro, Mercado Livre, Amazon e Magalu
- [x] Informática: cupons e comparador na KaBuM!, Pichau e Terabyte
- [x] Avisar quando o preço baixar (alerta de preço, sincronizado entre computadores)

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

Abra qualquer uma das lojas: o ícone ganha um ✓ verde e o popup mostra os cupons públicos daquela loja. Clique num código para copiar.

### Testar cupons na adidas

1. Abra o seu carrinho na adidas.com.br.
2. Um cartão do Discount Beast aparece no canto de baixo, à direita.
3. Clique em **Testar cupons** e não mexa na página enquanto ele trabalha (leva uns 5 segundos por cupom).
4. A extensão aplica cada código, anota o Total, tira e passa para o próximo. No fim deixa aplicado o que deixou o Total mais baixo.

Ela lembra o resultado de cada código (só no seu Chrome). Códigos recusados ficam 3 dias sem ser testados de novo, e no máximo 15 códigos são testados por vez.

### Meus cupons

Recebeu um código por e-mail, app ou adiClub? Abra o popup, escolha a loja em **Meus cupons**, cole o código (pode colar vários, separados por vírgula ou um por linha) e clique em **Salvar**. Na adidas, os seus códigos entram no teste antes dos públicos. Eles ficam só no `storage.local` do seu Chrome e nunca vão para o GitHub.

### Comparar preço

1. Abra a página de um produto na adidas, Netshoes, Centauro, KaBuM!, Pichau, Terabyte, Magalu, Amazon ou Mercado Livre. Na sacola da Magalu o cartão também aparece (com vários itens, escolha qual comparar).
2. O cartão **Comparar preço** aparece no canto de baixo, à esquerda.
3. Clique em **Comparar preço**. A extensão abre a busca das outras lojas do mesmo tipo (esporte: adidas, Netshoes, Centauro; informática: KaBuM!, Pichau, Terabyte) e também do Mercado Livre, Amazon e Magalu em abas de fundo (numa loja de tudo, como Magalu ou Amazon, o tipo vem do produto: uma TV busca também na KaBuM!, Pichau e Terabyte), lê os resultados e fecha as abas. Leva uns 15 segundos.
4. O cartão mostra o preço do mesmo modelo em cada loja, sem frete. Passe o mouse no nome do item para ver por que ele foi considerado o mesmo produto.

Como decide que é o mesmo produto: pelo EAN ou código do modelo, quando aparece; senão, a marca tem de ser a mesma, o tipo (tênis, camisa...) e o público (masculino/feminino) não podem ser diferentes, e as palavras do modelo têm de bater. Cor e tamanho não contam.

Em informática a regra é mais rígida, porque cada versão tem outro preço: o código de peça (ex.: `DUAL-RTX4060-O8G`), o número do modelo (RTX 4060 x 4070), a versão (4060 x 4060 Ti, 5600 x 5600X) e a capacidade (SSD 1TB x 500GB) têm de ser os mesmos.

Não usa servidor nem API paga: a busca é feita pelo seu próprio Chrome, como se você pesquisasse.

### Avisar quando o preço baixar

1. No cartão **Comparar preço**, clique em **🔔 Avisar quando baixar**. A extensão confere uma vez na hora (em silêncio) para saber o menor preço de hoje em todas as lojas, inclusive a de onde você marcou.
2. A cada 6 horas ela confere de novo, numa janela minimizada (as abas não aparecem na sua janela). Se algum preço ficar abaixo do menor já visto, aparece um aviso do Chrome; clique nele para abrir o anúncio.
3. A lista fica no popup em **Vigiando preços** (com **Conferir agora** e × para parar). Ela sincroniza entre os Chromes logados na mesma conta Google, e quem conferiu primeiro avisa: o outro computador não repete o aviso.

Limites: só confere com o Chrome aberto (ao abrir, confere o que ficou mais de 6 h sem conferir). No máximo 30 produtos. Aviso a partir de R$ 0,50 de queda.

## Como os cupons chegam na extensão

1. O GitHub Actions roda o coletor ([`collector/`](collector/)) todo dia às 6h e às 18h (horário de Brasília).
2. O coletor lê as páginas de cupons do **Promobit**, **Méliuz**, **Cuponomia**, **Cuponation** e **Cuponeria** para cada loja, junta tudo, tira repetidos e vencidos.
3. O resultado vai para [`data/coupons.json`](data/coupons.json), que fica público no GitHub.
4. A extensão baixa esse arquivo ao abrir o Chrome e a cada 6 horas.

Custo: zero. Não tem servidor nem banco de dados.

Para rodar a coleta na hora: aba **Actions** do repositório → **Coletar cupons** → **Run workflow**.
Se uma coleta falhar, o GitHub manda um e-mail para você.

## Desenvolvimento

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Abre um Chrome de teste com a extensão e recarrega a cada mudança no código |
| `npm run build` | Gera a versão final em `.output/chrome-mv3` |
| `npm run check` | Confere os tipos do TypeScript |
| `npm run collect` | Roda o coletor de cupons no seu computador e atualiza `data/coupons.json` |
| `npm test` | Roda os testes do coletor e do testador de cupons |

## Estrutura

```
entrypoints/
  background.ts      # roda em segundo plano, marca o ícone quando você está numa loja
  store.content.ts   # roda dentro das páginas das lojas
  adidas-cart.content.ts  # cartão "Testar cupons" no carrinho da adidas
  popup/             # janelinha que abre ao clicar no ícone
lib/
  stores.ts          # lista das lojas suportadas
  messages.ts        # formato das mensagens entre as partes da extensão
  coupons.ts         # formato do data/coupons.json
  coupon-store.ts    # baixa e guarda os cupons dentro da extensão
  coupon-runner.ts   # testa os cupons um a um e escolhe o melhor (serve para qualquer loja)
  coupon-history.ts  # lembra o que cada código fez da última vez
  codes.ts           # lê os códigos colados e junta com os públicos
  my-coupons.ts      # "Meus cupons": guarda seus códigos pessoais no Chrome
  carts/adidas.ts    # como mexer no carrinho da adidas (seletores ficam aqui)
collector/
  collect.ts         # coletor que roda no GitHub Actions
  merge.ts           # junta cupons de várias fontes sem repetir
  sources/           # um arquivo por site de cupons (promobit, meliuz, cuponomia, cuponation, cuponeria)
data/
  coupons.json       # cupons coletados (atualizado pelo robô, não edite à mão)
.github/workflows/
  collect-coupons.yml  # agenda do coletor
```

Feito com [WXT](https://wxt.dev) e TypeScript.
