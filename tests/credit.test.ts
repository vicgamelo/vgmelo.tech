// Agente de coleta e CSV de teste da demo de crédito. O domínio e as faixas são os de
// mlops-platform/src/mlops_platform/schema.py; os erros plantados batem com os códigos de lá.
import { describe, expect, it } from 'vitest';
import {
  FIELD,
  FIELDS,
  PLANTED,
  PRESETS,
  BRL_PER_DM,
  afterGate,
  askBetween,
  modelLabel,
  narrow,
  nextField,
  readAgent,
  toBrl,
  toDm,
  type AgentReply,
  parseAnswer,
  parseNumber,
  pct,
  pp,
  sampleCsv,
  show,
  toCsv,
  type Draft,
} from '../src/lib/credit';

// Domínio do credit-g (OpenML v1), copiado de schema.py.
const DOMAIN: Record<string, string[]> = {
  checking_status: ['<0', '0<=X<200', '>=200', 'no checking'],
  credit_history: ['no credits/all paid', 'all paid', 'existing paid', 'delayed previously', 'critical/other existing credit'],
  purpose: ['new car', 'used car', 'furniture/equipment', 'radio/tv', 'domestic appliance', 'repairs', 'education', 'retraining', 'business', 'other'],
  savings_status: ['<100', '100<=X<500', '500<=X<1000', '>=1000', 'no known savings'],
  employment: ['unemployed', '<1', '1<=X<4', '4<=X<7', '>=7'],
  other_parties: ['none', 'co applicant', 'guarantor'],
  property_magnitude: ['real estate', 'life insurance', 'car', 'no known property'],
  other_payment_plans: ['bank', 'stores', 'none'],
  housing: ['rent', 'own', 'for free'],
  job: ['unemp/unskilled non res', 'unskilled resident', 'skilled', 'high qualif/self emp/mgmt'],
  own_telephone: ['none', 'yes'],
};
const BOUNDS: Record<string, [number, number]> = {
  duration: [1, 120], credit_amount: [0, 1_000_000], installment_commitment: [1, 4], residence_since: [1, 4],
  age: [18, 100], existing_credits: [0, 10], num_dependents: [0, 10],
};

function parseCsv(text: string): string[][] {
  // Suficiente para o que o gerador escreve (aspas com "" dentro, sem quebra de linha em célula).
  return text.trimEnd().split('\n').map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') out.push(cur), (cur = '');
      else cur += c;
    }
    out.push(cur);
    return out;
  });
}

describe('contrato', () => {
  it('as categorias e faixas batem com o schema do modelo', () => {
    expect(FIELDS).toHaveLength(18);
    for (const f of FIELDS) {
      if (f.kind === 'cat') expect(f.options!.map((o) => o.value).sort()).toEqual([...DOMAIN[f.name]].sort());
      else expect([f.min, f.max]).toEqual(BOUNDS[f.name]);
    }
    expect(FIELD.credit_amount.minExclusive).toBe(true);
  });
});

