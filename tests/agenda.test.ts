// Contrato com o vgmelo-agenda (BookingIn / ChatIn com extra="forbid") e o reagrupamento por fuso.
import { describe, expect, it } from 'vitest';
import {
  BOOKING_FIELDS,
  CHAT_FIELDS,
  bookingBody,
  chatBody,
  dayLabel,
  errorText,
  groupByLocalDay,
  localDate,
  safeHttps,
  timeLabel,
  tokenFromHash,
  type SlotsResponse,
} from '../src/lib/agenda';

const form = {
  kind: 'job' as const,
  start: '2026-11-10T11:00:00Z',
  duration: 30,
  name: ' Ana ',
  email: ' ana@example.com ',
  company: '',
  topic: ' Vaga de MLOps ',
  website: '',
};

describe('reserva', () => {
  it('só manda campos que o serviço aceita', () => {
    const body = bookingBody(form, 'pt', 'America/Sao_Paulo', 1_700_000_000_000);
    for (const k of Object.keys(body)) expect(BOOKING_FIELDS).toContain(k);
    expect(body).not.toHaveProperty('company'); // vazio não vai (o serviço guardaria "")
    expect(body.name).toBe('Ana');
    expect(body.duration).toBe(30);
  });

  it('started_at vai em milissegundos', () => {
    const rendered = Date.UTC(2026, 10, 9, 12, 0, 0);
    const body = bookingBody({ ...form, company: 'ACME' }, 'en', 'Europe/Lisbon', rendered);
    expect(body.started_at).toBe(rendered);
    expect(body.company).toBe('ACME');
    expect(body.lang).toBe('en');
  });

  it('chat manda só a mensagem nova, nunca histórico', () => {
    const body = chatBody('oi', null, 'pt', 'America/Sao_Paulo');
    for (const k of Object.keys(body)) expect(CHAT_FIELDS).toContain(k);
    expect(body).not.toHaveProperty('conversation');
    expect(chatBody('oi', 'abc', 'pt', 'UTC').conversation).toBe('abc');
  });
});

describe('fuso', () => {
  const slots: SlotsResponse = {
    timezone: 'America/Sao_Paulo',
    calendar_ok: true,
    days: [
      { date: '2026-11-10', starts: ['2026-11-10T11:00:00Z', '2026-11-10T21:00:00Z'] },
      { date: '2026-11-11', starts: ['2026-11-11T11:00:00Z'] },
    ],
  };

  it('mostra no fuso do Victor', () => {
    const days = groupByLocalDay(slots, 'America/Sao_Paulo', 'pt');
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(days[0].times.map((t) => t.label)).toEqual(['08:00', '18:00']);
  });

  it('18h em São Paulo cai no dia seguinte em Tóquio', () => {
    const days = groupByLocalDay(slots, 'Asia/Tokyo', 'en');
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(days[1].times.map((t) => t.label)).toEqual(['06:00', '20:00']);
  });

  it('o ISO enviado continua o instante UTC original', () => {
    const days = groupByLocalDay(slots, 'Europe/Lisbon', 'pt');
    expect(days[0].times[0]).toEqual({ iso: '2026-11-10T11:00:00Z', label: '11:00' });
  });

  it('helpers de data', () => {
    expect(localDate('2026-11-11T01:00:00Z', 'America/Sao_Paulo')).toBe('2026-11-10');
    expect(timeLabel('2026-11-10T21:00:00Z', 'America/Sao_Paulo', 'en')).toBe('18:00');
    expect(dayLabel('2026-11-10', 'pt')).toMatch(/ter/);
    expect(dayLabel('2026-11-10', 'en')).toMatch(/Tue/);
  });
});

