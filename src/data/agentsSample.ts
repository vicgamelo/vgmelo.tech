// Execução de exemplo da demo de agentes, para quem ainda não entrou ver como fica sem gastar cota.
// Mesma forma dos eventos SSE do agent-orchestrator e dos spans do genai-lens. Os números vêm de
// dados reais: Selic diária de 09/11/2026 (BCB/SGS 11) e os dias úteis de dezembro de 2026
// (23 dias de semana menos o Natal, sexta-feira). Tempos e tokens seguem uma execução real no Groq.
import type { Span } from '../lib/waterfall';

export interface SampleEvent {
  at: number; // ms desde o início
  event: string;
  data: unknown;
}

type Lang = 'pt' | 'en';

const T = {
  pt: {
    question: 'Qual a Selic hoje e quantos dias úteis tem dezembro de 2026?',
    taskEco: 'Busque a Selic diária mais recente e calcule a taxa anualizada (252 dias úteis).',
    taskRes: 'Quantos dias úteis tem dezembro de 2026 (01/12 a 31/12), considerando feriados nacionais?',
    eco: 'Selic diária: **0,0508% a.d.** em 09/11/2026 (BCB/SGS 11).\nAnualizada em 252 dias úteis: **≈ 13,65% a.a.**',
    res: 'Dezembro de 2026 tem **22 dias úteis**: 23 dias de semana menos o Natal (25/12, sexta-feira).',
    answer: [
      '**Selic hoje:** 0,0508% ao dia (dado de 09/11/2026), o que dá cerca de **13,65% ao ano** em 252 dias úteis.',
      '',
      '**Dezembro de 2026:** **22 dias úteis**. São 23 dias de semana, e o Natal (25/12) cai numa sexta-feira.',
      '',
      '| Dado | Valor | Fonte |',
      '|---|---:|---|',
      '| Selic diária | 0,0508% a.d. | BCB, série SGS 11 |',
      '| Selic anualizada | ≈ 13,65% a.a. | cálculo (252 d.u.) |',
      '| Dias úteis em dez/2026 | 22 | feriados nacionais (BrasilAPI) |',
    ].join('\n'),
  },
  en: {
    question: "What's the Selic rate today and how many business days are in December 2026?",
    taskEco: 'Fetch the latest daily Selic rate and compute the annualised rate (252 business days).',
    taskRes: 'How many business days are in December 2026 (Dec 1 to Dec 31), counting national holidays?',
    eco: 'Daily Selic: **0.0508% per day** on 2026-11-09 (BCB/SGS 11).\nAnnualised over 252 business days: **≈ 13.65% per year**.',
    res: 'December 2026 has **22 business days**: 23 weekdays minus Christmas (Dec 25, a Friday).',
    answer: [
      '**Selic today:** 0.0508% per day (as of 2026-11-09), which is about **13.65% per year** over 252 business days.',
      '',
      '**December 2026:** **22 business days**. There are 23 weekdays, and Christmas (Dec 25) falls on a Friday.',
      '',
      '| Item | Value | Source |',
      '|---|---:|---|',
      '| Daily Selic | 0.0508% per day | BCB, SGS series 11 |',
      '| Annualised Selic | ≈ 13.65% p.a. | calculation (252 b.d.) |',
      '| Business days in Dec 2026 | 22 | national holidays (BrasilAPI) |',
    ].join('\n'),
  },
};

const SELIC = JSON.stringify({
  indicador: 'selic',
  nome: 'Taxa Selic diária',
  codigo_sgs: 11,
  unidade: '% a.d.',
  periodicidade: 'diária',
  valores: [{ data: '2026-11-09', valor: 0.0508 }],
});
const DIAS = JSON.stringify({ inicio: '2026-12-01', fim: '2026-12-31', dias_uteis: 22, feriados_no_periodo: ['2026-12-25'] });
const CALC = '13.6534244';

interface Llm {
  agent: string;
  depth: number;
  from: number;
  to: number;
  model: string;
  inTok: number;
  outTok: number;
  calls: string[];
  text?: string;
}