describe('agente de coleta', () => {
  const ask = (name: string, text: string, lang: 'pt' | 'en' = 'pt') => parseAnswer(FIELD[name], text, lang);

  it.each([
    ['5.000', 5000],
    ['R$ 5.000,50', 5000.5],
    ['5,000.50', 5000.5],
    ['2,5', 2.5],
    ['1.5', 1.5],
    ['5 mil', 5000],
    ['3k', 3000],
    ['uns 12000 marcos', 12000],
    ['1,5 milhão', 1_500_000],
    ['2 milhoes', 2_000_000],
  ])('número %s → %d', (text, n) => expect(parseNumber(text)).toBe(n));

  it('entende sinônimos e frases', () => {
    expect(ask('housing', 'moro de aluguel')).toMatchObject({ ok: true, value: 'rent', how: 'keyword' });
    expect(ask('housing', 'Casa PRÓPRIA')).toMatchObject({ ok: true, value: 'own' });
    expect(ask('checking_status', 'não tenho conta')).toMatchObject({ ok: true, value: 'no checking' });
    expect(ask('own_telephone', 'não tenho')).toMatchObject({ ok: true, value: 'none' });
    expect(ask('own_telephone', 'sim')).toMatchObject({ ok: true, value: 'yes', how: 'exact' });
    expect(ask('purpose', 'quero trocar a geladeira')).toMatchObject({ ok: true, value: 'domestic appliance' });
    expect(ask('purpose', 'used car', 'en')).toMatchObject({ ok: true, value: 'used car', how: 'exact' });
    expect(ask('purpose', '4')).toMatchObject({ ok: true, value: 'radio/tv', how: 'exact' }); // número da opção
  });

  it('prazo em anos vira meses', () => {
    expect(ask('duration', '2 anos')).toEqual({ ok: true, value: 24, how: 'keyword' });
    expect(ask('duration', '36 meses')).toEqual({ ok: true, value: 36, how: 'keyword' });
    expect(ask('duration', '24')).toEqual({ ok: true, value: 24, how: 'number' });
  });

  it('"não sei" vira null, que o pipeline imputa', () => {
    expect(ask('age', 'não sei')).toEqual({ ok: true, value: null, how: 'dontknow' });
    expect(ask('purpose', "don't know", 'en')).toEqual({ ok: true, value: null, how: 'dontknow' });
  });

  it('resposta que serve para mais de uma opção vira pergunta de volta, só entre elas', () => {
    // O print do Victor: "Um carro" → antes "Não entendi" com a lista inteira.
    expect(ask('purpose', 'Um carro')).toEqual({ ok: false, hint: 'Carro novo ou carro usado?', options: ['new car', 'used car'] });
    expect(ask('purpose', 'a car', 'en')).toEqual({ ok: false, hint: 'New car or used car?', options: ['new car', 'used car'] });
    expect(askBetween(FIELD.employment, ['<1', '1<=X<4', '>=7'], 'pt')).toBe('Menos de 1 ano, de 1 a 4 anos ou 7 anos ou mais?');
    const r = ask('housing', 'barraca');
    expect(r.ok === false && r.options).toBeUndefined();
    expect(!r.ok && r.hint).not.toContain('1.'); // sem despejar a lista: as opções já estão nos botões
  });

  it('valor em reais vira DM para o modelo', () => {
    expect(BRL_PER_DM).toBe(10);
    expect(ask('credit_amount', 'R$ 90 mil')).toEqual({ ok: true, value: 9000, how: 'number' });
    expect(ask('credit_amount', '15.000')).toEqual({ ok: true, value: 1500, how: 'number' });
    expect(ask('credit_amount', 'uns 15 mil reais')).toEqual({ ok: true, value: 1500, how: 'keyword' });
    const zero = ask('credit_amount', '0');
    expect(!zero.ok && zero.hint).toContain('> R$ 0');
    expect(ask('credit_amount', 'R$ 1,5 milhão')).toEqual({ ok: true, value: 150_000, how: 'number' });
    const big = ask('credit_amount', 'R$ 20 milhões', 'en'); // 2.000.000 DM: acima do teto do scoring
    expect(!big.ok && big.hint).toContain('R$ 10,000,000');
    expect(toDm(12_345)).toBe(1235);
    expect(toBrl(9000)).toBe(90_000);
  });

  it('faixas do credit-g em DM aparecem em reais', () => {
    const checking = FIELD.checking_status.options!.map((x) => x.label.pt);
    expect(checking).toEqual(['negativa', 'de R$ 0 a R$ 2.000', 'R$ 2.000 ou mais', 'não tenho conta corrente']);
    expect(FIELD.savings_status.options![3].label.en).toBe('R$ 10,000 or more');
    expect(FIELDS.map((f) => [...Object.values(f.label), ...(f.options ?? []).flatMap((x) => Object.values(x.label))]).flat().join(' ')).not.toMatch(/\bDM\b/);
  });

  it('recusa fora da faixa do modelo, não inteiro e o que não entendeu, com dica', () => {
    for (const [name, text] of [['age', '12'], ['age', '30.5'], ['credit_amount', '0'], ['duration', 'muito'], ['housing', 'barraca']]) {
      const r = ask(name, text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.hint.length).toBeGreaterThan(5);
    }
    const r = ask('age', '12', 'en');
    expect(!r.ok && r.hint).toContain('between 18 and 100');
  });

  it('pergunta na ordem e pula o que já tem resposta, inclusive "não sei"', () => {
    const draft: Draft = {};
    expect(nextField(draft)?.name).toBe('purpose');
    draft.purpose = 'radio/tv';
    draft.credit_amount = null;
    expect(nextField(draft)?.name).toBe('duration');
    expect(nextField({ ...PRESETS.low })).toBeNull();
  });

  it('mostra valores em palavras', () => {
    expect(show('housing', 'rent', 'pt')).toBe('alugada');
    expect(show('duration', 24, 'en')).toBe('24 months');
    expect(show('credit_amount', 9000, 'pt')).toBe('R$ 90.000 (9.000 DM)');
    expect(show('credit_amount', 9000, 'en')).toBe('R$ 90,000 (9,000 DM)');
    expect(modelLabel('credit_amount', 'pt')).toBe('Valor pedido (DM)');
    expect(modelLabel('age', 'pt')).toBe('Idade');
    expect(show('age', null, 'pt')).toBe('não sei');
    expect(pct(0.9292, 'pt')).toBe('92,9%');
    expect(pp(0.1963, 'en')).toBe('+19.6 p.p.');
    expect(pp(-0.05, 'pt')).toBe('-5,0 p.p.');
  });
});

