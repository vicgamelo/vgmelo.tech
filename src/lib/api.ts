// Cliente do vgmelo-portal (mesmo domínio, cookie de sessão HttpOnly).
// O contrato está no README do portal; aqui só o que o site usa.

export interface Quota {
  limit: number;
  used: number;
  remaining: number;
}

export interface Me {
  user: { id: string; name: string | null; email: string | null; provider: string; mfa: boolean } | null;
  /** Sessão de e-mail que ainda precisa ativar o TOTP (user vem null). */
  pending: 'totp_setup' | null;
  providers: { google: boolean; github: boolean; email: boolean };
  quotas: Record<string, Quota>;
  resets_at: string;
  budget_exhausted: boolean;
}

export type ApiError = { status: number; reason?: string; message?: string };

/**
 * O portal responde erro em dois formatos: limites (429) vêm como
 * `{reason, retry_at}`, e o resto como `{detail: "motivo"}` ou
 * `{detail: {reason, message}}` (erro de ferramenta do MCP).
 */
export function errorFromBody(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as { reason?: unknown; detail?: unknown };
  if (typeof b.reason === 'string') return { status, reason: b.reason };
  if (typeof b.detail === 'string') return { status, reason: b.detail };
  if (b.detail && typeof b.detail === 'object' && !Array.isArray(b.detail)) {
    const d = b.detail as { reason?: unknown; message?: unknown };
    return {
      status,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
    };
  }
  return { status };
}

export async function errorFrom(res: Response): Promise<ApiError> {
  try {
    return errorFromBody(res.status, await res.json());
  } catch {
    return { status: res.status }; // corpo vazio ou não-JSON
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw await errorFrom(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** O segredo do TOTP para digitar à mão, tirado do `otpauth://` que o portal devolve. */
export function totpSecret(otpauthUri: string): string {
  try {
    return new URL(otpauthUri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

/** Corpo do formulário de contato. `started_at` vai em milissegundos, como o portal espera. */
export function contactBody(values: Record<string, string>, startedAtMs: number): Record<string, unknown> {
  return { ...values, started_at: Math.floor(startedAtMs) };
}

/**
 * Busca o trace de uma execução. O orquestrador exporta os spans para o genai-lens
 * em lote, então logo depois do `done` o portal pode responder 404: tenta de novo.
 */
export async function fetchTrace<T>(
  traceId: string,
  get: (path: string) => Promise<T> = (path) => api<T>(path),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  delays: number[] = [800, 1500, 2500, 4000],
): Promise<T> {
  const path = `/api/demo/traces/${encodeURIComponent(traceId)}`;
  for (let i = 0; ; i++) {
    try {
      return await get(path);
    } catch (err) {
      if ((err as ApiError)?.status !== 404 || i >= delays.length) throw err;
      await wait(delays[i]);
    }
  }
}

export async function getMe(): Promise<Me | null> {
  try {
    return await api<Me>('/api/me');
  } catch {
    return null; // portal fora do ar ou ainda não publicado
  }
}

/** Lê um corpo SSE (`event:` + `data:`) e chama `onEvent` por evento. */
export async function readSse(res: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      const text = data.join('\n');
      try {
        onEvent(event, JSON.parse(text));
      } catch {
        onEvent(event, text);
      }
    }
  }
}

/** Mensagem amigável para os erros que o portal devolve. */
export function liveError(err: unknown, t: Record<string, string>): string {
  const e = err as ApiError;
  if (e?.status === 401) return t['live.needLogin'];
  if (e?.status === 429 && e.reason === 'global_budget') return t['live.budget'];
  if (e?.status === 429 && e.reason === 'busy') return t['live.busy'];
  if (e?.status === 429) return t['live.quota'];
  if (e?.status === 422 && e.reason === 'tool_error' && e.message) return e.message;
  if (e?.status === 422) return t['live.invalid'];
  return t['live.error'];
}
