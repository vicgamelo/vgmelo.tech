// Demo de crédito: o contrato do modelo (mesmos campos, domínio e faixas de
// mlops-platform/src/mlops_platform/schema.py), o agente que coleta o perfil e o
// gerador de CSV de teste. Quem valida de verdade é o serviço de scoring; aqui é só
// para perguntar direito e gerar arquivos que exercitam cada regra.

export type Lang = 'pt' | 'en';
type T = Record<Lang, string>;

export interface Option {
  value: string;
  label: T;
  /** Palavras que o agente aceita como resposta (sem acento, minúsculas). */
  keywords?: string[];
}

export interface Field {
  name: string;
  kind: 'cat' | 'int' | 'float';
  label: T;
  ask: T;
  options?: Option[];
  min?: number;
  max?: number;
  minExclusive?: boolean;
  /** Faixa vista no treino (credit-g). Fora dela o modelo aceita, com aviso. */
  train?: [number, number];
  unit?: T;
  /** Grupo do formulário guiado. */
  group: 'loan' | 'money' | 'person';
}

const o = (value: string, pt: string, en: string, keywords: string[] = []): Option => ({
  value,
  label: { pt, en },
  keywords,
});

// Ordem da conversa: o pedido, a situação financeira, a pessoa.
export const FIELDS: Field[] = [
  {
    name: 'purpose',
    kind: 'cat',
    group: 'loan',
    label: { pt: 'Finalidade', en: 'Purpose' },
    ask: { pt: 'Para que é o crédito?', en: 'What is the credit for?' },
    options: [
      o('new car', 'carro novo', 'new car', ['carro 0km', 'carro zero', '0km']),
      o('used car', 'carro usado', 'used car', ['seminovo']),
      o('furniture/equipment', 'móveis / equipamentos', 'furniture / equipment', ['moveis', 'equipamento', 'furniture']),
      o('radio/tv', 'rádio / TV', 'radio / TV', ['tv', 'televisao', 'radio', 'som']),
      o('domestic appliance', 'eletrodoméstico', 'home appliance', ['geladeira', 'fogao', 'appliance']),
      o('repairs', 'reformas / consertos', 'repairs', ['reforma', 'conserto', 'repair']),
      o('education', 'estudos', 'education', ['faculdade', 'curso', 'estudo', 'school']),
      o('retraining', 'requalificação', 'retraining', ['requalificacao', 'treinamento']),
      o('business', 'negócio', 'business', ['empresa', 'negocio']),
      o('other', 'outro', 'other', ['outra coisa']),
    ],
  },
  {
    name: 'credit_amount',
    kind: 'float',
    group: 'loan',
    label: { pt: 'Valor pedido (DM)', en: 'Amount (DM)' },
    ask: {
      pt: 'Qual o valor, em marcos alemães (DM)? O dataset é de um banco alemão dos anos 70.',
      en: 'How much, in Deutsche Marks (DM)? The dataset comes from a 1970s German bank.',
    },
    min: 0,
    minExclusive: true,
    max: 1_000_000,
    train: [250, 18424],
    unit: { pt: 'DM', en: 'DM' },
  },
  {
    name: 'duration',
    kind: 'int',
    group: 'loan',
    label: { pt: 'Prazo (meses)', en: 'Term (months)' },
    ask: { pt: 'Em quantos meses quer pagar?', en: 'Over how many months?' },
    min: 1,
    max: 120,
    train: [4, 72],
    unit: { pt: 'meses', en: 'months' },
  },
  {
    name: 'installment_commitment',
    kind: 'int',
    group: 'loan',
    label: { pt: 'Peso da parcela na renda (1–4)', en: 'Installment vs income (1–4)' },
    ask: {
      pt: 'Quanto a parcela pesa na renda disponível, de 1 (pouco) a 4 (muito)?',
      en: 'How heavy is the installment on disposable income, from 1 (light) to 4 (heavy)?',
    },
    min: 1,
    max: 4,
    train: [1, 4],
  },
  {
    name: 'checking_status',
    kind: 'cat',
    group: 'money',
    label: { pt: 'Saldo em conta corrente', en: 'Checking account' },
    ask: { pt: 'Como está a conta corrente?', en: 'How is the checking account?' },
    options: [
      o('<0', 'negativa (< 0 DM)', 'overdrawn (< 0 DM)', ['negativo', 'negativa', 'devendo', 'overdrawn']),
      o('0<=X<200', 'de 0 a 200 DM', '0 to 200 DM'),
      o('>=200', '200 DM ou mais', '200 DM or more'),
      o('no checking', 'não tenho conta corrente', 'no checking account', ['nao tenho', 'sem conta', 'none']),
    ],
  },
  {
    name: 'savings_status',
    kind: 'cat',
    group: 'money',
    label: { pt: 'Poupança', en: 'Savings' },
    ask: { pt: 'E a poupança?', en: 'And savings?' },
    options: [
      o('<100', 'menos de 100 DM', 'under 100 DM'),
      o('100<=X<500', 'de 100 a 500 DM', '100 to 500 DM'),
      o('500<=X<1000', 'de 500 a 1000 DM', '500 to 1000 DM'),
      o('>=1000', '1000 DM ou mais', '1000 DM or more'),
      o('no known savings', 'não tenho / não sei', 'none / unknown', ['nenhuma', 'sem poupanca']),
    ],
  },
  {
    name: 'credit_history',
    kind: 'cat',
    group: 'money',
    label: { pt: 'Histórico de crédito', en: 'Credit history' },
    ask: { pt: 'Como foi o histórico de crédito até agora?', en: 'How has your credit history been so far?' },
    options: [
      o('no credits/all paid', 'nunca tive crédito', 'never had credit', ['nunca', 'primeiro']),
      o('all paid', 'tudo pago neste banco', 'all paid at this bank'),
      o('existing paid', 'em dia', 'up to date', ['em dia', 'pagando']),
      o('delayed previously', 'já atrasei', 'paid late before', ['atrasei', 'atraso', 'late']),
      o('critical/other existing credit', 'crítico / crédito em outro banco', 'critical / credit elsewhere', ['critico', 'outro banco']),
    ],
  },
  {
    name: 'existing_credits',
    kind: 'int',
    group: 'money',
    label: { pt: 'Créditos ativos neste banco', en: 'Credits at this bank' },
    ask: { pt: 'Quantos créditos você já tem neste banco?', en: 'How many credits do you already have at this bank?' },
    min: 0,
    max: 10,
    train: [1, 4],
  },
  {
    name: 'other_payment_plans',
    kind: 'cat',
    group: 'money',
    label: { pt: 'Outros parcelamentos', en: 'Other installment plans' },
    ask: { pt: 'Tem outros parcelamentos?', en: 'Any other installment plans?' },
    options: [
      o('none', 'nenhum', 'none', ['nao', 'nenhum', 'no']),
      o('bank', 'em banco', 'with a bank', ['banco']),
      o('stores', 'em lojas', 'with stores', ['loja', 'lojas', 'store']),
    ],
  },
  {
    name: 'other_parties',
    kind: 'cat',
    group: 'money',
    label: { pt: 'Fiador / co-solicitante', en: 'Guarantor / co-applicant' },
    ask: { pt: 'Tem fiador ou alguém pedindo junto?', en: 'Is there a guarantor or a co-applicant?' },
    options: [
      o('none', 'não', 'no', ['nao', 'ninguem', 'nenhum']),
      o('guarantor', 'fiador', 'guarantor', ['fiador']),
      o('co applicant', 'co-solicitante', 'co-applicant', ['junto', 'conjuge']),
    ],
  },
  {
    name: 'employment',
    kind: 'cat',
    group: 'person',
    label: { pt: 'Tempo no emprego atual', en: 'Time in current job' },
    ask: { pt: 'Há quanto tempo está no emprego atual?', en: 'How long in your current job?' },
    options: [
      o('unemployed', 'desempregado', 'unemployed', ['sem emprego']),
      o('<1', 'menos de 1 ano', 'under 1 year'),
      o('1<=X<4', 'de 1 a 4 anos', '1 to 4 years'),
      o('4<=X<7', 'de 4 a 7 anos', '4 to 7 years'),
      o('>=7', '7 anos ou mais', '7 years or more'),
    ],
  },
  {
    name: 'job',
    kind: 'cat',
    group: 'person',
    label: { pt: 'Ocupação', en: 'Job' },
    ask: { pt: 'Qual o tipo de ocupação?', en: 'What kind of job?' },
    options: [
      o('unemp/unskilled non res', 'sem qualificação, não residente', 'unskilled, non-resident'),
      o('unskilled resident', 'sem qualificação, residente', 'unskilled, resident'),
      o('skilled', 'qualificado / funcionário', 'skilled employee', ['qualificado', 'funcionario', 'clt']),
      o('high qualif/self emp/mgmt', 'gestor / autônomo / alta qualificação', 'manager / self-employed / highly qualified', ['gestor', 'autonomo', 'gerente', 'diretor']),
    ],
  },
  {
    name: 'age',
    kind: 'int',
    group: 'person',
    label: { pt: 'Idade', en: 'Age' },
    ask: { pt: 'Qual a sua idade?', en: 'How old are you?' },
    min: 18,
    max: 100,
    train: [19, 75],
    unit: { pt: 'anos', en: 'years' },
  },
  {
    name: 'housing',
    kind: 'cat',
    group: 'person',
    label: { pt: 'Moradia', en: 'Housing' },
    ask: { pt: 'Mora em casa própria, alugada ou cedida?', en: 'Do you own, rent or live for free?' },
    options: [
      o('own', 'própria', 'own', ['propria', 'minha']),
      o('rent', 'alugada', 'rent', ['aluguel', 'alugada', 'alugo']),
      o('for free', 'cedida', 'for free', ['cedida', 'pais', 'gratis', 'free']),
    ],
  },
  {
    name: 'residence_since',
    kind: 'int',
    group: 'person',
    label: { pt: 'Tempo no endereço (1–4)', en: 'Time at address (1–4)' },
    ask: {
      pt: 'Há quanto tempo mora no endereço atual, de 1 (pouco) a 4 (muito)?',
      en: 'How long at your current address, from 1 (short) to 4 (long)?',
    },
    min: 1,
    max: 4,
    train: [1, 4],
  },
  {
    name: 'property_magnitude',
    kind: 'cat',
    group: 'person',
    label: { pt: 'Maior bem', en: 'Main asset' },
    ask: { pt: 'Qual o seu maior bem?', en: 'What is your main asset?' },
    options: [
      o('real estate', 'imóvel', 'real estate', ['imovel', 'casa', 'apartamento']),
      o('life insurance', 'seguro de vida / poupança', 'life insurance / savings', ['seguro']),
      o('car', 'carro ou outro', 'car or other', ['carro', 'moto']),
      o('no known property', 'nenhum', 'none', ['nada', 'nenhum']),
    ],
  },
  {
    name: 'num_dependents',
    kind: 'int',
    group: 'person',
    label: { pt: 'Dependentes', en: 'Dependents' },
    ask: { pt: 'Quantas pessoas dependem de você?', en: 'How many people depend on you?' },
    min: 0,
    max: 10,
    train: [1, 2],
  },
  {
    name: 'own_telephone',
    kind: 'cat',
    group: 'person',
    label: { pt: 'Telefone no nome', en: 'Phone in your name' },
    ask: { pt: 'Tem telefone registrado no seu nome?', en: 'Is there a phone registered in your name?' },
    options: [o('yes', 'sim', 'yes', ['sim', 's', 'tenho', 'y']), o('none', 'não', 'no', ['nao', 'nao tenho', 'n', 'no'])],
  },
];

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.name, f])) as Record<string, Field>;
export const FIELD_NAMES = FIELDS.map((f) => f.name);

