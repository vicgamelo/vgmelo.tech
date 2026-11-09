---
title: 'Quando o modelo com raciocínio responde nada: o bug silencioso dos agentes'
description: 'Um modelo com raciocínio devolvia resposta vazia e o meu orquestrador contava isso como sucesso. As duas causas, a correção (um pedido extra e depois erro explícito) e os testes que pegam o caso.'
date: 2026-11-09
lang: pt
slug: resposta-vazia-modelos-raciocinio
translation: empty-answers-reasoning-models
tags: ['Agentes', 'LLM', 'Ollama']
project: agent-orchestrator
draft: false
---

Rodando o [agent-orchestrator](https://github.com/vicgamelo/agent-orchestrator) com o `qwen3.5:9b` local no Ollama, algumas respostas voltavam incompletas: faltava justamente a parte que dependia de um dos especialistas. Nenhum erro no log e nenhuma exceção. No trace, o especialista aparecia como **concluído com sucesso**, com a saída **vazia**.

É o pior tipo de falha num agente: a que não parece falha.

## O que o loop do agente fazia

O loop de um agente com ferramentas é sempre parecido:

1. manda as mensagens para o modelo;
2. se a resposta tem chamadas de ferramenta, executa e volta para o passo 1;
3. se não tem, **a resposta é o texto final**.

O passo 3 tinha uma suposição escondida: "sem ferramenta, então tem texto". Com modelos comuns isso quase sempre vale. Com modelos de raciocínio, não.

## As duas causas

**1. O raciocínio come o limite de tokens.** Modelos como o qwen3.5 pensam antes de responder, e o Ollama devolve esse pensamento num campo separado. Esses tokens contam no `max_tokens`. Com o limite em 1024, o modelo gastava tudo pensando e o campo `content` chegava vazio. O loop não olhava o `finish_reason`, que é onde esse corte aparece (`length`).

**2. O prompt dava permissão para não dizer nada.** O especialista tinha a instrução *"Report only what the tools return."* Depois de chamar as ferramentas, o modelo às vezes concluía que já tinha "reportado" o que as ferramentas devolveram, e encerrava o turno sem texto. Para ele, a instrução tinha sido cumprida.

Nos dois casos, o loop recebia: zero chamadas de ferramenta e texto vazio. E devolvia isso como resposta final, com status de sucesso. O coordenador recebia um resultado vazio de um especialista "bem-sucedido" e seguia em frente com o que tinha.

## A correção

Antes de mexer no loop, escrevi o teste que reproduz o problema: um modelo roteirizado que chama uma ferramenta e depois devolve texto vazio. O teste exige que o resultado seja um erro, não um sucesso. Ele falhou, como esperado.

A correção tem três partes:

**Resposta vazia nunca é sucesso.** Se não há ferramenta nem texto, o agente não termina como se estivesse tudo certo.

**Um pedido extra, uma vez só.** Na primeira resposta vazia, o agente acrescenta uma mensagem pedindo a resposta final e tenta de novo:

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

Quando o modelo só esqueceu de fechar a resposta, isso basta. Se a segunda resposta também vier vazia, o agente **falha de forma explícita**, com o `stop_reason` na mensagem. O span vira erro no trace, o evento de erro chega ao cliente pelo stream, e o coordenador sabe que aquele especialista não entregou nada.

**Configuração e prompt.** O `max_tokens` dos agentes subiu para 4096, para caber o raciocínio e a resposta. E os prompts passaram a exigir o fechamento: em vez de "reporte só o que as ferramentas devolvem", ficou *"baseie cada fato nos resultados das ferramentas e sempre termine com uma resposta curta"*. A restrição de não inventar continua, mas não dá mais permissão para o silêncio.

Um segundo teste cobre o caminho feliz da correção: resposta vazia, pedido extra, e o modelo responde. O resultado é sucesso, com o texto da segunda resposta.

## Por que o pedido é limitado a uma vez

Repetir o pedido até vir texto parece mais robusto, mas transforma um modelo quebrado num loop que gasta tokens até estourar o orçamento. Uma tentativa extra recupera os casos de "esqueci de responder". Se o modelo continua sem responder, o problema é outro (limite de tokens, prompt, modelo errado para a tarefa), e quem precisa saber disso é quem está operando o sistema, não mais uma chamada.

## O que levo disso

- **Trate resposta vazia como erro em todo loop de agente.** É uma linha de código, e evita que uma falha passe como sucesso.
- **Olhe o `stop_reason`.** `length` numa resposta final quase sempre é limite de tokens curto demais para um modelo que raciocina.
- **Cuidado com instruções restritivas.** "Responda só X" pode ser lido como "não precisa responder". Diga o que o modelo deve entregar, não só o que ele não pode fazer.
- **Teste com o modelo real.** Com o modelo roteirizado dos testes isso nunca apareceria. Foi rodando o qwen3.5 de verdade, e olhando o trace no [genai-lens](https://github.com/vicgamelo/genai-lens), que o problema ficou visível.

Você pode rodar os agentes e ver o trace de cada execução na [demo dos agentes](/demos/agentes/).
