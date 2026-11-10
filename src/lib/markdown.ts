// Markdown mínimo para a resposta dos agentes. Vira uma árvore de blocos e depois DOM com
// textContent: nada de innerHTML, então HTML vindo do modelo aparece como texto, nunca executa.
// Cobre o que os modelos costumam escrever: títulos, parágrafos, listas (com um nível de
// aninhamento), tabelas, código, citação, negrito, itálico, código inline e links http(s).

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };

export interface ListItem {
  c: Inline[];
  children: Block[];
}

export type Align = 'left' | 'right' | 'center' | null;

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul'; items: ListItem[] }
  | { t: 'ol'; start: number; items: ListItem[] }
  | { t: 'code'; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] };

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\*(?![\s*])(.+?)(?<![\s*])\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function safeHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
  };
  let i = 0;
  for (const m of s.matchAll(INLINE)) {
    text(s.slice(i, m.index));
    i = m.index! + m[0].length;
    if (m[1] !== undefined) out.push({ t: 'code', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'strong', c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: 'em', c: parseInline(m[3]) });
    else {
      const href = safeHref(m[5]);
      // Link com esquema estranho (javascript:, data:...) vira só o texto.
      if (href) out.push({ t: 'link', href, c: parseInline(m[4]) });
      else text(m[4]);
    }
  }
  text(s.slice(i));
  return out;
}

/** Parágrafo com quebras de linha simples virando <br>, como num chat. */
function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, k) => {
    if (k) out.push({ t: 'br' });
    out.push(...parseInline(l.trim()));
  });
  return out;
}

