# Disposição de Acessórios

Página de consulta que mostra o que tem dentro de cada armário do estoque de
acessórios. Cada armário tem um QR Code para colar na porta: quem aponta a
câmera cai direto na lista daquele armário.

**Página no ar:** https://gildoviske.github.io/disposicao-acessorios/

A página é montada a partir de uma planilha Excel de controle interno. Tudo
roda no navegador, sem servidor, sem banco e sem nenhuma biblioteca externa —
um arquivo HTML só, que funciona até offline.

## Como funciona

`gerar_pagina.py` lê a planilha, extrai as abas de armário e a aba de saldos, e
injeta os dados como JSON dentro de `template.html`, produzindo os arquivos
finais. A planilha é apenas lida, nunca gravada.

```
planilha .xlsx  →  gerar_pagina.py  →  index.html
                                       artifact.html
```

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `gerar_pagina.py` | Lê a planilha e monta a página. É o que você roda. |
| `template.html` | Layout e comportamento. Mexa aqui para mudar o visual. |
| `qr.js` | Gerador de QR Code próprio, sem dependências. |
| `index.html` | **Gerado.** É o que o GitHub Pages publica. |
| `artifact.html` | **Gerado.** Mesmo conteúdo, sem `<head>`, para publicar como artifact. |

## Atualizar

Depois de mexer na planilha, na pasta do projeto:

```bash
python gerar_pagina.py
```

Depois, `git add`, `commit` e `push`. O Pages republica sozinho no mesmo
endereço, então os QR Codes já colados nos armários continuam valendo.

O caminho da planilha fica na constante `PLANILHA`, no começo do
`gerar_pagina.py`.

## O que a página mostra

- **Início** — busca geral que responde "onde está isso?". Ignora acento e
  aceita palavras soltas em qualquer ordem: `aluminio veicular` encontra
  "CARREGADOR VEICULAR DE ALUMÍNIO...". O resultado diz o armário e a prateleira.
- **Armário** — itens agrupados por prateleira, com quantidade e referência.
- **Conferência** — chave que revela o saldo do sistema e a diferença de cada
  item. Fica desligada por padrão, para quem só quer achar o produto não se
  perder no meio dos números.

As etiquetas de status (falta física, sobra física, sem cadastro) vêm da
planilha. Item que confere não recebe etiqueta, para não poluir a lista.

Uma mesma referência pode ocupar mais de uma prateleira do mesmo armário. Nesse
caso o saldo do sistema e a diferença são da referência inteira, não da
prateleira; com a conferência ligada aparece também o total da referência no
armário, para a conta fechar.

## QR Codes

Em **Gerar QR Codes dos armários**, confira o campo **Endereço da página** antes
de imprimir — é exatamente esse endereço que vai dentro do QR. Precisa ser o
endereço público, o que abre no celular de qualquer pessoa. `file://` ou
`localhost` não funcionam, e a página avisa quando detecta isso.

**Imprimir etiquetas** gera a folha com os 9 QR Codes, 2 por linha, com linha
tracejada para recortar. Cada QR aponta para `ENDEREÇO#/arm/N`.

## Sobre o `qr.js`

Gerador de QR Code escrito do zero, porque a página não pode carregar biblioteca
externa. Modo byte, correção de erro nível M, versões 1 a 10, com seleção
automática de versão e de máscara pelas quatro regras de penalidade da norma.

Foi validado contra uma implementação de referência: de 20 textos de teste, 19
produzem matrizes idênticas bit a bit (a exceção usa modo alfanumérico, também
válido), e a decodificação foi confirmada com um leitor real.
