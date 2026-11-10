---
title: 'Champion/challenger in MLflow: promote models on evidence, not faith'
description: 'How I set up credit model promotion with quality, calibration and fairness gates, MLflow aliases and one-command rollback, plus the type bug that marked the champion as rejected.'
date: 2026-11-09
lang: en
slug: champion-challenger-in-mlflow
translation: champion-challenger-mlflow
tags: ['MLOps', 'MLflow', 'Credit']
project: mlops-platform
draft: false
---

Training a better model is the fun part. The part that causes trouble is **replacing the model in production**: who decides the new one is better, based on what, and how do you go back if it goes wrong?

In [mlops-platform](https://github.com/vicgamelo/mlops-platform) I built that flow end to end for a credit risk model on the German Credit dataset. The core idea: **a model only becomes champion if it passes gates written in code**, and serving follows the champion on its own.

## The roles: candidate, champion and previous

The MLflow Model Registry has *aliases*, names that point to a model version. I use three states:

- every training run registers a new version as a **candidate**;
- **`@champion`** is the version serving uses;
- **`@previous`** is the former champion, kept for rollback.

Serving loads `models:/credit-risk@champion` and checks the alias periodically. Promoting or rolling back just moves a pointer, with no deploy and no restart.

## The promotion gates

The candidate is scored on a separate evaluation set that neither training nor cross-validation saw. It's promoted only if it passes all of these:

| Gate | Rule | Why |
| --- | --- | --- |
| Quality floor | AUC ≥ 0.70 | never promote something bad, even with no champion |
| Real gain | AUC ≥ champion AUC + 0.005 | training noise isn't improvement |
| Calibration | Brier ≤ champion Brier + 0.01 | in credit, the probability becomes price and limit |
| Fairness | AUC gap between age < 25 and ≥ 25 ≤ 0.15 | the model can't work well for only one group |

```python
@dataclass(frozen=True)
class Gates:
    min_auc: float = 0.70
    min_auc_gain: float = 0.005
    max_brier_increase: float = 0.01
    max_age_auc_gap: float = 0.15
```

Two points I consider important:

- **The minimum gain exists because retraining on the same data gives a "different" model that's almost identical.** Without it, every retrain would swap the champion for noise. In the real run, retraining on the same data was **rejected**, as it should be.
- **Calibration is checked separately from AUC.** A model can rank customers better (higher AUC) and still get the probability more wrong. In credit, where the probability becomes rate and limit, that's worse than a slightly lower AUC.

Every decision is recorded on the version itself, with `status` and `gate_result` tags saying why it passed or failed. Six months later you can answer "why is this model in production?" without relying on anyone's memory.

## The numbers

On German Credit (1,000 customers, 30% defaults), with `personal_status` (which encodes sex) and `foreign_worker` left out of the model:

- cross-validation: gradient boosting at AUC 0.788, the best of the candidates;
- holdout: AUC 0.773;
- promotion evaluation set: AUC 0.766;
- AUC gap between age groups: 0.004.

It's not a number to win competitions. It's an honest number, measured on a set nobody used to choose anything.

## One-command rollback

```bash
mlops rollback
```

Rollback swaps `@champion` and `@previous`. Serving notices on its next check (every 30 s by default) and starts answering with the previous model. Since that model was already validated and already ran in production, it's the safest way out of an incident.

## The bug: the champion rejected by itself

Promotion starts by checking whether the candidate already is the champion:

```python
champion = current_champion(client, name)   # came from MLflow
if champion == challenger:                  # challenger came from the CLI, as text
    return Decision(False, ..., ["challenger is already the champion"])
```

MLflow returned the version as a **number** (`3`), and the CLI passed it as **text** (`"3"`). `3 == "3"` is false in Python. So running promotion again for the current champion evaluated the model against itself. Zero gain, below 0.005, so it was **rejected and tagged `status=rejected` while still serving in production**. The audit trail started lying.

The fix is to normalize versions to strings at every entry point. Before the fix, I wrote a test that promotes, runs again with the same version and checks that nothing changes. It failed without the fix.

It's the kind of bug no test with toy data would catch: it only shows up when the type comes from the real MLflow.

## Drift closes the loop

Promoting well is useless if the world changes afterwards. The same project computes each feature's **PSI** (Population Stability Index), comparing production with training. Above 0.25 is major drift, and the retraining workflow runs. The new model goes through the same gates, and only gets in if it's better.

You can play with PSI in the [drift demo](/en/demos/drift/) and ask the current champion for a score in the [credit demo](/en/demos/credit/).
