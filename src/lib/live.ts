// Portão das demos ao vivo: confere a sessão no portal e mostra login, cota ou o formulário.
import { getMe, type Me } from './api';

export interface Gate {
  me: Me | null;
  ready: boolean;
}

export async function gate(root: HTMLElement, quotaKey: string, s: Record<string, string>): Promise<Gate> {
  const notice = root.querySelector<HTMLElement>('[data-gate]')!;
  const form = root.querySelector<HTMLElement>('[data-live]')!;
  const remaining = root.querySelector<HTMLElement>('[data-remaining]');
  const me = await getMe();
  const show = (text: string, link?: { href: string; label: string }) => {
    notice.hidden = false;
    notice.replaceChildren(document.createTextNode(text));
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'btn primary gate-btn';
      a.textContent = link.label;
      notice.append(document.createElement('br'), a);
    }
  };
  if (!me) {
    show(s['login.unavailable']);
    return { me, ready: false };
  }
  if (!me.user) {
    // O portal volta para esta página com ?auth_error=oauth quando o Google/GitHub falha.
    const failed = new URLSearchParams(location.search).has('auth_error');
    show(failed ? s['login.oauthError'] : s['live.needLogin'], { href: `${root.dataset.login}?next=${encodeURIComponent(location.pathname)}`, label: s['login.title'] });
    return { me, ready: false };
  }
  const q = me.quotas[quotaKey];
  if (q && q.remaining <= 0) {
    show(s['live.quota']);
    return { me, ready: false };
  }
  if (quotaKey === 'agents' && me.budget_exhausted) {
    show(s['live.budget']);
    return { me, ready: false };
  }
  notice.hidden = true;
  form.hidden = false;
  if (remaining && q) remaining.textContent = `${q.remaining} ${s['live.remaining']}`;
  return { me, ready: true };
}

export const LIVE_KEYS = ['login.unavailable', 'live.needLogin', 'login.title', 'live.quota', 'live.budget', 'live.error', 'live.remaining', 'live.busy', 'live.invalid', 'login.oauthError'] as const;