const RE = {
  fence: /^\s*```/,
  heading: /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s{0,3}>\s?/,
  ul: /^(\s*)[-*+]\s+(.*)$/,
  ol: /^(\s*)(\d{1,9})[.)]\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};

const indentOf = (l: string) => l.length - l.trimStart().length;

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes('-');
}

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i];
  return RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.ul.test(l) || RE.ol.test(l) || isTableStart(lines, i);
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (RE.fence.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !RE.fence.test(lines[i])) body.push(lines[i++]);
      i++; // fecha a cerca (ou passa do fim)
      blocks.push({ t: 'code', v: body.join('\n') });
      continue;
    }
    const h = RE.heading.exec(line);
    if (h) {
      blocks.push({ t: 'h', level: h[1].length, c: parseInline(h[2]) });
      i++;
      continue;
    }
    if (RE.hr.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (RE.quote.test(line)) {
      const body: string[] = [];
      while (i < lines.length && RE.quote.test(lines[i])) body.push(lines[i++].replace(RE.quote, ''));
      blocks.push({ t: 'quote', c: parseBlocks(body) });
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = cells(line);
      const align: Align[] = cells(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null,
      );
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const r = cells(lines[i++]);
        rows.push(head.map((_, k) => parseInline(r[k] ?? '')));
      }
      blocks.push({ t: 'table', align: head.map((_, k) => align[k] ?? null), head: head.map(parseInline), rows });
      continue;
    }
    const ul = RE.ul.exec(line);
    const ol = RE.ol.exec(line);
    if (ul || ol) {
      const ordered = !ul;
      const base = indentOf(line);
      const items: ListItem[] = [];
      let cur: { first: string; rest: string[] } | null = null;
      const flush = () => {
        if (!cur) return;
        // Linhas da continuação: as recuadas viram blocos filhos (sublista); as outras, texto do item.
        const firstChild = cur.rest.findIndex((l) => RE.ul.test(l) || RE.ol.test(l) || RE.fence.test(l));
        const textLines = firstChild < 0 ? cur.rest : cur.rest.slice(0, firstChild);
        const childLines = firstChild < 0 ? [] : cur.rest.slice(firstChild);
        const minIndent = Math.min(...childLines.filter((l) => l.trim()).map(indentOf), Infinity);
        items.push({
          c: inlineLines([cur.first, ...textLines.filter((l) => l.trim())]),
          children: childLines.length ? parseBlocks(childLines.map((l) => l.slice(Math.min(minIndent, indentOf(l))))) : [],
        });
        cur = null;
      };
      while (i < lines.length) {
        const l = lines[i];
        const mu = RE.ul.exec(l);
        const mo = RE.ol.exec(l);
        const m = ordered ? mo : mu;
        if (m && indentOf(l) <= base) {
          flush();
          cur = { first: ordered ? m[3] : m[2], rest: [] };
          i++;
          continue;
        }
        if (!l.trim()) {
          // Linha em branco: a lista continua se a próxima linha ainda for item ou continuação recuada.
          const next = lines[i + 1];
          if (next !== undefined && (indentOf(next) > base || (ordered ? RE.ol : RE.ul).test(next))) {
            i++;
            continue;
          }
          break;
        }
        if (indentOf(l) > base && cur) {
          cur.rest.push(l);
          i++;
          continue;
        }
        if (cur && !startsBlock(lines, i) && cur.rest.length === 0) {
          cur.rest.push(l); // continuação preguiçosa do texto do item
          i++;
          continue;
        }
        break;
      }
      flush();
      blocks.push(ordered ? { t: 'ol', start: Number(ol![2]), items } : { t: 'ul', items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++]);
    blocks.push({ t: 'p', c: inlineLines(para) });
  }
  return blocks;
}

/** Texto puro dos blocos (para contagem e testes). */
export function plainText(blocks: Block[]): string {
  const inl = (c: Inline[]): string =>
    c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'br' ? '\n' : inl(x.c))).join('');
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
        case 'h':
          return inl(b.c);
        case 'ul':
        case 'ol':
          return b.items.map((it) => [inl(it.c), plainText(it.children)].filter(Boolean).join('\n')).join('\n');
        case 'code':
          return b.v;
        case 'quote':
          return plainText(b.c);
        case 'hr':
          return '';
        case 'table':
          return [b.head, ...b.rows].map((r) => r.map(inl).join(' | ')).join('\n');
      }
    })
    .filter(Boolean)
    .join('\n');
}

// ------------------------------------------------------------------ DOM

function inlineDom(c: Inline[]): Node[] {
  return c.map((x) => {
    if (x.t === 'text') return document.createTextNode(x.v);
    if (x.t === 'br') return document.createElement('br');
    if (x.t === 'code') {
      const el = document.createElement('code');
      el.textContent = x.v;
      return el;
    }
    if (x.t === 'link') {
      const a = document.createElement('a');
      a.href = x.href;
      a.rel = 'noopener noreferrer nofollow';
      a.target = '_blank';
      a.append(...inlineDom(x.c));
      return a;
    }
    const el = document.createElement(x.t);
    el.append(...inlineDom(x.c));
    return el;
  });
}

function blockDom(b: Block): HTMLElement {
  switch (b.t) {
    case 'p': {
      const el = document.createElement('p');
      el.append(...inlineDom(b.c));
      return el;
    }
    case 'h': {
      // A página já tem h1/h2: os títulos da resposta começam em h3.
      const el = document.createElement(`h${Math.min(b.level + 2, 6)}`);
      el.append(...inlineDom(b.c));
      return el;
    }
    case 'ul':
    case 'ol': {
      const el = document.createElement(b.t);
      if (b.t === 'ol' && b.start !== 1) (el as HTMLOListElement).start = b.start;
      for (const it of b.items) {
        const li = document.createElement('li');
        li.append(...inlineDom(it.c), ...it.children.map(blockDom));
        el.append(li);
      }
      return el;
    }
    case 'code': {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = b.v;
      pre.append(code);
      return pre;
    }
    case 'quote': {
      const el = document.createElement('blockquote');
      el.append(...b.c.map(blockDom));
      return el;
    }
    case 'hr':
      return document.createElement('hr');
    case 'table': {
      const wrap = document.createElement('div');
      wrap.className = 'md-table';
      const table = document.createElement('table');
      const row = (cellsIn: Inline[][], tag: 'th' | 'td') => {
        const tr = document.createElement('tr');
        cellsIn.forEach((c, k) => {
          const cell = document.createElement(tag);
          if (b.align[k]) cell.className = `al-${b.align[k]}`;
          cell.append(...inlineDom(c));
          tr.append(cell);
        });
        return tr;
      };
      const thead = document.createElement('thead');
      thead.append(row(b.head, 'th'));
      const tbody = document.createElement('tbody');
      tbody.append(...b.rows.map((r) => row(r, 'td')));
      table.append(thead, tbody);
      wrap.append(table);
      return wrap;
    }
  }
}

export function renderMarkdown(el: HTMLElement, src: string): void {
  el.replaceChildren(...parseMarkdown(src).map(blockDom));
}
