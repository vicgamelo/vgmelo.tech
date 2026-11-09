---
title: 'Observabilidade de agentes de IA com OpenTelemetry: o mínimo que funciona'
description: 'O que medir em cada execução de um agente (traces, tokens, custo e latência), como seguir o padrão GenAI do OpenTelemetry e os erros que aparecem quando os agentes rodam em paralelo.'
date: 2026-11-09
lang: pt
slug: observabilidade-de-agentes
translation: llm-agent-observability
tags: ['Observabilidade', 'OpenTelemetry', 'Agentes']
project: genai-lens
draft: true
---

Um agente em produção é um programa que decide sozinho quantas vezes chama o modelo, quais ferramentas usa e em que ordem. Quando a resposta sai errada, demora 40 segundos ou a fatura do mês dobra, a pergunta é sempre a mesma: **o que ele fez nessa execução?**

Log solto não responde isso. Para responder, construí o [genai-lens](https://github.com/vicgamelo/genai-lens), um coletor e painel de observabilidade para LLM que roda num container só. Aqui vai o que aprendi sobre o mínimo que precisa existir.

## Cada execução é um trace, cada passo é um span

O modelo mental que funciona é o de tracing distribuído:

- a **execução** do agente é um trace;
- cada **chamada ao modelo** é um span do tipo `llm`, com modelo, tokens de entrada e saída e latência;
- cada **chamada de ferramenta** é um span `tool`, filho da etapa que a pediu;
- quando um agente **delega** para outro, o sub-agente é um span `agent` com seus próprios filhos.

```
coordinator (agent)                    ███████████████████████  8.2 s
├─ llm.complete (llm)                  ██                       0.9 s
├─ economist (agent)                     ████████████           4.1 s
│  ├─ llm.complete                       ██
│  └─ tool.indicador_economico            ███
└─ company_researcher (agent)            ██████████████         4.8 s
   └─ tool.consultar_cnpj                  ████
```

Com essa árvore você enxerga, numa olhada, onde foi o tempo, quem gastou os tokens e qual ferramenta falhou.

## Os atributos que importam

O OpenTelemetry tem convenções semânticas para GenAI. Seguir o padrão, em vez de inventar nomes, permite que qualquer biblioteca instrumentada mande dados para o mesmo lugar. Os atributos que o genai-lens usa:

| Atributo | Para quê |
| --- | --- |
| `gen_ai.operation.name` | tipo do span (chat, ferramenta, agente) |
| `gen_ai.request.model` / `gen_ai.response.model` | o modelo pedido e o que respondeu de fato |
| `gen_ai.provider.name` | Anthropic, OpenAI, Ollama… |
| `gen_ai.usage.input_tokens` / `output_tokens` | a base do custo |

Um detalhe prático: bibliotecas mais antigas ainda mandam `gen_ai.usage.prompt_tokens` e `completion_tokens`, e `gen_ai.system` no lugar de `provider.name`. O coletor aceita os dois nomes. Sem isso, metade dos spans chega sem token e o custo fica subestimado sem ninguém perceber.

## Custo é derivado, não medido

Nenhum provedor devolve o custo na resposta. Ele sai de `tokens × preço`, e o preço depende do modelo. Duas lições:

1. **Prefixo mais longo vence.** Os nomes de modelo vêm com data e sufixo. Uma tabela por prefixo (`claude-haiku`, `gpt-4.1-mini`…) com busca pelo prefixo mais longo cobre as variações sem precisar atualizar a cada versão.
2. **Calcule na ingestão, não na consulta.** Guardar o custo no span faz o histórico refletir o preço da época. Se o preço mudar, o passado não muda junto.

## O SDK nunca pode derrubar a aplicação

A regra mais importante de uma biblioteca de observabilidade: **ela não pode ser a causa do incidente**. No SDK do genai-lens:

- os spans vão para uma fila e são enviados em lote por uma thread de fundo; a requisição do usuário nunca espera o coletor;
- se o coletor cair, o SDK descarta e segue; nenhuma exceção sobe para o código do usuário;
- o contexto do trace usa `contextvars`, então tarefas `async` concorrentes não misturam traces.

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

## Prompt é dado pessoal

O que o usuário digita vai parar no trace. Isso inclui e-mail, CPF, telefone e, com frequência assustadora, chaves de API coladas por engano. O genai-lens mascara esses padrões **antes de gravar** e corta textos longos. Mascarar na hora de exibir não adianta: o dado já está no banco e no backup.

## O bug do paralelismo

O [agent-orchestrator](https://github.com/vicgamelo/agent-orchestrator) roda as chamadas de ferramenta independentes em paralelo. Quando liguei os dois projetos, o painel mostrou a cascata embaralhada: os filhos de um especialista apareciam no meio dos filhos do outro.

O motivo: eu ordenava as linhas por horário de início. Com dois ramos rodando ao mesmo tempo, os horários se intercalam. A correção foi ordenar pela **árvore**, numa busca em profundidade a partir da raiz com os irmãos por horário. É um erro que só aparece com paralelismo de verdade, e é o tipo de coisa que você só descobre olhando traces reais.

## Por onde começar

Se você tem um agente em produção sem nada disso, comece por três números por execução: **tokens, custo e latência**, e pela árvore de spans. Com isso já dá para responder "por que demorou", "por que ficou caro" e "onde quebrou". Avaliação de qualidade vem depois, e fica muito mais fácil quando cada resposta já tem um trace para você abrir.

Você pode ver um trace real na [demo dos agentes](/demos/agentes/): cada pergunta gera a cascata completa.
