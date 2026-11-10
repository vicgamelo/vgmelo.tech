// Cascata do trace (spans do genai-lens), em ordem de árvore (DFS), no estilo do painel do lens:
// eixo de tempo, legenda por tipo, linhas clicáveis e o detalhe do span escolhido.
// Tudo com createElement/textContent; posições e larguras pelo CSSOM (a CSP não deixa style inline).
import { agentLabel, DELEGATE_PREFIX, toolLabel } from './agentRun';

export interface Span {
  span_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  status: string;
  start_time: string;
  duration_ms: number | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  provider?: string | null;
  error?: string | null;
  input?: string | null;
  output?: string | null;
}

type Lang = 'pt' | 'en';

const TXT = {
  pt: {
    run: 'execução',
    delegated: 'delegou →',
    llm: 'LLM',
    kinds: { chain: 'execução', agent: 'agente', llm: 'LLM', tool: 'ferramenta' } as Record<string, string>,
    spans: 'spans',
    llmCalls: 'chamadas ao LLM',
    tools: 'ferramentas',
    tokens: 'tokens',
    kind: 'Tipo',
    status: 'Status',
    duration: 'Duração',
    start: 'Início',
    model: 'Modelo',
    provider: 'Provedor',
    tokIn: 'Tokens de entrada',
    tokOut: 'Tokens de saída',
    input: 'Entrada',
    output: 'Saída',
    error: 'Erro',
    pick: 'Clique numa linha para ver o span.',
  },
  en: {
    run: 'run',
    delegated: 'delegated →',
    llm: 'LLM',
    kinds: { chain: 'run', agent: 'agent', llm: 'LLM', tool: 'tool' } as Record<string, string>,
    spans: 'spans',
    llmCalls: 'LLM calls',
    tools: 'tools',
    tokens: 'tokens',
    kind: 'Kind',
    status: 'Status',
    duration: 'Duration',
    start: 'Start',
    model: 'Model',
    provider: 'Provider',
    tokIn: 'Input tokens',
    tokOut: 'Output tokens',
    input: 'Input',
    output: 'Output',
    error: 'Error',
    pick: 'Click a row to inspect the span.',
  },
};

