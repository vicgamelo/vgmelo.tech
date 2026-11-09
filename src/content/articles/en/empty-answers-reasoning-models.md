---
title: 'When the reasoning model says nothing: the silent agent bug'
description: 'A reasoning model returned empty answers and my orchestrator counted them as success. The two causes, the fix (one extra request, then an explicit error) and the tests that catch it.'
date: 2026-11-09
lang: en
slug: empty-answers-reasoning-models
translation: resposta-vazia-modelos-raciocinio
tags: ['Agents', 'LLM', 'Ollama']
project: agent-orchestrator
draft: false
---

Running [agent-orchestrator](https://github.com/vicgamelo/agent-orchestrator) with `qwen3.5:9b` locally on Ollama, some answers came back incomplete: exactly the part that depended on one of the specialists was missing. No error in the log, no exception. In the trace, the specialist showed as **completed successfully**, with an **empty** output.

It's the worst kind of failure in an agent: the one that doesn't look like a failure.

## What the agent loop did

A tool-using agent loop always looks about the same:

1. send the messages to the model;
2. if the response has tool calls, run them and go back to step 1;
3. if it doesn't, **the response is the final text**.

Step 3 had a hidden assumption: "no tools, so there's text". With regular models that almost always holds. With reasoning models, it doesn't.

## The two causes

**1. Reasoning eats the token limit.** Models like qwen3.5 think before answering, and Ollama returns that thinking in a separate field. Those tokens count toward `max_tokens`. With the limit at 1024, the model spent all of it thinking and the `content` field came back empty. The loop didn't look at `finish_reason`, which is where that cutoff shows up (`length`).

**2. The prompt gave it permission to say nothing.** The specialist's instruction was *"Report only what the tools return."* After calling the tools, the model sometimes concluded it had already "reported" what the tools returned, and ended its turn with no text. As far as it was concerned, it had followed the instruction.

In both cases the loop got zero tool calls and empty text, and returned that as the final answer with a success status. The coordinator received an empty result from a "successful" specialist and carried on with what it had.

## The fix

Before touching the loop, I wrote the test that reproduces it: a scripted model that calls a tool and then returns empty text. The test requires the result to be an error, not a success. It failed, as expected.

The fix has three parts:

**An empty answer is never success.** With no tool calls and no text, the agent doesn't finish as if all were well.

**One extra request, only once.** On the first empty answer, the agent appends a message asking for the final answer and tries again:

```python
NUDGE = "Write your final answer to the user now, based on the tool results above."

if not resp.tool_calls and not resp.text.strip():
    if not nudged and step < cfg.max_steps:
        nudged = True
        messages.append(Message(role="user", content=NUDGE))
        continue
    note = f"error: model returned an empty response (stop_reason={resp.stop_reason})"
    agent_span.status, agent_span.error = "error", note
    await ctx.emit(Event("error", self.name, ctx.depth, {"message": note}))
    return AgentResult(note, "error", messages, step)
```

When the model just forgot to close its answer, that's enough. If the second answer is empty too, the agent **fails explicitly**, with the `stop_reason` in the message. The span becomes an error in the trace, the error event reaches the client over the stream, and the coordinator knows that specialist delivered nothing.

**Config and prompt.** The agents' `max_tokens` went up to 4096, to fit both the reasoning and the answer. And the prompts now require a closing answer: instead of "report only what the tools return", it's *"base every fact on tool results, and always finish with a short answer"*. The constraint against making things up stays, but it no longer licenses silence.

A second test covers the fix's happy path: empty answer, extra request, and the model answers. The result is a success, with the second response's text.

## Why the request is limited to once

Repeating the request until text arrives sounds more robust, but it turns a broken model into a loop that burns tokens until the budget runs out. One extra attempt recovers the "forgot to answer" cases. If the model still doesn't answer, the problem is something else (token limit, prompt, wrong model for the task), and the person running the system needs to know, not one more call.

## What I took from it

- **Treat an empty answer as an error in every agent loop.** It's one line of code, and it keeps a failure from passing as success.
- **Look at `stop_reason`.** `length` on a final answer is almost always a token limit too short for a model that reasons.
- **Be careful with restrictive instructions.** "Answer only X" can be read as "no need to answer". Say what the model should deliver, not just what it can't do.
- **Test with the real model.** The scripted model in the tests would never have shown this. It was running the real qwen3.5, and looking at the trace in [genai-lens](https://github.com/vicgamelo/genai-lens), that made the problem visible.

You can run the agents and see each run's trace in the [agents demo](/en/demos/agents/).