export function sampleRun(lang: Lang): { question: string; events: SampleEvent[]; spans: Span[] } {
  const t = T[lang];
  const ev: SampleEvent[] = [];
  const spans: Span[] = [];
  const base = Date.parse('2026-11-10T13:00:00.000Z');
  let n = 0;
  const id = () => (++n).toString(16).padStart(16, '0');
  const span = (parent: string | null, name: string, kind: string, from: number, to: number, extra: Partial<Span> = {}): string => {
    const span_id = id();
    spans.push({
      span_id,
      parent_id: parent,
      name,
      kind,
      status: 'ok',
      start_time: new Date(base + from).toISOString(),
      duration_ms: to - from,
      model: null,
      input_tokens: null,
      output_tokens: null,
      ...extra,
    });
    return span_id;
  };
  const llm = (parent: string, s: Llm, step: number) => {
    span(parent, 'fallback.complete', 'llm', s.from, s.to, {
      model: s.model,
      provider: 'groq',
      input_tokens: s.inTok,
      output_tokens: s.outTok,
      output: s.text,
    });
    ev.push({ at: s.to, event: 'llm', data: { agent: s.agent, depth: s.depth, data: { step, text: s.text ?? '', tool_calls: s.calls, stop_reason: s.calls.length ? 'tool_use' : 'end_turn' } } });
  };
  const push = (at: number, event: string, agent: string, depth: number, data: Record<string, unknown>) =>
    ev.push({ at, event, data: { agent, depth, data } });
  const tool = (parent: string, agent: string, depth: number, name: string, args: Record<string, unknown>, from: number, to: number, result: string) => {
    push(from, 'tool_call', agent, depth, { tool: name, arguments: args });
    span(parent, `tool.${name}`, 'tool', from, to, { input: JSON.stringify(args), output: result });
    push(to, 'tool_result', agent, depth, { tool: name, result });
  };

  const BIG = 'openai/gpt-oss-120b';
  const SMALL = 'openai/gpt-oss-20b';
  const END = 2860;

  const run = span(null, 'run.coordinator', 'chain', 0, END, { input: t.question, output: t.answer });
  const coord = span(run, 'agent.coordinator', 'agent', 0, END, { input: t.question, output: t.answer });
  push(0, 'agent_start', 'coordinator', 0, { task: t.question });
  llm(coord, { agent: 'coordinator', depth: 0, from: 0, to: 400, model: BIG, inTok: 489, outTok: 68, calls: ['delegate_to_economist', 'delegate_to_company_researcher'] }, 1);

  // Delegações em paralelo.
  const dEco = span(coord, 'tool.delegate_to_economist', 'agent', 400, 1862, { input: JSON.stringify({ task: t.taskEco }), output: t.eco });
  const dRes = span(coord, 'tool.delegate_to_company_researcher', 'agent', 401, 2102, { input: JSON.stringify({ task: t.taskRes }), output: t.res });
  push(400, 'tool_call', 'coordinator', 0, { tool: 'delegate_to_economist', arguments: { task: t.taskEco } });
  push(401, 'tool_call', 'coordinator', 0, { tool: 'delegate_to_company_researcher', arguments: { task: t.taskRes } });

  const eco = span(dEco, 'agent.economist', 'agent', 402, 1861, { input: t.taskEco, output: t.eco });
  push(402, 'agent_start', 'economist', 1, { task: t.taskEco });
  const res = span(dRes, 'agent.company_researcher', 'agent', 403, 2101, { input: t.taskRes, output: t.res });
  push(403, 'agent_start', 'company_researcher', 1, { task: t.taskRes });

  llm(eco, { agent: 'economist', depth: 1, from: 402, to: 860, model: SMALL, inTok: 357, outTok: 45, calls: ['brasil__indicador_economico'] }, 1);
  tool(eco, 'economist', 1, 'brasil__indicador_economico', { indicador: 'selic', ultimos: 1 }, 860, 866, SELIC);
  llm(eco, { agent: 'economist', depth: 1, from: 866, to: 1300, model: SMALL, inTok: 520, outTok: 40, calls: ['calculator'] }, 2);
  tool(eco, 'economist', 1, 'calculator', { expression: '((1 + 0.0508/100) ** 252 - 1) * 100' }, 1300, 1302, CALC);

  llm(res, { agent: 'company_researcher', depth: 1, from: 403, to: 1290, model: SMALL, inTok: 380, outTok: 52, calls: ['brasil__dias_uteis'] }, 1);
  tool(res, 'company_researcher', 1, 'brasil__dias_uteis', { inicio: '2026-12-01', fim: '2026-12-31' }, 1290, 1352, DIAS);

  llm(eco, { agent: 'economist', depth: 1, from: 1302, to: 1860, model: SMALL, inTok: 610, outTok: 87, calls: [], text: t.eco }, 3);
  push(1861, 'agent_end', 'economist', 1, { output: t.eco, steps: 3 });
  push(1862, 'tool_result', 'coordinator', 0, { tool: 'delegate_to_economist', result: t.eco });

  llm(res, { agent: 'company_researcher', depth: 1, from: 1352, to: 2100, model: SMALL, inTok: 540, outTok: 70, calls: [], text: t.res }, 2);
  push(2101, 'agent_end', 'company_researcher', 1, { output: t.res, steps: 2 });
  push(2102, 'tool_result', 'coordinator', 0, { tool: 'delegate_to_company_researcher', result: t.res });

  llm(coord, { agent: 'coordinator', depth: 0, from: 2102, to: END - 1, model: BIG, inTok: 891, outTok: 141, calls: [], text: t.answer }, 2);
  push(END - 1, 'agent_end', 'coordinator', 0, { output: t.answer, steps: 2 });

  const llms = spans.filter((s) => s.kind === 'llm');
  ev.push({
    at: END,
    event: 'done',
    data: {
      run_id: 'run_exemplo',
      agent: 'coordinator',
      input: t.question,
      output: t.answer,
      status: 'ok',
      input_tokens: llms.reduce((a, s) => a + (s.input_tokens ?? 0), 0),
      output_tokens: llms.reduce((a, s) => a + (s.output_tokens ?? 0), 0),
      tool_calls: ev.filter((e) => e.event === 'tool_call').length,
      duration_ms: END,
      trace_id: null,
    },
  });
  ev.sort((a, b) => a.at - b.at);
  return { question: t.question, events: ev, spans };
}
