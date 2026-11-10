// Abas acessíveis (role=tablist) e o seletor de telas do painel no celular.

/** Próxima aba visível com as setas, Home e End; null quando a tecla não é de navegação. */
export function nextTab(keys: string[], current: string, key: string): string | null {
  if (!keys.length) return null;
  const i = Math.max(0, keys.indexOf(current));
  if (key === 'ArrowRight') return keys[(i + 1) % keys.length];
  if (key === 'ArrowLeft') return keys[(i - 1 + keys.length) % keys.length];
  if (key === 'Home') return keys[0];
  if (key === 'End') return keys[keys.length - 1];
  return null;
}

export interface Tabs {
  select(key: string): void;
  current(): string;
  /** Mostra ou esconde uma aba; se for a aberta, abre a primeira visível. */
  toggle(key: string, visible: boolean): void;
}

/** Liga os botões [data-tab] da barra aos painéis do aria-controls de cada um. */
export function tabs(bar: HTMLElement, onSelect?: (key: string) => void): Tabs {
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  bar.setAttribute('role', 'tablist');
  let open = buttons[0]?.dataset.tab ?? '';
  const pane = (b: HTMLButtonElement) => document.getElementById(b.getAttribute('aria-controls') ?? '');
  const visible = () => buttons.filter((b) => !b.hidden).map((b) => b.dataset.tab!);
  const select = (key: string) => {
    open = key;
    for (const b of buttons) {
      const on = b.dataset.tab === key;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const p = pane(b);
      if (p) {
        p.setAttribute('role', 'tabpanel');
        p.hidden = !on;
      }
    }
    onSelect?.(key);
  };
  for (const b of buttons) {
    b.type = 'button';
    b.classList.add('wb-tab');
    b.addEventListener('click', () => select(b.dataset.tab!));
    b.addEventListener('keydown', (e) => {
      const to = nextTab(visible(), open, e.key);
      if (!to) return;
      e.preventDefault();
      select(to);
      buttons.find((x) => x.dataset.tab === to)?.focus();
    });
  }
  if (open) select(open);
  return {
    select,
    current: () => open,
    toggle(key, show) {
      const b = buttons.find((x) => x.dataset.tab === key);
      if (!b) return;
      b.hidden = !show;
      if (!show && open === key) select(visible()[0] ?? '');
    },
  };
}

/** Telas do painel no celular (a, b, c): marca o botão e põe data-view na raiz. */
export function views(root: HTMLElement, onSelect?: (view: string) => void): (view: string) => void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-view-btn]')];
  const select = (view: string) => {
    root.dataset.view = view;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.viewBtn === view));
    onSelect?.(view);
  };
  for (const b of buttons) {
    b.type = 'button';
    b.addEventListener('click', () => {
      select(b.dataset.viewBtn!);
      root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  select(root.dataset.view || buttons[0]?.dataset.viewBtn || 'a');
  return select;
}
