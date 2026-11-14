// Números sobem quando entram na tela, uma vez só. (O aparecer ao rolar é CSS puro, em global.css.)
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || target <= 0) return;
  const suffix = el.dataset.suffix ?? '';
  const dur = 900;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(target * eased)}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setup() {
  if (reduce.matches) return;
  const root = document.documentElement;
  root.classList.add('motion');

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
}

setup();

export {};
