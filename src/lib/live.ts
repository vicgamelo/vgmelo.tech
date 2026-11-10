// Portão das demos ao vivo: confere a sessão no portal e mostra login, cota ou o formulário.
import { route } from '../i18n/routes';
import { getMe, type Me } from './api';

/** Link da agenda já com Consultoria escolhida: é para onde vai quem quer mais que a demo. */
export function consultHref(lang: 'pt' | 'en'): string {
  return `${route('agenda', lang)}?tipo=consultoria`;
}

/** Bloco "quer ir além? marcar uma conversa", usado quando a cota acaba e no fim das demos. */
export function consultCta(s: Record<string, string>, lang: 'pt' | 'en'): HTMLElement {
  const box = document.createElement('div');
  box.className = 'consult-cta';
  const p = document.createElement('p');
  p.textContent = s['live.consultText'];
  const a = document.createElement('a');
  a.href = consultHref(lang);
  a.className = 'btn primary';
  a.textContent = s['live.consult'];
  box.append(p, a);
  return box;
}

const pageLang = (): 'pt' | 'en' => (document.documentElement.lang.startsWith('en') ? 'en' : 'pt');

export interface Gate {
  me: Me | null;
  ready: boolean;
}

export type GateState =
  | { kind: 'unavailable' | 'login' | 'oauthError' | 'quota' | 'budget' | 'tokens' }
  | { kind: 'ready'; remaining: number | null; tokens: number | null };

/** Demos que gastam LLM: entram no teto global e no saldo de tokens de cada usuário. */
const LLM_DEMOS = new Set(['agents', 'studio']);

/** O que a demo mostra para essa sessão. Sem efeito colateral, para dar para testar. */
export function gateState(me: Me | null, quotaKey: string, authError = false): GateState {
  if (!me) return { kind: 'unavailable' };
  if (!me.user) return { kind: authError ? 'oauthError' : 'login' };
  const q = me.quotas[quotaKey];
  if (q && q.remaining <= 0) return { kind: 'quota' };
  const llm = LLM_DEMOS.has(quotaKey);
  if (llm && me.budget_exhausted) return { kind: 'budget' };
  if (llm && me.tokens && me.tokens.remaining <= 0) return { kind: 'tokens' };
  return { kind: 'ready', remaining: q ? q.remaining : null, tokens: llm && me.tokens ? me.tokens.remaining : null };
}

/** "· restam hoje: 9 · 43 mil tokens"; vazio quando a demo não tem cota. */
export function remainingText(
  state: { remaining: number | null; tokens: number | null },
  s: Record<string, string>,
  lang: 'pt' | 'en',
): string {
  if (state.remaining === null) return '';
  const text = `${s['live.remaining']} ${state.remaining}`;
  if (state.tokens === null) return text;
  const n = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en', { notation: 'compact' }).format(state.tokens);
  return `${text} · ${n} ${s['live.tokensUnit']}`;
}

const MESSAGE = {
  unavailable: 'login.unavailable',
  login: 'live.needLogin',
  oauthError: 'login.oauthError',
  quota: 'live.quota',
  budget: 'live.budget',
  tokens: 'live.tokensOut',
} as const;

export async function gate(root: HTMLElement, quotaKey: string, s: Record<string, string>): Promise<Gate> {
  const notice = root.querySelector<HTMLElement>('[data-gate]')!;
  const form = root.querySelector<HTMLElement>('[data-live]')!;
  const remaining = root.querySelector<HTMLElement>('[data-remaining]');
  const me = await getMe();
  // O portal volta para esta página com ?auth_error=oauth quando o Google/GitHub falha.
  const state = gateState(me, quotaKey, new URLSearchParams(location.search).has('auth_error'));
  if (state.kind === 'ready') {
    notice.hidden = true;
    form.hidden = false;
    if (remaining) remaining.textContent = remainingText(state, s, pageLang());
    return { me, ready: true };
  }
  // Qualquer outro estado esconde o formulário: o resultado anterior continua na tela.
  form.hidden = true;
  if (remaining) remaining.textContent = '';
  notice.hidden = false;
  notice.replaceChildren(document.createTextNode(s[MESSAGE[state.kind]]));
  if (state.kind === 'login' || state.kind === 'oauthError') {
    const a = document.createElement('a');
    a.href = `${root.dataset.login}?next=${encodeURIComponent(location.pathname)}`;
    a.className = 'btn primary gate-btn';
    a.textContent = s['login.title'];
    notice.append(document.createElement('br'), a);
  }
  if (state.kind === 'quota' || state.kind === 'budget' || state.kind === 'tokens') notice.append(consultCta(s, pageLang()));
  return { me, ready: false };
}

export const LIVE_KEYS = ['login.unavailable', 'live.needLogin', 'login.title', 'live.quota', 'live.budget', 'live.error', 'live.remaining', 'live.busy', 'live.invalid', 'login.oauthError', 'live.consultText', 'live.consult', 'live.tokensOut', 'live.tokensUnit'] as const;
