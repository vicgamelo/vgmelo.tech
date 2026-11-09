---
title: 'CNPJ alfanumérico: como validar o novo formato (com código)'
description: 'O CNPJ agora aceita letras. Como funciona o dígito verificador com ord(c) − 48, o que quebra nos sistemas e um validador em Python.'
date: 2026-11-09
lang: pt
slug: cnpj-alfanumerico
translation: alphanumeric-cnpj
tags: ['CNPJ', 'Python', 'Dados']
project: mcp-server-brasil
draft: true
---

A Receita Federal mudou o formato do CNPJ: as 12 primeiras posições agora podem ter **letras de A a Z**, e só os dois dígitos verificadores continuam sendo números. A regra vem da IN RFB 2.229/2024. Os CNPJs que já existem não mudam; o que muda é que todo sistema que recebe um CNPJ precisa aceitar os dois formatos.

Quando fui implementar isso no [mcp-server-brasil](https://github.com/vicgamelo/mcp-server-brasil), a conta em si foi a parte fácil. O trabalho de verdade está no que quebra em volta dela.

## O formato

```
12.ABC.345/01DE-35
└──────┬──────┘ └┬┘
 12 posições    2 dígitos verificadores
 (0-9 e A-Z)    (sempre 0-9)
```

A máscara continua igual. Os 8 primeiros caracteres são a raiz, os 4 seguintes a ordem (filial) e os 2 últimos os dígitos verificadores.

## O dígito verificador com letras

O cálculo é o mesmo módulo 11 de sempre. A diferença é como cada caractere vira número: **o valor é o código ASCII menos 48**.

| Caractere | ASCII | Valor |
| --- | --- | --- |
| `0` a `9` | 48 a 57 | 0 a 9 |
| `A` | 65 | 17 |
| `B` | 66 | 18 |
| `Z` | 90 | 42 |

Como `ord("0") - 48 == 0`, os CNPJs só com números dão exatamente o mesmo resultado de antes. Não existe "modo antigo" e "modo novo": é uma regra só.

Os pesos não mudaram:

- primeiro dígito: `5 4 3 2 9 8 7 6 5 4 3 2` sobre as 12 posições;
- segundo dígito: `6 5 4 3 2 9 8 7 6 5 4 3 2` sobre as 12 posições mais o primeiro dígito.

Para cada um: some os produtos, tire o resto da divisão por 11 e use `0` se o resto for menor que 2, senão `11 - resto`.

Com o exemplo oficial `12ABC34501DE`, o `A` vale 17 e entra com peso 3 (produto 51), o `B` vale 18 com peso 2, e assim por diante. No fim dá `35`, os dígitos do exemplo.

## O código

Este é o validador que uso no servidor MCP, sem dependências:

```python
import re

W1 = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
W2 = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)


def normalize_cnpj(cnpj: str) -> str:
    cleaned = re.sub(r"[.\-/\s]", "", cnpj).upper()
    if not re.fullmatch(r"[0-9A-Z]{12}[0-9]{2}", cleaned):
        raise ValueError("CNPJ: 12 posições alfanuméricas + 2 dígitos")
    return cleaned


def digit(chars: str, weights: tuple[int, ...]) -> int:
    total = sum((ord(c) - 48) * w for c, w in zip(chars, weights, strict=True))
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def is_valid_cnpj(cnpj: str) -> bool:
    try:
        v = normalize_cnpj(cnpj)
    except ValueError:
        return False
    if len(set(v)) == 1:  # 00000000000000 passa na conta, mas não é CNPJ
        return False
    d1 = digit(v[:12], W1)
    d2 = digit(v[:12] + str(d1), W2)
    return v[12:] == f"{d1}{d2}"
```

Os testes cobrem os casos que importam: CNPJ numérico válido, o exemplo alfanumérico oficial, dígito trocado, todos os caracteres iguais, tamanho errado e letra no lugar do dígito verificador.

```python
assert is_valid_cnpj("11.222.333/0001-81")
assert is_valid_cnpj("12.ABC.345/01DE-35")
assert not is_valid_cnpj("12.ABC.345/01DE-36")
assert not is_valid_cnpj("12ABC34501DEAB")   # verificador tem que ser número
assert is_valid_cnpj("12abc34501de35")       # minúscula é normalizada
```

Você pode ver a conta passo a passo, caractere por caractere, na [demo do validador](/demos/cnpj/). Ela roda no navegador com a mesma regra e os mesmos casos de teste.

## O que quebra nos sistemas

A validação é a parte pequena. Antes de virar a chave, procure por isto:

1. **Coluna numérica no banco.** CNPJ guardado em `BIGINT` ou `NUMERIC` não aceita letra. Troque para `CHAR(14)` guardando sem máscara e em maiúsculas.
2. **Regex de entrada.** `^\d{14}$` e máscaras de front-end com `9` em todas as posições rejeitam o formato novo.
3. **Zeros à esquerda.** Quem guardava como número já perdia os zeros (`00.000.000/0001-91` virava `191`). Ao migrar a coluna, recomponha com `zfill(14)`.
4. **Ordenação e chaves.** Ordenar CNPJ como número deixa de fazer sentido. Se ele é chave de join entre sistemas, os dois lados precisam migrar juntos.
5. **Maiúsculas e minúsculas.** Normalize para maiúsculas na entrada. `12abc...` e `12ABC...` são o mesmo CNPJ.
6. **Integrações.** APIs, arquivos posicionais e planilhas que tratam o campo como número (o Excel adora converter) vão corromper o valor.

## Para agentes de IA

No [mcp-server-brasil](https://github.com/vicgamelo/mcp-server-brasil), a ferramenta `validar_documento` faz essa validação offline, e `consultar_cnpj` valida antes de chamar a API pública. Isso evita que o agente gaste uma chamada de rede, ou alucine uma empresa, com um CNPJ que nem passa no dígito verificador.

Validar na borda é barato e tira uma classe inteira de erro do caminho, tanto para gente quanto para agente.
