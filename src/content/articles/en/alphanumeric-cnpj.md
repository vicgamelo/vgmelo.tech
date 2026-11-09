---
title: "Brazil's alphanumeric CNPJ: how to validate the new format (with code)"
description: "Brazil's company ID now accepts letters. How the check digit works with ord(c) − 48, what breaks in your systems, and a Python validator."
date: 2026-11-09
lang: en
slug: alphanumeric-cnpj
translation: cnpj-alfanumerico
tags: ['CNPJ', 'Python', 'Data']
project: mcp-server-brasil
draft: true
---

The CNPJ is the national ID of every Brazilian company. Brazil's tax authority (Receita Federal) changed its format: the first 12 positions can now hold **letters A to Z**, and only the two check digits remain numeric. The rule comes from IN RFB 2,229/2024. Existing CNPJs don't change, but every system that receives a CNPJ has to accept both formats.

When I implemented it in [mcp-server-brasil](https://github.com/vicgamelo/mcp-server-brasil), the math was the easy part. The real work is in what breaks around it.

## The format

```
12.ABC.345/01DE-35
└──────┬──────┘ └┬┘
 12 positions   2 check digits
 (0-9 and A-Z)  (always 0-9)
```

The mask is the same as before. The first 8 characters are the company root, the next 4 the branch, and the last 2 the check digits.

## The check digit with letters

It's the same modulo 11 as always. What changes is how each character becomes a number: **its value is the ASCII code minus 48**.

| Character | ASCII | Value |
| --- | --- | --- |
| `0` to `9` | 48 to 57 | 0 to 9 |
| `A` | 65 | 17 |
| `B` | 66 | 18 |
| `Z` | 90 | 42 |

Since `ord("0") - 48 == 0`, numeric CNPJs give exactly the same result as before. There's no "old mode" and "new mode": it's a single rule.

The weights are unchanged:

- first digit: `5 4 3 2 9 8 7 6 5 4 3 2` over the 12 positions;
- second digit: `6 5 4 3 2 9 8 7 6 5 4 3 2` over the 12 positions plus the first digit.

For each one, sum the products and take the remainder of division by 11. The digit is `0` if the remainder is less than 2, otherwise `11 - remainder`.

With the official example `12ABC34501DE`, `A` is worth 17 and gets weight 3 (product 51), `B` is worth 18 with weight 2, and so on. The result is `35`, the example's check digits.

## The code

This is the validator I use in the MCP server, with no dependencies:

```python
import re

W1 = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
W2 = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)


def normalize_cnpj(cnpj: str) -> str:
    cleaned = re.sub(r"[.\-/\s]", "", cnpj).upper()
    if not re.fullmatch(r"[0-9A-Z]{12}[0-9]{2}", cleaned):
        raise ValueError("CNPJ: 12 alphanumeric positions + 2 digits")
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
    if len(set(v)) == 1:  # 00000000000000 passes the math but isn't a CNPJ
        return False
    d1 = digit(v[:12], W1)
    d2 = digit(v[:12] + str(d1), W2)
    return v[12:] == f"{d1}{d2}"
```

The tests cover the cases that matter: a valid numeric CNPJ, the official alphanumeric example, a wrong digit, all-identical characters, wrong length and a letter in the check digit position.

```python
assert is_valid_cnpj("11.222.333/0001-81")
assert is_valid_cnpj("12.ABC.345/01DE-35")
assert not is_valid_cnpj("12.ABC.345/01DE-36")
assert not is_valid_cnpj("12ABC34501DEAB")   # check digits must be numeric
assert is_valid_cnpj("12abc34501de35")       # lowercase is normalized
```

You can see the math step by step, character by character, in the [validator demo](/en/demos/cnpj/). It runs in your browser with the same rule and the same test cases.

## What breaks in your systems

Validation is the small part. Before the switch, look for:

1. **Numeric database columns.** A CNPJ stored as `BIGINT` or `NUMERIC` can't hold a letter. Move to `CHAR(14)`, stored without the mask and in uppercase.
2. **Input regexes.** `^\d{14}$` and front-end masks with `9` in every position reject the new format.
3. **Leading zeros.** If you stored it as a number you were already losing them (`00.000.000/0001-91` became `191`). When migrating the column, rebuild them with `zfill(14)`.
4. **Sorting and keys.** Sorting CNPJs as numbers stops making sense. If it's a join key between systems, both sides must migrate together.
5. **Case.** Normalize to uppercase on input. `12abc...` and `12ABC...` are the same CNPJ.
6. **Integrations.** APIs, fixed-width files and spreadsheets that treat the field as a number (Excel loves to convert it) will corrupt the value.

## For AI agents

In [mcp-server-brasil](https://github.com/vicgamelo/mcp-server-brasil), the `validar_documento` tool does this validation offline, and `consultar_cnpj` validates before calling the public API. That keeps the agent from wasting a network call, or hallucinating a company, on a CNPJ that doesn't even pass the check digit.

Validating at the edge is cheap and removes a whole class of errors, for people and agents alike.