export function treeOrder(spans: Span[]): { span: Span; depth: number }[] {
  const ids = new Set(spans.map((s) => s.span_id));
  const children = new Map<string | null, Span[]>();
  for (const s of spans) {
    const parent = s.parent_id && ids.has(s.parent_id) ? s.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  for (const list of children.values()) list.sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const out: { span: Span; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      out.push({ span: s, depth });
      walk(s.span_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Nome legível do span: `agent.economist` → "Economista", `fallback.complete` → "LLM · gpt-oss-20b". */
export function spanLabel(span: Span, lang: Lang): string {
  const t = TXT[lang];
  const [head, ...rest] = span.name.split('.');
  const tail = rest.join('.');
  if (span.kind === 'llm') return span.model ? `${t.llm} · ${span.model.split('/').pop()}` : t.llm;
  if (head === 'run') return `${t.run} · ${agentLabel(tail, lang)}`;
  if (head === 'agent') return agentLabel(tail, lang);
  if (head === 'tool' && tail.startsWith(DELEGATE_PREFIX)) return `${t.delegated} ${agentLabel(tail.slice(DELEGATE_PREFIX.length), lang)}`;
  if (head === 'tool') return toolLabel(tail);
  return span.name;
}

export function traceSummary(spans: Span[]): { spans: number; llm: number; tools: number; tokens: number; durationMs: number } {
  const t0 = Math.min(...spans.map((s) => Date.parse(s.start_time)));
  const t1 = Math.max(...spans.map((s) => Date.parse(s.start_time) + (s.duration_ms ?? 0)));
  const llm = spans.filter((s) => s.kind === 'llm');
  return {
    spans: spans.length,
    llm: llm.length,
    tools: spans.filter((s) => s.kind === 'tool').length,
    tokens: llm.reduce((a, s) => a + (s.input_tokens ?? 0) + (s.output_tokens ?? 0), 0),
    durationMs: spans.length ? t1 - t0 : 0,
  };
}

/** Chamadas e tokens por modelo, como o genai-lens agrupa: o que mais gastou primeiro. */
export function byModel(spans: Span[]): { model: string; calls: number; tokens: number; ms: number }[] {
  const acc = new Map<string, { model: string; calls: number; tokens: number; ms: number }>();
  for (const s of spans) {
    if (s.kind !== 'llm') continue;
    const model = s.model || '?';
    const row = acc.get(model) ?? { model, calls: 0, tokens: 0, ms: 0 };
    row.calls += 1;
    row.tokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0);
    row.ms += s.duration_ms ?? 0;
    acc.set(model, row);
  }
  return [...acc.values()].sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
}

/** Passo "redondo" (1, 2 ou 5 × 10^k) para ~5 marcas no eixo. */
export function tickStep(totalMs: number): number {
  const raw = Math.max(totalMs, 1) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
}

export function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function prettyIo(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function detail(box: HTMLElement, span: Span, lang: Lang, t0: number): void {
  const t = TXT[lang];
  const nf = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
  const facts: [string, string | null][] = [
    [t.kind, t.kinds[span.kind] ?? span.kind],
    [t.status, span.status],
    [t.duration, fmtMs(span.duration_ms ?? 0)],
    [t.start, `+${fmtMs(Date.parse(span.start_time) - t0)}`],
    [t.model, span.model],
    [t.provider, span.provider ?? null],
    [t.tokIn, span.input_tokens == null ? null : nf.format(span.input_tokens)],
    [t.tokOut, span.output_tokens == null ? null : nf.format(span.output_tokens)],
  ];
  const title = el('div', 'wf-d-title');
  title.append(el('span', `wf-dot k-${span.kind}`), el('strong', '', spanLabel(span, lang)), el('code', 'wf-d-name', span.name));
  const dl = el('dl', 'wf-facts');
  for (const [k, v] of facts) {
    if (v == null || v === '') continue;
    const d = el('div');
    d.append(el('dt', '', k), el('dd', k === t.status && v !== 'ok' ? 'bad' : '', v));
    dl.append(d);
  }
  const blocks: HTMLElement[] = [];
  for (const [k, v] of [
    [t.error, span.error],
    [t.input, span.input],
    [t.output, span.output],
  ] as [string, string | null | undefined][]) {
    if (!v) continue;
    const b = el('div', 'wf-io');
    b.append(el('div', 'wf-io-k', k), el('pre', k === t.error ? 'bad' : '', prettyIo(v)));
    blocks.push(b);
  }
  box.replaceChildren(title, dl, ...blocks);
}

export function renderWaterfall(root: HTMLElement, spans: Span[], lang: Lang = 'pt'): void {
  const t = TXT[lang];
  if (!spans.length) {
    root.replaceChildren();
    return;
  }
  const rows = treeOrder(spans);
  const t0 = Math.min(...spans.map((s) => Date.parse(s.start_time)));
  const sum = traceSummary(spans);
  const total = Math.max(sum.durationMs, 1);
  const nf = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');

  const summary = el('div', 'wf-summary');
  for (const [v, k] of [
    [fmtMs(sum.durationMs), ''],
    [String(sum.spans), t.spans],
    [String(sum.llm), t.llmCalls],
    [String(sum.tools), t.tools],
    [nf.format(sum.tokens), t.tokens],
  ]) {
    const c = el('span', 'wf-stat');
    c.append(el('strong', '', v), document.createTextNode(k ? ` ${k}` : ''));
    summary.append(c);
  }
  const legend = el('div', 'wf-legend');
  for (const k of ['chain', 'agent', 'llm', 'tool']) {
    const item = el('span');
    item.append(el('span', `wf-dot k-${k}`), document.createTextNode(t.kinds[k]));
    legend.append(item);
  }
  const head = el('div', 'wf-head');
  head.append(summary, legend);

  const axis = el('div', 'wf-axis');
  const axisTrack = el('div', 'wf-axis-track');
  const step = tickStep(total);
  for (let v = 0; v <= total + 1e-9; v += step) {
    const tick = el('span', 'wf-tick', fmtMs(v));
    tick.style.left = `${(v / total) * 100}%`;
    axisTrack.append(tick);
  }
  axis.append(el('div'), axisTrack, el('div'));

  const list = el('div', 'wf-rows');
  list.setAttribute('role', 'list');
  const box = el('div', 'wf-detail', t.pick);
  const buttons: HTMLButtonElement[] = [];
  const select = (i: number) => {
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    detail(box, rows[i].span, lang, t0);
  };
  rows.forEach(({ span, depth }, i) => {
    const row = el('button', `wf-row${span.status === 'error' ? ' is-error' : ''}`);
    row.type = 'button';
    row.setAttribute('aria-pressed', 'false');
    const label = el('span', 'wf-label');
    label.style.paddingLeft = `${depth * 14}px`;
    label.append(el('span', `wf-dot k-${span.kind}`), el('span', 'wf-name', spanLabel(span, lang)));
    const track = el('span', 'wf-track');
    for (const tk of axisTrack.children) {
      const g = el('span', 'wf-grid');
      g.style.left = (tk as HTMLElement).style.left;
      track.append(g);
    }
    const bar = el('span', `wf-bar k-${span.kind}${span.status === 'error' ? ' k-error' : ''}`);
    bar.style.left = `${((Date.parse(span.start_time) - t0) / total) * 100}%`;
    bar.style.width = `${Math.max(((span.duration_ms ?? 0) / total) * 100, 0.6)}%`;
    track.append(bar);
    const ms = el('span', 'wf-ms', fmtMs(span.duration_ms ?? 0));
    row.append(label, track, ms);
    row.title = [span.name, span.model, span.input_tokens != null ? `${(span.input_tokens ?? 0) + (span.output_tokens ?? 0)} tokens` : '']
      .filter(Boolean)
      .join(' · ');
    row.addEventListener('click', () => select(i));
    buttons.push(row);
    list.append(row);
  });

  const scroller = el('div', 'wf-scroll');
  const inner = el('div', 'wf-inner');
  inner.append(axis, list);
  scroller.append(inner);
  root.replaceChildren(head, scroller, box);
  const firstLlm = rows.findIndex((r) => r.span.kind === 'llm');
  select(firstLlm >= 0 ? firstLlm : 0);
}

const LENS = {
  pt: { via: 'gravado via OpenTelemetry GenAI', calls: (n: number) => `${n} ${n === 1 ? 'chamada' : 'chamadas'}` },
  en: { via: 'recorded via OpenTelemetry GenAI', calls: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}` },
};

/** O trace como o genai-lens guardou: de onde veio, gasto por modelo e a cascata. */
export function renderLensTrace(root: HTMLElement, traceId: string, spans: Span[], lang: Lang = 'pt'): void {
  const t = LENS[lang];
  const nf = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
  const line = el('div', 'wb-lens');
  line.append(el('span', 'lens-tag', 'genai-lens'));
  if (traceId) line.append(el('code', '', `trace ${traceId.slice(0, 12)}…`));
  line.append(el('span', '', t.via));
  const models = el('div', 'wb-lens');
  for (const m of byModel(spans)) {
    const chip = el('span', 'wf-stat');
    chip.append(el('strong', '', m.model.replace(/^[^/]+\//, '')), document.createTextNode(` ${t.calls(m.calls)} · ${nf.format(m.tokens)} tokens · ${fmtMs(m.ms)}`));
    models.append(chip);
  }
  const wf = el('div', 'waterfall');
  root.replaceChildren(line, ...(models.childElementCount ? [models] : []), wf);
  renderWaterfall(wf, spans, lang);
}
