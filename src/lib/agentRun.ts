// Monta, a partir dos eventos SSE do agent-orchestrator, a árvore "quem fez o quê": agentes,
// passos do LLM, ferramentas chamadas e delegações. Delegações em paralelo chegam intercaladas,
// então cada evento é ligado ao nó pelo nome do agente + profundidade.

export interface LlmStep {
  kind: 'llm';
  id: number;
  step: number;
  text: string;
  calls: string[];
  stop: string | null;
}

export interface ToolStep {
  kind: 'tool';
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  failed?: boolean;
  child?: AgentNode;
  startedAt: number;
  endedAt?: number;
}

export interface ErrorStep {
  kind: 'error';
  id: number;
  message: string;
}

export type Step = LlmStep | ToolStep | ErrorStep;

export interface AgentNode {
  id: number;
  name: string;
  depth: number;
  task: string;
  status: 'running' | 'done' | 'error';
  output?: string;
  steps: Step[];
  startedAt: number;
  endedAt?: number;
}

export interface RunDone {
  output: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
  traceId: string | null;
}

export interface RunState {
  root: AgentNode | null;
  nodes: AgentNode[];
  done: RunDone | null;
  nextId: number;
}

export const DELEGATE_PREFIX = 'delegate_to_';

export function newRun(): RunState {
  return { root: null, nodes: [], done: null, nextId: 1 };
}

interface RawEvent {
  agent?: string;
  depth?: number;
  data?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** O resultado de ferramenta que o orquestrador devolve quando ela falha começa com "error". */
export function looksFailed(result: string): boolean {
  return /^error:/.test(result);
}

function active(state: RunState, agent: string, depth: number): AgentNode | undefined {
  for (let k = state.nodes.length - 1; k >= 0; k--) {
    const n = state.nodes[k];
    if (n.name === agent && n.depth === depth && n.status === 'running') return n;
  }
  for (let k = state.nodes.length - 1; k >= 0; k--) {
    const n = state.nodes[k];
    if (n.name === agent && n.depth === depth) return n;
  }
  return undefined;
}

export function applyEvent(state: RunState, event: string, raw: unknown, now: number): RunState {
  const ev = (raw ?? {}) as RawEvent & Record<string, unknown>;
  const agent = str(ev.agent);
  const depth = Number(ev.depth ?? 0);
  const data = ev.data ?? {};

  if (event === 'done') {
    state.done = {
      output: str(ev.output),
      status: str(ev.status) || 'ok',
      inputTokens: Number(ev.input_tokens ?? 0),
      outputTokens: Number(ev.output_tokens ?? 0),
      toolCalls: Number(ev.tool_calls ?? 0),
      durationMs: Number(ev.duration_ms ?? 0),
      traceId: typeof ev.trace_id === 'string' ? ev.trace_id : null,
    };
    for (const n of state.nodes) if (n.status === 'running') (n.status = 'done'), (n.endedAt ??= now);
    return state;
  }

  if (event === 'agent_start') {
    const node: AgentNode = {
      id: state.nextId++,
      name: agent,
      depth,
      task: str(data.task),
      status: 'running',
      steps: [],
      startedAt: now,
    };
    if (!state.root) {
      state.root = node;
    } else {
      // Pendura no passo "delegate_to_<agente>" ainda sem filho de algum agente um nível acima.
      const parents = state.nodes.filter((n) => n.depth === depth - 1).reverse();
      let attached = false;
      for (const p of parents) {
        const step = p.steps.find(
          (s): s is ToolStep => s.kind === 'tool' && s.tool === DELEGATE_PREFIX + agent && !s.child && s.result === undefined,
        );
        if (step) {
          step.child = node;
          attached = true;
          break;
        }
      }
      if (!attached) {
        const host = parents[0] ?? state.root;
        host.steps.push({ kind: 'tool', id: state.nextId++, tool: DELEGATE_PREFIX + agent, args: { task: node.task }, child: node, startedAt: now });
      }
    }
    state.nodes.push(node);
    return state;
  }

  const node = active(state, agent, depth) ?? state.root;
  if (!node) return state;

  if (event === 'llm') {
    node.steps.push({
      kind: 'llm',
      id: state.nextId++,
      step: Number(data.step ?? node.steps.filter((s) => s.kind === 'llm').length + 1),
      text: str(data.text),
      calls: Array.isArray(data.tool_calls) ? data.tool_calls.map(str) : [],
      stop: data.stop_reason == null ? null : str(data.stop_reason),
    });
  } else if (event === 'tool_call') {
    const args = data.arguments && typeof data.arguments === 'object' ? (data.arguments as Record<string, unknown>) : {};
    node.steps.push({ kind: 'tool', id: state.nextId++, tool: str(data.tool), args, startedAt: now });
  } else if (event === 'tool_result') {
    const tool = str(data.tool);
    const step = node.steps.find((s): s is ToolStep => s.kind === 'tool' && s.tool === tool && s.result === undefined);
    if (step) {
      step.result = str(data.result);
      step.failed = looksFailed(step.result);
      step.endedAt = now;
    }
  } else if (event === 'agent_end') {
    node.status = 'done';
    node.output = str(data.output);
    node.endedAt = now;
  } else if (event === 'error') {
    node.steps.push({ kind: 'error', id: state.nextId++, message: str(data.message) });
  }
  return state;
}

export function runCounts(state: RunState): { agents: number; llm: number; tools: number } {
  let llm = 0;
  let tools = 0;
  for (const n of state.nodes)
    for (const s of n.steps) {
      if (s.kind === 'llm') llm++;
      else if (s.kind === 'tool' && !s.tool.startsWith(DELEGATE_PREFIX)) tools++;
    }
  return { agents: state.nodes.length, llm, tools };
}

// ------------------------------------------------------------------ rótulos

export const AGENT_LABEL: Record<string, { pt: string; en: string; role: { pt: string; en: string } }> = {
  coordinator: {
    pt: 'Coordenador',
    en: 'Coordinator',
    role: { pt: 'divide a pergunta e escreve a resposta', en: 'splits the question and writes the answer' },
  },
  economist: {
    pt: 'Economista',
    en: 'Economist',
    role: { pt: 'Selic, IPCA, câmbio e contas', en: 'Selic, IPCA, FX and maths' },
  },
  company_researcher: {
    pt: 'Pesquisador',
    en: 'Researcher',
    role: { pt: 'CNPJ, CEP, documentos e dias úteis', en: 'CNPJ, CEP, documents and business days' },
  },
};

export function agentLabel(name: string, lang: 'pt' | 'en'): string {
  return AGENT_LABEL[name]?.[lang] ?? name.replace(/_/g, ' ');
}

/** `brasil__consultar_cnpj` → `consultar_cnpj` (o prefixo é só o servidor MCP de origem). */
export function toolLabel(tool: string): string {
  return tool.replace(/^[a-z0-9]+__/, '');
}

/** Argumentos em uma linha: `cnpj: 11222333000181, ultimos: 1`. */
export function argsLine(args: Record<string, unknown>, max = 140): string {
  const s = Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** JSON indentado quando o resultado é JSON; texto como veio, se não for. */
export function prettyResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
}
