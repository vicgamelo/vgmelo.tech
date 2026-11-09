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
  if (!me.user || (me.user.provider === 'email' && !me.user.mfa)) {
    show(s['live.needLogin'], { href: `${root.dataset.login}?next=${encodeURIComponent(location.pathname)}`, label: s['login.title'] });
    return { me, ready: false };
  }
  const q = me.quotas[quotaKey];
  if (q && q.used >= q.limit) {
    show(s['live.quota']);
    return { me, ready: false };
  }
  notice.hidden = true;
  form.hidden = false;
  if (remaining && q) remaining.textContent = `${q.limit - q.used} ${s['live.remaining']}`;
  return { me, ready: true };
}

export const LIVE_KEYS = ['login.unavailable', 'live.needLogin', 'login.title', 'live.quota', 'live.budget', 'live.error', 'live.remaining'] as const;
