// Cascata do trace (spans do genai-lens), em ordem de árvore (DFS), como no painel do lens.

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
}

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

export function renderWaterfall(el: HTMLElement, spans: Span[]): void {
  const rows = treeOrder(spans);
  const t0 = Math.min(...spans.map((s) => Date.parse(s.start_time)));
  const t1 = Math.max(...spans.map((s) => Date.parse(s.start_time) + (s.duration_ms ?? 0)));
  const total = Math.max(t1 - t0, 1);
  el.replaceChildren(
    ...rows.map(({ span, depth }) => {
      const row = document.createElement('div');
      row.className = 'wf-row';
      const label = document.createElement('div');
      label.className = 'wf-label';
      label.style.paddingLeft = `${depth * 14}px`;
      const tokens = (span.input_tokens ?? 0) + (span.output_tokens ?? 0);
      label.textContent = span.name;
      label.title = [span.kind, span.model, tokens ? `${tokens} tokens` : ''].filter(Boolean).join(' · ');
      const track = document.createElement('div');
      track.className = 'wf-track';
      const bar = document.createElement('span');
      bar.className = `wf-bar wf-${span.kind}${span.status === 'error' ? ' wf-error' : ''}`;
      bar.style.left = `${((Date.parse(span.start_time) - t0) / total) * 100}%`;
      bar.style.width = `${Math.max(((span.duration_ms ?? 0) / total) * 100, 0.5)}%`;
      const ms = document.createElement('span');
      ms.className = 'wf-ms';
      ms.textContent = `${Math.round(span.duration_ms ?? 0)} ms`;
      track.append(bar);
      row.append(label, track, ms);
      return row;
    }),
  );
}