export type Value = string | number | null;
/** Perfil em construção. Ausente = ainda não perguntado; null = "não sei" (o pipeline imputa). */
export type Draft = Record<string, Value>;

export function label(name: string, lang: Lang): string {
  return FIELD[name]?.label[lang] ?? name;
}

/** Valor para mostrar: a categoria em palavras, o número com unidade. */
export function show(name: string, value: Value | undefined, lang: Lang): string {
  if (value === null || value === undefined || value === '') return lang === 'pt' ? 'não sei' : "don't know";
  const f = FIELD[name];
  if (f?.kind === 'cat') return f.options!.find((x) => x.value === value)?.label[lang] ?? String(value);
  const n = typeof value === 'number' ? value : Number(value);
  const text = Number.isFinite(n) ? n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') : String(value);
  return f?.unit ? `${text} ${f.unit[lang]}` : text;
}

// ---------------------------------------------------------------- agente de coleta

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const DONT_KNOW = /^(nao sei|n sei|sei la|nao lembro|pular|pula|skip|dont know|don't know|i don't know|not sure|\?)$/;

/** "5.000,50" → 5000.5; "5,000.50" → 5000.5; "2,5" → 2.5; "5 mil" / "5k" → 5000. */
export function parseNumber(text: string): number | null {
  const t = fold(text);
  const m = t.match(/-?\d[\d.,]*/);
  if (!m) return null;
  let raw = m[0].replace(/[.,]$/, '');
  const dot = raw.lastIndexOf('.');
  const comma = raw.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? '.' : ',';
    const thousands = dec === '.' ? ',' : '.';
    raw = raw.split(thousands).join('').replace(dec, '.');
  } else if (comma >= 0) {
    raw = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
  } else if (dot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, '');
  }
  let n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const after = t.slice((m.index ?? 0) + m[0].length);
  if (/^\s*(mil\b|k\b)/.test(after)) n *= 1000;
  return n;
}