describe('link do e-mail e erros', () => {
  it('token só do fragmento e no formato certo', () => {
    expect(tokenFromHash('#' + 'a'.repeat(43))).toBe('a'.repeat(43));
    expect(tokenFromHash('#abc')).toBeNull();
    expect(tokenFromHash('#<script>alert(1)</script>xxxxxxxxxxxxxxxx')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('meeting_url só vira link se for https', () => {
    expect(safeHttps('https://meet.example/x')).toBe('https://meet.example/x');
    expect(safeHttps('javascript:alert(1)')).toBeNull();
    expect(safeHttps('http://meet.example')).toBeNull();
    expect(safeHttps('')).toBeNull();
  });

  it('código do serviço vira mensagem', () => {
    const M = { slot_taken: 'ocupado', rate_limited: 'devagar' };
    expect(errorText({ status: 409, code: 'slot_taken' }, M, 'erro')).toBe('ocupado');
    expect(errorText({ status: 429 }, M, 'erro')).toBe('devagar');
    expect(errorText({ status: 500 }, M, 'erro')).toBe('erro');
    expect(errorText(new TypeError('fetch'), M, 'erro')).toBe('erro');
  });
});

describe('calendário', () => {
  it('monta o mês começando no domingo, com casas vazias nas bordas', async () => {
    const { monthGrid } = await import('../src/lib/agenda');
    const nov = monthGrid('2026-11'); // 1/11/2026 é domingo, 30 dias
    expect(nov[0][0]).toBe('2026-11-01');
    expect(nov.flat().filter(Boolean)).toHaveLength(30);
    expect(nov.every((w) => w.length === 7)).toBe(true);
    const dez = monthGrid('2026-12'); // 1/12/2026 é terça
    expect(dez[0].slice(0, 3)).toEqual([null, null, '2026-12-01']);
    expect(dez.at(-1)!.filter(Boolean).at(-1)).toBe('2026-12-31');
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29); // bissexto
  });

  it('avança e volta mês atravessando o ano', async () => {
    const { addMonths } = await import('../src/lib/agenda');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });

  it('rótulos em português e inglês', async () => {
    const { monthLabel, weekdayLabels, longDayLabel } = await import('../src/lib/agenda');
    expect(monthLabel('2026-11', 'pt')).toBe('Novembro de 2026');
    expect(monthLabel('2026-11', 'en')).toBe('November 2026');
    expect(weekdayLabels('pt')[0]).toBe('dom');
    expect(weekdayLabels('en')[6]).toBe('Sat');
    expect(longDayLabel('2026-11-11', 'pt')).toBe('quarta-feira, 11 de novembro');
  });

  it('separa os horários em manhã, tarde e noite no fuso de quem vê', async () => {
    const { byPeriod, periodOf } = await import('../src/lib/agenda');
    const sp = 'America/Sao_Paulo';
    expect(periodOf('2026-11-11T11:00:00Z', sp)).toBe('morning'); // 8h
    expect(periodOf('2026-11-11T15:00:00Z', sp)).toBe('afternoon'); // 12h
    expect(periodOf('2026-11-11T21:00:00Z', sp)).toBe('evening'); // 18h
    expect(periodOf('2026-11-11T11:00:00Z', 'Europe/Lisbon')).toBe('morning'); // 11h
    expect(periodOf('2026-11-11T15:00:00Z', 'Europe/Lisbon')).toBe('afternoon'); // 15h
    const day = {
      date: '2026-11-11',
      times: ['2026-11-11T11:00:00Z', '2026-11-11T21:00:00Z'].map((iso) => ({
        iso,
        label: '',
      })),
    };
    expect(byPeriod(day, sp).map((g) => g.period)).toEqual(['morning', 'evening']);
  });

  it('lista só os meses com dia livre', async () => {
    const { monthsWithSlots } = await import('../src/lib/agenda');
    const d = (date: string) => ({ date, times: [] });
    expect(monthsWithSlots([d('2026-12-30'), d('2027-01-02'), d('2026-12-31')])).toEqual(['2026-12', '2027-01']);
  });
});

describe('convite das demos', () => {
  it('?tipo=consultoria abre a agenda em Consultoria', async () => {
    const { kindFromQuery } = await import('../src/lib/agenda');
    expect(kindFromQuery('?tipo=consultoria')).toBe('consulting');
    expect(kindFromQuery('?tipo=vaga')).toBe('job');
    expect(kindFromQuery('?tipo=consulting')).toBe('consulting');
    expect(kindFromQuery('?tipo=<script>')).toBeNull();
    expect(kindFromQuery('')).toBeNull();
  });

  it('o link do convite leva para a agenda certa em cada idioma', async () => {
    const { consultHref } = await import('../src/lib/live');
    expect(consultHref('pt')).toBe('/agenda/?tipo=consultoria');
    expect(consultHref('en')).toBe('/en/schedule/?tipo=consultoria');
  });
});
