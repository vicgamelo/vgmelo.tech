// Estúdio de agentes: o que a pessoa escreve (instruções, modelo, ferramentas), as versões salvas
// no portal e a comparação entre duas versões. Sem DOM, para dar para testar.

export interface StudioAgent {
  instructions: string;
  model: string;
  tools: string[];
  temperature: number;
  max_steps: number;
}

export interface CatalogModel {
  id: string;
  label: string;
  provider: string;
  available: boolean;
}

export interface CatalogTool {
  name: string;
  server: string | null;
  description: string;
}

export interface Template extends StudioAgent {
  name: string;
  description: string;
}

export interface Catalog {
  models: CatalogModel[];
  tools: CatalogTool[];
  templates: Template[];
  limits: { max_steps: number; max_tokens: number; instructions_max_chars: number };
}

export interface Version {
  id: string;
  name: string;
  version: number;
  note: string | null;
  created_at: string;
  agent: StudioAgent;
}

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_STEPS = 4;
export const NAME_MAX = 60;
export const NOTE_MAX = 200;

export function firstAvailable(catalog: Catalog): string {
  return catalog.models.find((m) => m.available)?.id ?? catalog.models[0]?.id ?? '';
}

export function blankAgent(catalog: Catalog, instructions: string): StudioAgent {
  return {
    instructions,
    model: firstAvailable(catalog),
    tools: [],
    temperature: DEFAULT_TEMPERATURE,
    max_steps: Math.min(DEFAULT_STEPS, catalog.limits.max_steps),
  };
}

/** Só os campos que o portal aceita, com as ferramentas que ainda existem no catálogo. */
export function fromTemplate(t: StudioAgent, catalog: Catalog): StudioAgent {
  const known = new Set(catalog.tools.map((x) => x.name));
  const model = catalog.models.some((m) => m.id === t.model && m.available) ? t.model : firstAvailable(catalog);
  return {
    instructions: t.instructions.trim(),
    model,
    tools: t.tools.filter((x) => known.has(x)),
    temperature: t.temperature,
    max_steps: Math.min(t.max_steps, catalog.limits.max_steps),
  };
}

export function sameAgent(a: StudioAgent, b: StudioAgent): boolean {
  return (
    a.instructions === b.instructions &&
    a.model === b.model &&
    a.temperature === b.temperature &&
    a.max_steps === b.max_steps &&
    [...a.tools].sort().join() === [...b.tools].sort().join()
  );
}

export type Problem = 'empty' | 'tooLong' | 'noModel' | 'modelOff' | 'toolOff' | 'steps';

/** O que impede de rodar ou salvar, na ordem em que vale avisar. */
export function problems(a: StudioAgent, catalog: Catalog): Problem[] {
  const out: Problem[] = [];
  if (!a.instructions.trim()) out.push('empty');
  if (a.instructions.length > catalog.limits.instructions_max_chars) out.push('tooLong');
  const model = catalog.models.find((m) => m.id === a.model);
  if (!model) out.push('noModel');
  else if (!model.available) out.push('modelOff');
  const known = new Set(catalog.tools.map((t) => t.name));
  if (a.tools.some((t) => !known.has(t))) out.push('toolOff');
  if (!Number.isInteger(a.max_steps) || a.max_steps < 1 || a.max_steps > catalog.limits.max_steps) out.push('steps');
  return out;
}

/** Ferramentas por servidor MCP, na ordem do catálogo; as embutidas (server null) vão em "builtin". */
export function toolGroups(tools: CatalogTool[]): [string, CatalogTool[]][] {
  const groups = new Map<string, CatalogTool[]>();
  for (const t of tools) {
    const key = t.server ?? 'builtin';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups];
}

/** Versões agrupadas por nome do agente, a mais nova primeiro (o portal já manda assim). */
export function byAgent(versions: Version[]): [string, Version[]][] {
  const groups = new Map<string, Version[]>();
  for (const v of versions) {
    if (!groups.has(v.name)) groups.set(v.name, []);
    groups.get(v.name)!.push(v);
  }
  for (const list of groups.values()) list.sort((a, b) => b.version - a.version);
  return [...groups];
}

export function versionLabel(v: Pick<Version, 'name' | 'version'>): string {
  return `${v.name} · v${v.version}`;
}

// ------------------------------------------------------------------ comparação

export type LineOp = { op: 'same' | 'add' | 'del'; text: string };

/** Diff de linhas (LCS). As instruções têm no máximo alguns milhares de caracteres. */
export function lineDiff(before: string, after: string): LineOp[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'del', text: a[i++] });
    } else {
      out.push({ op: 'add', text: b[j++] });
    }
  }
  while (i < n) out.push({ op: 'del', text: a[i++] });
  while (j < m) out.push({ op: 'add', text: b[j++] });
  return out;
}

export interface AgentDiff {
  model?: [string, string];
  temperature?: [number, number];
  max_steps?: [number, number];
  toolsAdded: string[];
  toolsRemoved: string[];
  /** null quando as instruções são iguais. */
  instructions: LineOp[] | null;
}

/** O que muda de `from` para `to`. */
export function diffAgents(from: StudioAgent, to: StudioAgent): AgentDiff {
  const d: AgentDiff = {
    toolsAdded: to.tools.filter((t) => !from.tools.includes(t)),
    toolsRemoved: from.tools.filter((t) => !to.tools.includes(t)),
    instructions: from.instructions === to.instructions ? null : lineDiff(from.instructions, to.instructions),
  };
  if (from.model !== to.model) d.model = [from.model, to.model];
  if (from.temperature !== to.temperature) d.temperature = [from.temperature, to.temperature];
  if (from.max_steps !== to.max_steps) d.max_steps = [from.max_steps, to.max_steps];
  return d;
}

export function noDifference(d: AgentDiff): boolean {
  return !d.model && !d.temperature && !d.max_steps && !d.toolsAdded.length && !d.toolsRemoved.length && !d.instructions;
}

// ------------------------------------------------------------------ rascunho local

export interface Draft {
  name: string;
  agent: StudioAgent;
  /** Versão de onde o rascunho saiu, para dizer "v3 + alterações". */
  base: string | null;
}

/** Rascunho guardado no navegador: só aceita o formato certo, o resto vira null. */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    const a = d.agent as Partial<StudioAgent> | undefined;
    if (
      typeof d.name !== 'string' ||
      !a ||
      typeof a.instructions !== 'string' ||
      typeof a.model !== 'string' ||
      !Array.isArray(a.tools) ||
      !a.tools.every((t) => typeof t === 'string') ||
      typeof a.temperature !== 'number' ||
      typeof a.max_steps !== 'number'
    )
      return null;
    return {
      name: d.name.slice(0, NAME_MAX),
      agent: { instructions: a.instructions, model: a.model, tools: a.tools, temperature: a.temperature, max_steps: a.max_steps },
      base: typeof d.base === 'string' ? d.base : null,
    };
  } catch {
    return null;
  }
}
