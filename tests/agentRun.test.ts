import { describe, expect, it } from 'vitest';
import { sampleRun } from '../src/data/agentsSample';
import { applyEvent, argsLine, newRun, prettyResult, runCounts, toolLabel, type ToolStep } from '../src/lib/agentRun';
import { treeOrder } from '../src/lib/waterfall';

function replay(lang: 'pt' | 'en' = 'pt') {
  const { events } = sampleRun(lang);
  const state = newRun();
  for (const e of events) applyEvent(state, e.event, e.data, e.at);
  return state;
}

describe('árvore da execução dos agentes', () => {
  it('coordenador delega ao economista e ao pesquisador, mesmo com eventos intercalados', () => {
    const s = replay();
    expect(s.root?.name).toBe('coordinator');
    const delegations = s.root!.steps.filter((x): x is ToolStep => x.kind === 'tool');
    expect(delegations.map((d) => d.tool)).toEqual(['delegate_to_economist', 'delegate_to_company_researcher']);
    expect(delegations.map((d) => d.child?.name)).toEqual(['economist', 'company_researcher']);
    // O resultado da delegação chega ao passo certo, depois de o filho terminar.
    expect(delegations.every((d) => d.result && !d.failed)).toBe(true);
  });

  it('ferramentas ficam no agente certo, com argumento e resultado', () => {
    const s = replay();
    const eco = s.nodes.find((n) => n.name === 'economist')!;
    const tools = eco.steps.filter((x): x is ToolStep => x.kind === 'tool');
    expect(tools.map((t) => t.tool)).toEqual(['brasil__indicador_economico', 'calculator']);
    expect(tools[0].args).toEqual({ indicador: 'selic', ultimos: 1 });
    expect(JSON.parse(tools[0].result!).valores[0].valor).toBe(0.0508);
    const res = s.nodes.find((n) => n.name === 'company_researcher')!;
    expect(res.steps.some((x) => x.kind === 'tool' && x.tool === 'brasil__dias_uteis')).toBe(true);
  });

  it('done fecha tudo e soma os tokens', () => {
    const s = replay();
    expect(s.done).toMatchObject({ status: 'ok', toolCalls: 5, durationMs: 2860 });
    expect(s.done!.inputTokens).toBeGreaterThan(0);
    expect(s.nodes.every((n) => n.status === 'done')).toBe(true);
    expect(runCounts(s)).toEqual({ agents: 3, llm: 7, tools: 3 });
  });

  it('tokens do done batem com os spans de LLM do trace', () => {
    const { events, spans } = sampleRun('en');
    const done = events.find((e) => e.event === 'done')!.data as { input_tokens: number; output_tokens: number };
    const llm = spans.filter((x) => x.kind === 'llm');
    expect(done.input_tokens).toBe(llm.reduce((a, x) => a + (x.input_tokens ?? 0), 0));
    expect(done.output_tokens).toBe(llm.reduce((a, x) => a + (x.output_tokens ?? 0), 0));
    // A árvore do trace tem uma raiz só e todo span aparece.
    expect(treeOrder(spans)).toHaveLength(spans.length);
    expect(treeOrder(spans).filter((r) => r.depth === 0)).toHaveLength(1);
  });

  it('erro de ferramenta é marcado e delegação sem passo anterior ainda vira filho', () => {
    const s = newRun();
    applyEvent(s, 'agent_start', { agent: 'coordinator', depth: 0, data: { task: 'q' } }, 0);
    applyEvent(s, 'tool_call', { agent: 'coordinator', depth: 0, data: { tool: 'calculator', arguments: { expression: '1/0' } } }, 1);
    applyEvent(s, 'tool_result', { agent: 'coordinator', depth: 0, data: { tool: 'calculator', result: 'error: division by zero' } }, 2);
    applyEvent(s, 'agent_start', { agent: 'economist', depth: 1, data: { task: 't' } }, 3);
    const steps = s.root!.steps as ToolStep[];
    expect(steps[0].failed).toBe(true);
    expect(steps[1]).toMatchObject({ tool: 'delegate_to_economist', child: { name: 'economist' } });
  });

  it('rótulos', () => {
    expect(toolLabel('brasil__consultar_cnpj')).toBe('consultar_cnpj');
    expect(toolLabel('calculator')).toBe('calculator');
    expect(argsLine({ cnpj: '1', ultimos: 1 })).toBe('cnpj: 1, ultimos: 1');
    expect(prettyResult('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyResult('texto')).toBe('texto');
  });
});
