// Contrato com o vgmelo-portal (README do portal). Cada caso aqui veio de uma
// divergência real entre o que o site mandava/lia e o que o portal aceita/devolve.
import { describe, expect, it } from 'vitest';
import { contactBody, errorFromBody, fetchTrace, liveError, totpSecret, type ApiError, type Me } from '../src/lib/api';
import { gateState } from '../src/lib/live';
import { pipelineBody, PRESETS } from '../src/lib/credit';

const T = {
  'live.needLogin': 'login',
  'live.quota': 'quota',
  'live.budget': 'budget',
  'live.busy': 'busy',
  'live.invalid': 'invalid',
  'live.error': 'error',
};

describe('contato', () => {
  it('started_at vai em milissegundos', () => {
    // O portal faz time.time() - started_at / 1000 e descarta (sem avisar) fora de 3 s a 24 h.
    const rendered = Date.UTC(2026, 10, 9, 12, 0, 0);
    const body = contactBody({ name: 'Ana', email: 'ana@example.com', kind: 'job', message: 'x'.repeat(20), website: '' }, rendered);
    expect(body.started_at).toBe(rendered);
    const elapsed = (rendered + 10_000) / 1000 - (body.started_at as number) / 1000;
    expect(elapsed).toBeGreaterThanOrEqual(3);
    expect(elapsed).toBeLessThanOrEqual(86_400);
  });
});

describe('score de crédito', () => {
  // Campos do `Draft` do portal (extra="forbid", todos obrigatórios, null permitido), iguais ao /predict.
  const PORTAL_FIELDS = [
    'checking_status', 'duration', 'credit_history', 'purpose', 'credit_amount', 'savings_status',
    'employment', 'installment_commitment', 'other_parties', 'residence_since', 'property_magnitude',
    'age', 'other_payment_plans', 'housing', 'existing_credits', 'job', 'num_dependents', 'own_telephone',
  ].sort();

  it('o pipeline recebe os 18 campos, com null no que ficou sem resposta', () => {
    const body = pipelineBody({ age: 30, purpose: 'radio/tv', duration: '' }, 'en');
    expect(Object.keys(body)).toEqual(['applicant', 'lang']);
    expect(Object.keys(body.applicant).sort()).toEqual(PORTAL_FIELDS);
    expect(body.applicant.age).toBe(30);
    expect(body.applicant.duration).toBeNull();
    expect(body.applicant.housing).toBeNull();
    expect(body.lang).toBe('en');
  });

  it('não manda campo que o portal recusaria', () => {
    const body = pipelineBody({ ...PRESETS.high, personal_status: 'male single', extra: 1 }, 'pt');
    expect(body.applicant).not.toHaveProperty('personal_status');
    expect(body.applicant).not.toHaveProperty('extra');
  });

  it('os perfis prontos têm todos os campos', () => {
    for (const p of Object.values(PRESETS)) expect(Object.keys(p).sort()).toEqual(PORTAL_FIELDS);
  });
});

describe('erros do portal', () => {
  it('429 vem como {reason}', () => {
    expect(errorFromBody(429, { reason: 'global_budget', retry_at: 'x' })).toEqual({ status: 429, reason: 'global_budget' });
  });

  it('o resto vem como {detail: "motivo"}', () => {
    expect(errorFromBody(401, { detail: 'login_required' })).toEqual({ status: 401, reason: 'login_required' });
    expect(errorFromBody(502, { detail: 'upstream_unavailable' }).reason).toBe('upstream_unavailable');
  });

  it('erro de ferramenta MCP vem como {detail: {reason, message}} e a mensagem chega na tela', () => {
    const e = errorFromBody(422, { detail: { reason: 'tool_error', message: 'CEP não encontrado' } });
    expect(e).toEqual({ status: 422, reason: 'tool_error', message: 'CEP não encontrado' });
    expect(liveError(e, T)).toBe('CEP não encontrado');
  });

  it('validação do FastAPI (lista em detail) não quebra', () => {
    const e = errorFromBody(422, { detail: [{ loc: ['body', 'cep'], msg: 'bad' }] });
    expect(e).toEqual({ status: 422 });
    expect(liveError(e, T)).toBe('invalid');
  });

  it.each([
    [{ status: 401 }, 'login'],
    [{ status: 429, reason: 'daily_quota' }, 'quota'],
    [{ status: 429, reason: 'global_budget' }, 'budget'],
    [{ status: 429, reason: 'busy' }, 'busy'],
    [{ status: 502, reason: 'upstream_unavailable' }, 'error'],
  ] as [ApiError, string][])('liveError %o', (e, msg) => {
    expect(liveError(e, T)).toBe(msg);
  });
});

