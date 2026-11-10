// Desenha a árvore de uma execução (agentes, passos do LLM, ferramentas, delegações) a partir do
// RunState de agentRun.ts. Usada pela demo de agentes e pelo estúdio; os estilos ficam em styles/run.css.
import { agentLabel, argsLine, DELEGATE_PREFIX, prettyResult, toolLabel, type AgentNode, type Step } from './agentRun';
import { renderMarkdown } from './markdown';
import { fmtMs } from './waterfall';

/** Textos usados: decided, wrote, cutoff, thinking, delegated, result, answerOf, error. */
export type TreeText = Record<string, string>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface RunTree {
  card: (node: AgentNode) => HTMLElement;
  /** Esquece quais detalhes estavam abertos (nova execução). */
  reset: () => void;
}

/** `label` troca o nome mostrado de um agente (no estúdio, o nome que a pessoa deu). */
export function runTree(L: TreeText, lang: 'pt' | 'en', label: (name: string) => string = (n) => agentLabel(n, lang)): RunTree {
  const open = new Set<string>(); // <details> abertos sobrevivem aos re-renders
  const details = (key: string, summary: string, body: HTMLElement) => {
    const d = el('details', 'st-details');
    d.open = open.has(key);
    d.addEventListener('toggle', () => (d.open ? open.add(key) : open.delete(key)));
    d.append(el('summary', '', summary), body);
    return d;
  };
  const dur = (from: number, to?: number) => (to === undefined ? '' : fmtMs(to - from));

  function stepNode(step: Step, node: AgentNode): HTMLElement {
    if (step.kind === 'llm') {
      const li = el('li', 'st st-llm');
      li.append(el('span', 'st-icon'));
      const body = el('div', 'st-body');
      const line = el('div', 'st-line');
      line.append(el('span', 'st-kind', 'LLM'));
      if (step.calls.length) {
        line.append(document.createTextNode(`${L.decided} `));
        step.calls.forEach((c, k) => {
          if (k) line.append(document.createTextNode(', '));
          line.append(el('code', '', c.startsWith(DELEGATE_PREFIX) ? label(c.slice(DELEGATE_PREFIX.length)) : toolLabel(c)));
        });
      } else {
        line.append(document.createTextNode(step.stop === 'max_tokens' || step.stop === 'length' ? L.cutoff : L.wrote));
      }
      body.append(line);
      if (step.calls.length && step.text.trim()) body.append(el('p', 'st-thought', step.text.trim().slice(0, 400)));
      li.append(body);
      return li;
    }
    if (step.kind === 'error') {
      const li = el('li', 'st st-err');
      li.append(el('span', 'st-icon'), el('div', 'st-body', `${L.error}: ${step.message}`));
      return li;
    }
    if (step.child) {
      const li = el('li', 'st st-deleg');
      li.append(el('span', 'st-icon'));
      const body = el('div', 'st-body');
      const line = el('div', 'st-line');
      line.append(el('span', 'st-kind', L.delegated), el('strong', '', label(step.child.name)));
      body.append(line, card(step.child));
      li.append(body);
      return li;
    }
    const li = el('li', `st st-tool${step.failed ? ' is-failed' : ''}${step.result === undefined ? ' is-running' : ''}`);
    li.append(el('span', 'st-icon'));
    const body = el('div', 'st-body');
    const line = el('div', 'st-line');
    line.append(el('code', 'st-tool-name', toolLabel(step.tool)));
    const args = argsLine(step.args);
    if (args) line.append(el('span', 'st-args', args));
    const meta = el('span', 'st-meta');
    if (step.result === undefined) meta.append(el('span', 'spinner'));
    else meta.textContent = step.failed ? L.error : dur(step.startedAt, step.endedAt);
    line.append(meta);
    body.append(line);
    if (step.result !== undefined) body.append(details(`r${node.id}-${step.id}`, L.result, el('pre', 'st-pre', prettyResult(step.result))));
    li.append(body);
    return li;
  }

  function card(n: AgentNode): HTMLElement {
    const box = el('div', `ag ag-${n.name}`);
    box.dataset.status = n.status;
    const head = el('div', 'ag-head');
    const who = el('div', 'ag-who');
    const name = label(n.name);
    who.append(el('span', `avatar a-${n.name}`, (name[0] ?? '?').toUpperCase()), el('strong', '', name));
    const right = el('span', 'ag-state');
    if (n.status === 'running') right.append(el('span', 'spinner'), document.createTextNode(L.thinking));
    else right.textContent = dur(n.startedAt, n.endedAt);
    head.append(who, right);
    box.append(head);
    if (n.depth > 0 && n.task) box.append(el('p', 'ag-task', n.task));
    const ol = el('ol', 'ag-steps');
    for (const st of n.steps) ol.append(stepNode(st, n));
    if (ol.childElementCount) box.append(ol);
    if (n.depth > 0 && n.output) {
      const md = el('div', 'md md-small');
      renderMarkdown(md, n.output);
      box.append(details(`o${n.id}`, `${L.answerOf} ${label(n.name)}`, md));
    }
    return box;
  }

  return { card, reset: () => open.clear() };
}
