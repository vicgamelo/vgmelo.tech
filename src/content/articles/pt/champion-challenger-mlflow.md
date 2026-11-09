---
title: 'Champion/challenger no MLflow: promover modelo com critério, não com fé'
description: 'Como montei a promoção de modelos de crédito com critérios de qualidade, calibração e justiça, aliases no MLflow e rollback com um comando, e o bug de tipo que marcava o campeão como reprovado.'
date: 2026-11-09
lang: pt
slug: champion-challenger-mlflow
translation: champion-challenger-in-mlflow
tags: ['MLOps', 'MLflow', 'Crédito']
project: mlops-platform
draft: true
---

Treinar um modelo melhor é a parte divertida. A parte que dá problema é **trocar o modelo que está em produção**: quem decide que o novo é melhor, com base em quê, e como volta atrás se der errado?

No [mlops-platform](https://github.com/vicgamelo/mlops-platform) montei esse fluxo de ponta a ponta para um modelo de risco de crédito, usando o dataset German Credit. A ideia central: **um modelo só vira campeão se passar por critérios escritos em código**, e o serving segue o campeão sozinho.

## Os papéis: candidate, champion e previous

O MLflow Model Registry tem *aliases*, nomes que apontam para uma versão do modelo. Uso três estados:

- todo treino registra uma versão nova como **candidata**;
- **`@champion`** é a versão que o serving usa;
- **`@previous`** é o campeão anterior, guardado para o rollback.

O serving carrega `models:/credit-risk@champion` e confere o alias de tempos em tempos. Promover ou voltar atrás é só mover um ponteiro, sem deploy e sem reiniciar nada.

## Os critérios de promoção

A candidata é avaliada num conjunto de avaliação separado, que nem o treino nem a validação cruzada viram. Ela só é promovida se passar em todos:

| Critério | Regra | Por quê |
| --- | --- | --- |
| Piso de qualidade | AUC ≥ 0,70 | não promover nada ruim, mesmo sem campeão |
| Ganho real | AUC ≥ AUC do campeão + 0,005 | ruído de treino não é melhoria |
| Calibração | Brier ≤ Brier do campeão + 0,01 | em crédito a probabilidade vira preço e limite |
| Justiça | diferença de AUC entre idades < 25 e ≥ 25 ≤ 0,15 | o modelo não pode funcionar bem só para um grupo |

```python
@dataclass(frozen=True)
class Gates:
    min_auc: float = 0.70
    min_auc_gain: float = 0.005
    max_brier_increase: float = 0.01
    max_age_auc_gap: float = 0.15
```

Dois pontos que considero importantes:

- **O ganho mínimo existe porque retreinar com os mesmos dados dá um modelo "diferente" quase igual.** Sem esse limite, cada retreino trocaria o campeão por ruído. No teste real, retreinar com os mesmos dados foi **reprovado**, como deveria.
- **Calibração entra separada da AUC.** Um modelo pode ordenar melhor os clientes (AUC maior) e errar mais a probabilidade. Em crédito, onde a probabilidade vira taxa e limite, isso é pior que uma AUC um pouco menor.

Cada decisão fica registrada na própria versão, com tags `status` e `gate_result` dizendo por que passou ou foi reprovada. Seis meses depois, dá para responder "por que esse modelo está em produção?" sem depender da memória de ninguém.

## Os números

No German Credit (1.000 clientes, 30% inadimplentes), com `personal_status` (que codifica sexo) e `foreign_worker` fora do modelo:

- validação cruzada: gradient boosting com AUC 0,788, o melhor entre os candidatos;
- holdout: AUC 0,773;
- conjunto de avaliação da promoção: AUC 0,766;
- diferença de AUC entre faixas de idade: 0,004.

Não é um número para impressionar em competição. É um número honesto, medido num conjunto que ninguém usou para escolher nada.

## Rollback com um comando

```bash
mlops rollback
```

O rollback troca `@champion` e `@previous`. O serving percebe a troca na próxima checagem (a cada 30 s por padrão) e passa a responder com o modelo anterior. Como o anterior já foi validado e já esteve em produção, essa é a saída mais segura num incidente.

## O bug: o campeão reprovado por ele mesmo

A promoção começa conferindo se a candidata já é o campeão:

```python
champion = current_champion(client, name)   # vinha do MLflow
if champion == challenger:                  # challenger vinha da CLI, como texto
    return Decision(False, ..., ["challenger is already the champion"])
```

O MLflow devolvia a versão como **número** (`3`), e a CLI passava como **texto** (`"3"`). `3 == "3"` é falso em Python. Resultado: rodar a promoção de novo para o campeão atual fazia o modelo ser avaliado contra ele mesmo. Ganho zero, abaixo dos 0,005, então ele era **reprovado e marcado `status=rejected`, enquanto continuava servindo em produção**. O registro de auditoria passava a mentir.

A correção é normalizar as versões para texto em todos os pontos de entrada. Antes dela, escrevi o teste que promove, roda de novo com a mesma versão e confere que nada muda. Ele falhava sem a correção.

É o tipo de bug que nenhum teste com dados de brinquedo acharia: só aparece quando o tipo vem do MLflow de verdade.

## Drift fecha o ciclo

Promover bem não adianta se o mundo muda depois. O mesmo projeto calcula o **PSI** (Population Stability Index) de cada variável, comparando produção com treino. Acima de 0,25 é drift grande, e o workflow de retreino roda. O novo modelo passa pelos mesmos critérios, e só entra se for melhor.

Você pode brincar com o PSI na [demo de drift](/demos/drift/) e pedir um score ao campeão atual na [demo de crédito](/demos/credito/).
