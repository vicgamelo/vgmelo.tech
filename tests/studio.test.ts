// Estúdio: o agente que vai para o portal (AgentSpec com extra="forbid"), versões e comparação.
import { describe, expect, it } from 'vitest';
import {
  blankAgent,
  byAgent,
  diffAgents,
  fromTemplate,
  lineDiff,
  noDifference,
  parseDraft,
  problems,
  sameAgent,
  toolGroups,
  versionLabel,
  type Catalog,
  type StudioAgent,
  type Version,
} from '../src/lib/studio';

const catalog: Catalog = {
  models: [
    { id: 'gemma', label: 'Gemma', provider: 'openrouter', available: false },
    { id: 'gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq', available: true },
    { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'groq', available: true },
  ],
  tools: [
    { name: 'calculator', server: null, description: 'math' },
    { name: 'brasil__indicador_economico', server: 'brasil', description: 'Selic' },
    { name: 'noticias__buscar_noticias', server: 'noticias', description: 'news' },
    { name: 'current_datetime', server: null, description: 'now' },
  ],
  templates: [],
  limits: { max_steps: 6, max_tokens: 2048, instructions_max_chars: 100 },
};

const agent = (over: Partial<StudioAgent> = {}): StudioAgent => ({
  instructions: 'Você é um economista.',
  model: 'gpt-oss-20b',
  tools: ['calculator'],
  temperature: 0.2,
  max_steps: 4,
  ...over,
});

describe('agente', () => {
  it('em branco usa o primeiro modelo disponível e só os campos que o portal aceita', () => {
    const a = blankAgent(catalog, 'Instruções');
    expect(a).toEqual({ instructions: 'Instruções', model: 'gpt-oss-20b', tools: [], temperature: 0.2, max_steps: 4 });
    expect(Object.keys(a).sort()).toEqual(['instructions', 'max_steps', 'model', 'temperature', 'tools']);
    expect(blankAgent({ ...catalog, limits: { ...catalog.limits, max_steps: 2 } }, 'x').max_steps).toBe(2);
  });

  it('modelo de partida perde campos extras, ferramentas que sumiram e modelo fora do ar', () => {
    const t = {
      name: 'economist',
      description: 'numbers',
      instructions: '  Você é um economista.\n',
      model: 'gemma',
      tools: ['brasil__indicador_economico', 'normas__buscar_normas'],
      temperature: 0.1,
      max_steps: 8,
    };
    expect(fromTemplate(t, catalog)).toEqual({
      instructions: 'Você é um economista.',
      model: 'gpt-oss-20b',
      tools: ['brasil__indicador_economico'],
      temperature: 0.1,
      max_steps: 6,
    });
  });

  it('compara agentes sem ligar para a ordem das ferramentas', () => {
    expect(sameAgent(agent({ tools: ['a', 'b'] }), agent({ tools: ['b', 'a'] }))).toBe(true);
    expect(sameAgent(agent(), agent({ temperature: 0.3 }))).toBe(false);
    expect(sameAgent(agent(), agent({ instructions: 'outra' }))).toBe(false);
  });

  it('aponta o que impede de rodar', () => {
    expect(problems(agent(), catalog)).toEqual([]);
    expect(problems(agent({ instructions: '   ' }), catalog)).toEqual(['empty']);
    expect(problems(agent({ instructions: 'x'.repeat(101) }), catalog)).toEqual(['tooLong']);
    expect(problems(agent({ model: 'gemma' }), catalog)).toEqual(['modelOff']);
    expect(problems(agent({ model: 'sumiu' }), catalog)).toEqual(['noModel']);
    expect(problems(agent({ tools: ['normas__buscar_normas'] }), catalog)).toEqual(['toolOff']);
    expect(problems(agent({ max_steps: 7 }), catalog)).toEqual(['steps']);
    expect(problems(agent({ max_steps: 0 }), catalog)).toEqual(['steps']);
    expect(problems(agent({ max_steps: 2.5 }), catalog)).toEqual(['steps']);
  });

  it('agrupa ferramentas por servidor, com as embutidas juntas', () => {
    const groups = toolGroups(catalog.tools);
    expect(groups.map(([k, list]) => [k, list.map((t) => t.name)])).toEqual([
      ['builtin', ['calculator', 'current_datetime']],
      ['brasil', ['brasil__indicador_economico']],
      ['noticias', ['noticias__buscar_noticias']],
    ]);
  });
});

describe('versões', () => {
  const v = (name: string, version: number): Version => ({
    id: `${name}${version}`,
    name,
    version,
    note: null,
    created_at: '2026-11-10T12:00:00+00:00',
    agent: agent(),
  });

  it('agrupa por nome, a mais nova primeiro', () => {
    const groups = byAgent([v('Economista', 1), v('Repórter', 1), v('Economista', 3), v('Economista', 2)]);
    expect(groups.map(([name, list]) => [name, list.map((x) => x.version)])).toEqual([
      ['Economista', [3, 2, 1]],
      ['Repórter', [1]],
    ]);
    expect(versionLabel(v('Economista', 3))).toBe('Economista · v3');
  });
});

describe('comparação', () => {
  it('diff de linhas', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
    expect(lineDiff('igual', 'igual')).toEqual([{ op: 'same', text: 'igual' }]);
    expect(lineDiff('', 'nova')).toEqual([
      { op: 'del', text: '' },
      { op: 'add', text: 'nova' },
    ]);
  });

  it('diz o que mudou entre duas versões', () => {
    const before = agent({ tools: ['calculator', 'brasil__indicador_economico'] });
    const after = agent({ model: 'gpt-oss-120b', temperature: 0.7, tools: ['brasil__indicador_economico', 'noticias__buscar_noticias'] });
    const d = diffAgents(before, after);
    expect(d).toEqual({
      model: ['gpt-oss-20b', 'gpt-oss-120b'],
      temperature: [0.2, 0.7],
      toolsAdded: ['noticias__buscar_noticias'],
      toolsRemoved: ['calculator'],
      instructions: null,
    });
    expect(noDifference(d)).toBe(false);
    expect(noDifference(diffAgents(before, { ...before, tools: [...before.tools].reverse() }))).toBe(true);
    expect(diffAgents(before, agent({ instructions: 'Outra coisa.' })).instructions).toEqual([
      { op: 'del', text: 'Você é um economista.' },
      { op: 'add', text: 'Outra coisa.' },
    ]);
  });
});

describe('rascunho no navegador', () => {
  it('aceita só o formato certo', () => {
    const ok = { name: 'Economista', agent: agent(), base: 'abc' };
    expect(parseDraft(JSON.stringify(ok))).toEqual(ok);
    expect(parseDraft(JSON.stringify({ ...ok, base: 3 }))?.base).toBeNull();
    expect(parseDraft(JSON.stringify({ ...ok, name: 'x'.repeat(80) }))?.name).toHaveLength(60);
    // campos a mais no agente não passam adiante (o portal recusaria)
    expect(Object.keys(parseDraft(JSON.stringify({ ...ok, agent: { ...agent(), extra: 1 } }))!.agent)).not.toContain('extra');
    for (const bad of [null, '', '{', '[]', JSON.stringify({ name: 'x' }), JSON.stringify({ ...ok, agent: { ...agent(), tools: [1] } })])
      expect(parseDraft(bad)).toBeNull();
  });
});
