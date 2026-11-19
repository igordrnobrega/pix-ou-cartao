# PIX ou Cartão?

Calculadora para decidir entre pagar no PIX com desconto ou no cartão parcelado sem juros
(cashback e desconto por antecipar as parcelas).
Pensada para o Nubank Ultravioleta, mas os parâmetros são editáveis.

**Use online:** https://pix-ou-cartao.nobrega.page/ (GitHub Pages, publicado a cada push na `main`).

Tudo roda no navegador; nada é enviado a lugar nenhum.

## Como a conta funciona

Cada opção vira um **custo hoje**: quanto você precisaria separar agora, aplicado no seu
rendimento (CDI bruto × % do CDI, menos IR pela tabela regressiva), para pagar tudo nas datas
certas. O cashback abate pelo mesmo critério. Ganha o menor custo hoje.

- **PIX**: paga o preço do PIX agora.
- **Cartão**: parcela e antecipa tudo; paga o preço menos o desconto (do app, ou estimado à taxa da antecipação) na 1ª fatura.

O app do Nu mostra o rendimento líquido de IR (CDI de 13,65% aparece como 10,58% com 22,5% de IR).
A calculadora pede o CDI bruto e desconta o IR à parte.

A lógica fica em `src/calc.ts`, com testes em `src/calc.test.ts`.

## Desenvolvimento

```bash
docker compose up        # http://localhost:5174
```

Testes e build (os mesmos do CI):

```bash
docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c 'npm ci && npm test && npm run build'
```

Cada push na `main` publica `dist/` no GitHub Pages pelo workflow `.github/workflows/ci.yml`.
