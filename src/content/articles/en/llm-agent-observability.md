---
title: 'Observability for AI agents with OpenTelemetry: the minimum that works'
description: "What to record for every agent run (traces, tokens, cost and latency), how to follow OpenTelemetry's GenAI conventions, and the bugs that show up when agents run in parallel."
date: 2026-11-09
lang: en
slug: llm-agent-observability
translation: observabilidade-de-agentes
tags: ['Observability', 'OpenTelemetry', 'Agents']
project: genai-lens
draft: true
---

An agent in production is a program that decides by itself how many times to call the model, which tools to use and in what order. When the answer is wrong, takes 40 seconds or the monthly bill doubles, the question is always the same: **what did it do on that run?**

Scattered logs don't answer that. To answer it I built [genai-lens](https://github.com/vicgamelo/genai-lens), an LLM observability collector and dashboard that runs in a single container. Here's what I learned about the minimum that needs to exist.

## Every run is a trace, every step is a span

The mental model that works is distributed tracing:

- the agent **run** is a trace;
- every **model call** is an `llm` span with model, input and output tokens, and latency;
- every **tool call** is a `tool` span, a child of the step that requested it;
- when an agent **delegates** to another, the sub-agent is an `agent` span with its own children.

```
coordinator (agent)                    ███████████████████████  8.2 s
├─ llm.complete (llm)                  ██                       0.9 s
├─ economist (agent)                     ████████████           4.1 s
│  ├─ llm.complete                       ██
│  └─ tool.indicador_economico            ███
└─ company_researcher (agent)            ██████████████         4.8 s
   └─ tool.consultar_cnpj                  ████
```

With that tree you see at a glance where the time went, who spent the tokens and which tool failed.

## The attributes that matter

OpenTelemetry has semantic conventions for GenAI. Following them instead of inventing names lets any instrumented library send data to the same place. The attributes genai-lens uses:

| Attribute | What for |
| --- | --- |
| `gen_ai.operation.name` | span type (chat, tool, agent) |
| `gen_ai.request.model` / `gen_ai.response.model` | the model requested and the one that actually answered |
| `gen_ai.provider.name` | Anthropic, OpenAI, Ollama… |
| `gen_ai.usage.input_tokens` / `output_tokens` | the basis for cost |

One practical detail: older libraries still send `gen_ai.usage.prompt_tokens` and `completion_tokens`, and `gen_ai.system` instead of `provider.name`. The collector accepts both. Without that, half the spans arrive with no tokens and cost is underestimated without anyone noticing.

## Cost is derived, not measured

No provider returns the cost in the response. It comes from `tokens × price`, and the price depends on the model. Two lessons:

1. **Longest prefix wins.** Model names come with dates and suffixes. A price table keyed by prefix (`claude-haiku`, `gpt-4.1-mini`…) with longest-prefix lookup covers the variants without an update for every release.
2. **Compute it at ingestion, not at query time.** Storing cost on the span makes history reflect the price at the time. If the price changes, the past doesn't change with it.

## The SDK must never take the app down

The most important rule for an observability library: **it can't be the cause of the incident**. In the genai-lens SDK:

- spans go into a queue and are sent in batches by a background thread; the user's request never waits on the collector;
- if the collector is down, the SDK drops and moves on; no exception reaches user code;
- trace context uses `contextvars`, so concurrent `async` tasks don't mix traces.

```python
from genai_lens import Lens

lens = Lens(endpoint="http://localhost:8080", api_key="dev-key", project="support-bot")

@lens.trace(kind="agent")
def answer(question: str) -> str:
    with lens.span("anthropic.messages", kind="llm") as span:
        resp = client.messages.create(model="claude-haiku-5-5", max_tokens=500,
                                      messages=[{"role": "user", "content": question}])
        span.set_llm(model=resp.model, provider="anthropic",
                     input_tokens=resp.usage.input_tokens,
                     output_tokens=resp.usage.output_tokens)
        span.set_io(input=question, output=resp.content[0].text)
    return resp.content[0].text
```

## Prompts are personal data

Whatever users type ends up in the trace. That includes emails, ID numbers, phone numbers and, alarmingly often, API keys pasted by mistake. genai-lens masks these patterns **before storing** and truncates long texts. Masking at display time doesn't help: the data is already in the database and in the backups.

## The parallelism bug

[agent-orchestrator](https://github.com/vicgamelo/agent-orchestrator) runs independent tool calls in parallel. When I connected the two projects, the dashboard showed a scrambled waterfall: one specialist's children appeared in the middle of the other's.

The cause: I sorted rows by start time. With two branches running at once, the timestamps interleave. The fix was to order by **the tree**, a depth-first walk from the root with siblings sorted by time. It's a bug that only shows up with real parallelism, and the kind of thing you only find by looking at real traces.

## Where to start

If you have an agent in production with none of this, start with three numbers per run, **tokens, cost and latency**, plus the span tree. That's enough to answer "why was it slow", "why was it expensive" and "where did it break". Quality evaluation comes next, and it's much easier when every answer already has a trace you can open.

You can see a real trace in the [agents demo](/en/demos/agents/): every question produces the full waterfall.