describe('microagente', () => {
  const read = (name: string, reply: AgentReply) => readAgent(FIELD[name], reply);

  it('aceita só o que o modelo de crédito aceita e converte reais', () => {
    expect(read('purpose', { status: 'ok', value: 'new car' })).toEqual({ kind: 'value', value: 'new car' });
    expect(read('purpose', { status: 'ok', value: 'carro' })).toEqual({ kind: 'none' });
    expect(read('purpose', { status: 'ask', options: ['used car', 'x', 'new car'] })).toEqual({ kind: 'ask', options: ['new car', 'used car'] });
    expect(read('purpose', { status: 'ask', options: ['used car', 'x'] })).toEqual({ kind: 'value', value: 'used car' });
    expect(read('age', { status: 'dont_know' })).toEqual({ kind: 'value', value: null });
    expect(read('age', { status: 'ok', value: 30 })).toEqual({ kind: 'value', value: 30 });
    expect(read('age', { status: 'ok', value: 30.5 })).toEqual({ kind: 'none' });
    expect(read('age', { status: 'ok', value: '30' })).toEqual({ kind: 'none' });
    expect(read('credit_amount', { status: 'ok', value: 15_000 })).toEqual({ kind: 'value', value: 1500 });
    expect(read('credit_amount', { status: 'ok', value: 2 })).toEqual({ kind: 'none' }); // R$ 2 → 0 DM
    expect(read('housing', { status: 'unknown' })).toEqual({ kind: 'none' });
  });

  it('a pergunta de volta restringe as opções seguintes', () => {
    const f = narrow(FIELD.purpose, ['new car', 'used car']);
    expect(f.options!.map((x) => x.value)).toEqual(['new car', 'used car']);
    expect(parseAnswer(f, '2', 'pt')).toMatchObject({ ok: true, value: 'used car' });
    expect(parseAnswer(f, 'novo', 'pt')).toMatchObject({ ok: true, value: 'new car' });
    expect(parseAnswer(f, 'usado', 'pt')).toMatchObject({ ok: true, value: 'used car' });
    // Fora da pergunta de volta, uma palavra solta não decide: "tenho conta" não é "não tenho conta corrente".
    expect(parseAnswer(FIELD.checking_status, 'tenho conta', 'pt').ok).toBe(false);
  });

  it('faixa de dinheiro sai da conta em DM, sem LLM', () => {
    const ask = (name: string, text: string, lang: 'pt' | 'en' = 'pt') => parseAnswer(FIELD[name], text, lang);
    // O gpt-oss-20b respondeu ">=200" para "uns 1500 reais" (150 DM): a comparação fica com as regras.
    expect(ask('checking_status', 'uns 1500 reais')).toEqual({ ok: true, value: '0<=X<200', how: 'number' });
    expect(ask('checking_status', 'tenho uns 5 mil na conta')).toEqual({ ok: true, value: '>=200', how: 'number' });
    expect(ask('checking_status', '-300')).toEqual({ ok: true, value: '<0', how: 'number' });
    expect(ask('checking_status', '0')).toEqual({ ok: true, value: '0<=X<200', how: 'number' });
    expect(ask('checking_status', 'R$ 2.000')).toEqual({ ok: true, value: '>=200', how: 'number' });
    expect(ask('savings_status', 'uns 3 mil')).toEqual({ ok: true, value: '100<=X<500', how: 'number' });
    expect(ask('savings_status', '20 mil guardado', 'en')).toEqual({ ok: true, value: '>=1000', how: 'number' });
    expect(ask('savings_status', 'R$ 999')).toEqual({ ok: true, value: '<100', how: 'number' });
    // Número de opção continua valendo, e palavra-chave ainda passa pelo microagente.
    expect(ask('savings_status', '2')).toMatchObject({ ok: true, value: '100<=X<500', how: 'exact' });
    expect(ask('checking_status', 'devendo uns 500')).toMatchObject({ ok: true, value: '<0', how: 'keyword' });
  });
});