export type Parsed = { ok: true; value: Value } | { ok: false; hint: string };

function range(f: Field, lang: Lang): string {
  const lo = f.minExclusive ? `> ${f.min}` : String(f.min);
  return lang === 'pt' ? `entre ${lo} e ${f.max}` : `between ${lo} and ${f.max}`;
}

/** Interpreta a resposta do visitante para um campo. Sem LLM: regras, sinônimos e números. */
export function parseAnswer(f: Field, text: string, lang: Lang): Parsed {
  const t = fold(text);
  if (!t) return { ok: false, hint: lang === 'pt' ? 'Escreva uma resposta ou toque numa opção.' : 'Type an answer or tap an option.' };
  if (DONT_KNOW.test(t)) return { ok: true, value: null };
  if (f.kind === 'cat') {
    const opts = f.options!;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1 && n <= opts.length) return { ok: true, value: opts[n - 1].value };
    const exact = opts.find((x) => fold(x.value) === t || fold(x.label.pt) === t || fold(x.label.en) === t);
    if (exact) return { ok: true, value: exact.value };
    // Palavra-chave inteira dentro da frase ("moro de aluguel" → rent). A mais longa ganha.
    let best: { value: string; len: number } | null = null;
    for (const x of opts) {
      for (const k of [...(x.keywords ?? []), fold(x.label.pt), fold(x.label.en)]) {
        const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9])`);
        if (re.test(t) && (!best || k.length > best.len)) best = { value: x.value, len: k.length };
      }
    }
    if (best) return { ok: true, value: best.value };
    const list = opts.map((x, i) => `${i + 1}. ${x.label[lang]}`).join(' · ');
    return { ok: false, hint: (lang === 'pt' ? 'Não entendi. Opções: ' : "I didn't get that. Options: ") + list };
  }
  let n = parseNumber(t);
  if (n === null) {
    return { ok: false, hint: (lang === 'pt' ? 'Preciso de um número ' : 'I need a number ') + range(f, lang) + '.' };
  }
  if (f.name === 'duration' && /\b(ano|anos|year|years)\b/.test(t)) n *= 12;
  if (f.kind === 'int' && !Number.isInteger(n)) {
    return { ok: false, hint: lang === 'pt' ? 'Preciso de um número inteiro.' : 'I need a whole number.' };
  }
  const low = f.minExclusive ? n <= f.min! : n < f.min!;
  if (low || n > f.max!) return { ok: false, hint: (lang === 'pt' ? 'O modelo aceita valores ' : 'The model takes values ') + range(f, lang) + '.' };
  return { ok: true, value: n };
}

/** Próximo campo sem resposta (null conta como respondido: "não sei"). */
export function nextField(draft: Draft): Field | null {
  return FIELDS.find((f) => !(f.name in draft)) ?? null;
}

/** Corpo do /api/demo/score/pipeline: os 18 campos, null para o que falta. */
export function pipelineBody(draft: Draft, lang: Lang): { applicant: Record<string, Value>; lang: Lang } {
  const applicant: Record<string, Value> = {};
  for (const name of FIELD_NAMES) {
    const v = draft[name];
    applicant[name] = v === undefined || v === '' ? null : v;
  }
  return { applicant, lang };
}

/** Perfis prontos para quem quer ver o pipeline sem responder 18 perguntas. */
export const PRESETS: Record<'low' | 'high', Draft> = {
  low: {
    purpose: 'radio/tv', credit_amount: 1500, duration: 12, installment_commitment: 2, checking_status: 'no checking',
    savings_status: '>=1000', credit_history: 'critical/other existing credit', existing_credits: 2,
    other_payment_plans: 'none', other_parties: 'none', employment: '>=7', job: 'skilled', age: 45, housing: 'own',
    residence_since: 4, property_magnitude: 'real estate', num_dependents: 1, own_telephone: 'yes',
  },
  high: {
    purpose: 'new car', credit_amount: 9000, duration: 48, installment_commitment: 4, checking_status: '<0',
    savings_status: '<100', credit_history: 'existing paid', existing_credits: 1, other_payment_plans: 'none',
    other_parties: 'none', employment: '<1', job: 'skilled', age: 22, housing: 'rent', residence_since: 1,
    property_magnitude: 'no known property', num_dependents: 1, own_telephone: 'none',
  },
};

// ---------------------------------------------------------------- CSV de teste

/** PRNG pequeno com semente (mulberry32), para o arquivo de exemplo ser reproduzível. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function randomRow(r: () => number): Record<string, Value> {
  const row: Record<string, Value> = {};
  for (const f of FIELDS) {
    if (f.kind === 'cat') {
      row[f.name] = f.options![Math.floor(r() * f.options!.length)].value;
    } else {
      const [lo, hi] = f.train!;
      const v = f.name === 'credit_amount' ? Math.round(lo + (Math.min(hi, 12000) - lo) * r() ** 2) : lo + Math.floor(r() * (hi - lo + 1));
      row[f.name] = v;
    }
  }
  return row;
}

/** Erros que o arquivo "com erros" planta, um por linha, na ordem (linha 3 em diante). */
export const PLANTED: { column: string; value: string; code: string }[] = [
  { column: 'age', value: 'trinta', code: 'not_integer' },
  { column: 'purpose', value: 'carro novo', code: 'out_of_domain' },
  { column: 'duration', value: '0', code: 'out_of_range' },
  { column: 'credit_amount', value: '', code: 'missing' },
  { column: 'housing', value: 'Own', code: 'out_of_domain' },
  { column: 'credit_amount', value: '2500,50', code: 'decimal_comma' },
  { column: 'job', value: '=HYPERLINK("http://example.com","clique")', code: 'out_of_domain' },
  { column: 'installment_commitment', value: '2.5', code: 'not_integer' },
  { column: 'duration', value: '96', code: 'outside_training' },
];

export function sampleCsv(kind: 'valid' | 'errors', rows = 20, seed = 2026): string {
  const r = rng(seed);
  const header = ['id', ...FIELD_NAMES];
  const data: unknown[][] = [];
  for (let i = 0; i < rows; i++) {
    const row = randomRow(r);
    data.push([`cliente-${String(i + 1).padStart(3, '0')}`, ...FIELD_NAMES.map((n) => row[n])]);
  }
  if (kind === 'valid') return toCsv(header, data);
  // Linha 2 fica válida; da 3 em diante, um erro plantado por linha.
  PLANTED.forEach((p, i) => {
    if (i + 1 < data.length) data[i + 1][1 + FIELD_NAMES.indexOf(p.column)] = p.value;
  });
  // Um atributo protegido (o modelo ignora) e uma linha com campo a mais.
  const withProtected = data.map((row) => [...row, 'male single']);
  const extra = withProtected.length - 1;
  withProtected[extra] = [...withProtected[extra], 'sobrou'];
  return toCsv([...header, 'personal_status'], withProtected);
}

// ---------------------------------------------------------------- pipeline

export const STAGES = ['raw', 'transform', 'normalize', 'fit', 'model', 'explain'] as const;
export type StageId = (typeof STAGES)[number];

export function pct(p: number, lang: Lang, digits = 1): string {
  return `${(p * 100).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function num(n: number, lang: Lang, digits = 2): string {
  return n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: digits });
}

/** Impacto em pontos percentuais, com sinal: "+19,6 p.p." */
export function pp(impact: number, lang: Lang): string {
  const v = (impact * 100).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${impact > 0 ? '+' : ''}${v} p.p.`;
}

export const MAX_FILE_BYTES = 50 * 1024;
export const MAX_FILE_ROWS = 250;

/**
 * O que a página faz depois do portão (lib/live.ts). Sem cota, o portão esconde a demo inteira;
 * aqui o painel continua visível (o resultado que acabou de chegar, o perfil, o "validar" do lote,
 * que é grátis) e só os botões que gastam cota ficam desligados.
 */
export function afterGate(loggedIn: boolean, ready: boolean): { showLive: boolean; canSpend: boolean } {
  return { showLive: loggedIn, canSpend: loggedIn && ready };
}
