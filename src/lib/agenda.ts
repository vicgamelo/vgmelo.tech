// Cliente do vgmelo-agenda (mesmo domínio, /api/agenda). Sem cookie: quem prova a reserva é o token
// que vai no link do e-mail (no fragmento #, que não chega a log nem a Referer).
import type { Lang } from '../i18n/routes';

export type Kind = 'job' | 'consulting';

export interface AgendaConfig {
  timezone: string;
  kinds: Record<Kind, { durations: number[] }>;
  step_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  max_per_day: number;
  hold_minutes: number;
  change_cutoff_hours: number;
  calendar_ok: boolean;
  agent: boolean;
  agent_max_chars: number;
  mcp_url: string;
}

export interface SlotsResponse {
  timezone: string;
  calendar_ok: boolean;
  /** Dias no fuso do Victor; cada início em UTC (ISO com Z). */
  days: { date: string; starts: string[] }[];
}

export interface BookingView {
  role: 'guest' | 'owner';
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  kind: Kind;
  duration: number;
  start: string;
  end: string;
  lang: Lang;
  name: string;
  hold_until: string | null;
  can_confirm: boolean;
  can_cancel: boolean;
  can_reschedule: boolean;
  durations: number[];
  meeting_url: string;
  email?: string;
  company?: string | null;
  topic?: string;
  source?: string;
}

export interface ChatReply {
  conversation: string;
  reply: string;
  remaining: number;
}

export type AgendaError = { status: number; code?: string };

/** Campos que o `BookingIn` do serviço aceita (extra="forbid": qualquer outro vira 422). */
export const BOOKING_FIELDS = [
  'kind', 'start', 'duration', 'name', 'email', 'company', 'topic', 'lang', 'tz', 'website', 'started_at',
] as const; // prettier-ignore

/** Campos do `ChatIn`. */
export const CHAT_FIELDS = ['conversation', 'message', 'lang', 'tz'] as const;

export async function agendaApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/agenda${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'omit',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      const j = (await res.json()) as { detail?: { code?: unknown } };
      code = typeof j?.detail?.code === 'string' ? j.detail.code : undefined;
    } catch {
      /* corpo vazio */
    }
    throw { status: res.status, code } satisfies AgendaError;
  }
  return (await res.json()) as T;
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

const locale = (lang: Lang) => (lang === 'pt' ? 'pt-BR' : 'en');

/** 'AAAA-MM-DD' do instante no fuso dado. */
export function localDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function timeLabel(iso: string, tz: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

export function dayLabel(date: string, lang: Lang): string {
  // Meio-dia UTC: o rótulo do dia não muda com fuso.
  return new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function whenLabel(iso: string, tz: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export interface Day {
  date: string;
  times: { iso: string; label: string }[];
}

/** Reagrupa os inícios (UTC) por dia no fuso de quem está vendo. 18h em São Paulo pode ser amanhã em Tóquio. */
export function groupByLocalDay(slots: SlotsResponse, tz: string, lang: Lang): Day[] {
  const days = new Map<string, Day>();
  for (const iso of slots.days.flatMap((d) => d.starts).sort()) {
    const date = localDate(iso, tz);
    if (!days.has(date)) days.set(date, { date, times: [] });
    days.get(date)!.times.push({ iso, label: timeLabel(iso, tz, lang) });
  }
  return [...days.values()];
}

export interface BookingForm {
  kind: Kind;
  start: string;
  duration: number;
  name: string;
  email: string;
  company: string;
  topic: string;
  website: string;
}

/** Corpo do POST /bookings. `started_at` em milissegundos (o serviço descarta, sem avisar, fora de 3 s a 24 h). */
export function bookingBody(v: BookingForm, lang: Lang, tz: string, startedAtMs: number): Record<string, unknown> {
  const body: Record<string, unknown> = {
    kind: v.kind,
    start: v.start,
    duration: Number(v.duration),
    name: v.name.trim(),
    email: v.email.trim(),
    topic: v.topic.trim(),
    lang,
    tz,
    website: v.website,
    started_at: Math.floor(startedAtMs),
  };
  if (v.company.trim()) body.company = v.company.trim();
  return body;
}

export function chatBody(message: string, conversation: string | null, lang: Lang, tz: string): Record<string, unknown> {
  const body: Record<string, unknown> = { message, lang, tz };
  if (conversation) body.conversation = conversation;
  return body;
}

/** Token do link do e-mail (fragmento). Qualquer outra coisa é ignorada. */
export function tokenFromHash(hash: string): string | null {
  const t = hash.replace(/^#/, '');
  return /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}

/** Só links https viram href (o meeting_url vem do servidor, mas não custa). */
export function safeHttps(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Mensagem para o código de erro do serviço; `fallback` para o resto. */
export function errorText(err: unknown, messages: Record<string, string>, fallback: string): string {
  const e = err as AgendaError;
  if (e?.code && messages[e.code]) return messages[e.code];
  if (e?.status === 429 && messages.rate_limited) return messages.rate_limited;
  return fallback;
}

// ---- calendário ----

/** 'AAAA-MM' do dia 'AAAA-MM-DD'. */
export const monthOf = (date: string) => date.slice(0, 7);

/** Mês somado de `delta` ('2026-12' + 1 = '2027-01'). */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Semanas do mês, começando no domingo; `null` nas casas fora do mês. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= total; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(month: string, lang: Lang): string {
  const s = new Intl.DateTimeFormat(locale(lang), {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Iniciais dos dias da semana, de domingo a sábado. */
export function weekdayLabels(lang: Lang): string[] {
  const f = new Intl.DateTimeFormat(locale(lang), {
    timeZone: 'UTC',
    weekday: 'short',
  });
  // 2026-11-01 foi domingo.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 10, 1 + i, 12))).replace('.', ''));
}

/** Título do dia escolhido: "quarta-feira, 11 de novembro". */
export function longDayLabel(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}

export type Period = 'morning' | 'afternoon' | 'evening';

/** Período do horário no fuso de quem vê: antes das 12h, antes das 18h, depois. */
export function periodOf(iso: string, tz: string): Period {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso)),
  );
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

/** Horários do dia agrupados por período, na ordem manhã, tarde, noite, sem grupos vazios. */
export function byPeriod(day: Day, tz: string): { period: Period; times: Day['times'] }[] {
  const order: Period[] = ['morning', 'afternoon', 'evening'];
  return order
    .map((period) => ({
      period,
      times: day.times.filter((t) => periodOf(t.iso, tz) === period),
    }))
    .filter((g) => g.times.length > 0);
}

/** Meses que têm algum dia livre, em ordem. */
export function monthsWithSlots(days: Day[]): string[] {
  return [...new Set(days.map((d) => monthOf(d.date)))].sort();
}