describe('CSV de teste', () => {
  it('o válido tem cabeçalho certo e só valores do domínio, dentro da faixa do treino', () => {
    const rows = parseCsv(sampleCsv('valid'));
    const [header, ...data] = rows;
    expect(header).toEqual(['id', ...FIELDS.map((f) => f.name)]);
    expect(data).toHaveLength(20);
    for (const row of data) {
      expect(row).toHaveLength(header.length);
      FIELDS.forEach((f, i) => {
        const v = row[i + 1];
        if (f.kind === 'cat') expect(DOMAIN[f.name]).toContain(v);
        else {
          const n = Number(v);
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(f.train![0]);
          expect(n).toBeLessThanOrEqual(f.train![1]);
        }
      });
    }
  });

  it('é reproduzível pela semente', () => {
    expect(sampleCsv('valid')).toBe(sampleCsv('valid'));
    expect(sampleCsv('valid', 20, 1)).not.toBe(sampleCsv('valid', 20, 2));
  });

  it('o com erros planta um erro por linha a partir da linha 3, mais coluna protegida e campo a mais', () => {
    const [header, ...data] = parseCsv(sampleCsv('errors'));
    expect(header.at(-1)).toBe('personal_status');
    PLANTED.forEach((p, i) => {
      const row = data[i + 1]; // linha i + 3 do arquivo
      expect(row[header.indexOf(p.column)]).toBe(p.value);
    });
    expect(data[0]).toHaveLength(header.length); // linha 2 continua válida
    expect(data.at(-1)).toHaveLength(header.length + 1);
  });

  it('células com vírgula ou aspas vão entre aspas', () => {
    expect(toCsv(['a', 'b'], [['1,5', 'x"y']])).toBe('a,b\n"1,5","x""y"\n');
  });
});

describe('portão', () => {
  it('sem cota o painel continua na tela (resultado, validar), só não gasta mais', () => {
    expect(afterGate(true, false)).toEqual({ showLive: true, canSpend: false });
    expect(afterGate(true, true)).toEqual({ showLive: true, canSpend: true });
    expect(afterGate(false, false)).toEqual({ showLive: false, canSpend: false });
  });
});
