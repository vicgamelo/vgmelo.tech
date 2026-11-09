// Cliente do vgmelo-portal (mesmo domínio, cookie de sessão HttpOnly).
// O contrato está no README do portal; aqui só o que o site usa.

export interface Me {
  user: { id: string; name: string | null; email: string | null; provider: string; mfa: boolean } | null;
  quotas: Record<string, { used: number; limit: number }>;
  email_login?: boolean;
}

export type ApiError = { status: number; reason?: string };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let reason: string | undefined;
    try {
      reason = (await res.json()).reason;
    } catch {
      /* corpo vazio */
    }
    throw { status: res.status, reason } satisfies ApiError;
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
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
  if (e?.status === 429) return t['live.quota'];
  return t['live.error'];
}
