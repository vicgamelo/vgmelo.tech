// Console do genai-lens na home: reproduz o trace como se estivesse rodando agora.
// Cada barra cresce no tempo do próprio span, uma agulha varre a linha do tempo, tokens e tempo sobem e o selo
// vira "200 OK" no fim. Repete enquanto o console está na tela, até 3 vezes; depois, o botão roda de novo.
// Sem JS ou com "reduzir movimento", fica o estado final que já vem no HTML.
const fig = document.querySelector<HTMLElement>('[data-trace]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (fig && !reduce) {
  const rows = [...fig.querySelectorAll<HTMLElement>('.span')].map((li) => ({
    li,
    start: Number(li.dataset.start) / 100,
    end: (Number(li.dataset.start) + Number(li.dataset.dur)) / 100,
    bar: li.querySelector<SVGRectElement>('.span-bar')!,
    tool: li.classList.contains('tool'),
  }));
  const trace = fig.querySelector<HTMLElement>('.trace')!;
  const head = fig.querySelector<HTMLElement>('[data-playhead]')!;
  const pill = fig.querySelector<HTMLElement>('[data-pill]')!;
  const tokensEl = fig.querySelector<HTMLElement>('[data-tokens]')!;
  const toolsEl = fig.querySelector<HTMLElement>('[data-tools]')!;
  const replay = fig.querySelector<HTMLButtonElement>('[data-replay]')!;
  const TOKENS = Number(tokensEl.dataset.tokens);
  const RUN_MS = 4200; // 5,7 s do trace, um pouco acelerados
  const REAL_S = 5.7;
  const HOLD_MS = 3200;
  const MAX_LOOPS = 3;
  const locale = document.documentElement.lang || 'pt-BR';
  const fmt = new Intl.NumberFormat(locale);
  const fmt1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let raf = 0;
  let wait = 0;
  let loops = 0;
  let visible = false;

  // Coluna das barras: posição e largura para a agulha.
  const measure = () => {
    const track = fig.querySelector<SVGElement>('.span-track');
    if (!track) return { x: 0, w: 0 };
    const a = trace.getBoundingClientRect();
    const b = track.getBoundingClientRect();
    return { x: b.left - a.left, w: b.width };
  };

  const paint = (p: number) => {
    const { x, w } = measure();
    head.style.setProperty('--pl', `${x + w * p}px`);
    let tools = 0;
    for (const r of rows) {
      const k = r.end > r.start ? Math.min(1, Math.max(0, (p - r.start) / (r.end - r.start))) : 1;
      r.bar.style.setProperty('transform', `scaleX(${k})`);
      r.li.classList.toggle('wait', p < r.end);
      r.li.classList.toggle('active', p >= r.start && p < r.end);
      if (r.tool && p >= r.end) tools++;
    }
    tokensEl.textContent = fmt.format(Math.round(TOKENS * Math.min(1, p * 1.05)));
    toolsEl.textContent = String(tools);
    pill.textContent = p < 1 ? `${fmt1.format(REAL_S * p)} s` : '200 OK';
  };

  const finish = () => {
    fig.classList.remove('running');
    for (const r of rows) r.li.classList.remove('wait', 'active');
    paint(1);
    loops++;
    if (loops >= MAX_LOOPS) {
      replay.hidden = false;
      return;
    }
    wait = window.setTimeout(() => visible && !document.hidden && run(), HOLD_MS);
  };

  const run = () => {
    cancelAnimationFrame(raf);
    clearTimeout(wait);
    replay.hidden = true;
    fig.classList.add('running');
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / RUN_MS);
      paint(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
  };

  replay.addEventListener('click', () => {
    loops = MAX_LOOPS - 1;
    run();
  });

  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible && loops < MAX_LOOPS && !fig.classList.contains('running')) run();
      if (!visible) clearTimeout(wait);
    },
    { threshold: 0.4 },
  ).observe(fig);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(wait);
  });
}

export {};