describe('TOTP', () => {
  it('o segredo para digitar à mão sai do otpauth_uri (o portal não manda `secret`)', () => {
    const uri = 'otpauth://totp/vgmelo.tech:ana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=vgmelo.tech';
    expect(totpSecret(uri)).toBe('JBSWY3DPEHPK3PXP');
    expect(totpSecret('lixo')).toBe('');
  });
});

describe('trace da demo de agentes', () => {
  const noWait = async () => {};

  it('tenta de novo enquanto o lens ainda não recebeu o trace (404)', async () => {
    let calls = 0;
    const get = async (path: string) => {
      calls++;
      expect(path).toBe('/api/demo/traces/abc');
      if (calls < 3) throw { status: 404, reason: 'trace_not_found' } satisfies ApiError;
      return ['span'];
    };
    await expect(fetchTrace('abc', get, noWait)).resolves.toEqual(['span']);
    expect(calls).toBe(3);
  });

  it('desiste depois das tentativas', async () => {
    let calls = 0;
    const get = async () => {
      calls++;
      throw { status: 404 } satisfies ApiError;
    };
    await expect(fetchTrace('abc', get, noWait, [1, 1])).rejects.toEqual({ status: 404 });
    expect(calls).toBe(3);
  });

  it('outros erros não são repetidos', async () => {
    let calls = 0;
    const get = async () => {
      calls++;
      throw { status: 429, reason: 'daily_quota' } satisfies ApiError;
    };
    await expect(fetchTrace('abc', get, noWait)).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(1);
  });
});

describe('portão das demos ao vivo', () => {
  const me = (over: Partial<Me> = {}): Me => ({
    user: { id: 'u', name: 'Ana', email: 'a@x.com', provider: 'github', mfa: false },
    pending: null,
    providers: { google: true, github: true, email: true },
    quotas: { score: { limit: 3, used: 0, remaining: 3 }, agents: { limit: 5, used: 0, remaining: 5 } },
    resets_at: '2026-11-10T00:00:00-03:00',
    budget_exhausted: false,
    ...over,
  });

  it('portal fora do ar', () => expect(gateState(null, 'score')).toEqual({ kind: 'unavailable' }));
  it('sem sessão pede login', () => expect(gateState(me({ user: null }), 'score').kind).toBe('login'));
  it('volta do OAuth com erro', () => expect(gateState(me({ user: null }), 'score', true).kind).toBe('oauthError'));
  it('e-mail sem TOTP ativado ainda não usa demo', () =>
    expect(gateState(me({ user: null, pending: 'totp_setup' }), 'score').kind).toBe('login'));

  it('cota zerada bloqueia a demo', () => {
    expect(gateState(me({ quotas: { score: { limit: 3, used: 3, remaining: 0 } } }), 'score').kind).toBe('quota');
  });

  it('orçamento global só trava as demos com LLM (agentes e estúdio)', () => {
    expect(gateState(me({ budget_exhausted: true }), 'agents').kind).toBe('budget');
    expect(gateState(me({ budget_exhausted: true }), 'studio').kind).toBe('budget');
    expect(gateState(me({ budget_exhausted: true }), 'score')).toEqual({ kind: 'ready', remaining: 3 });
  });
});
