import type { Lang } from '../i18n/routes';

type T = Record<Lang, string>;

export const LINKS = {
  github: 'https://github.com/vicgamelo',
  linkedin: 'https://www.linkedin.com/in/vgmelo/',
  youtube: 'https://www.youtube.com/@vicgamelo',
  siteRepo: 'https://github.com/vicgamelo/vgmelo.tech',
  avatar: '/victor.jpg',
};

export interface Project {
  slug: string;
  name: string;
  repo: string;
  summary: T;
  highlights: Record<Lang, string[]>;
  tags: string[];
  demo?: 'demoCnpj' | 'demoMcp' | 'demoAgents' | 'demoCredit' | 'demoDrift' | 'demoAttention';
  detail?: 'projectRag';
  featured?: boolean;
}

export const PROJECTS: Project[] = [
  {
    slug: 'agent-orchestrator',
    name: 'agent-orchestrator',
    repo: 'https://github.com/vicgamelo/agent-orchestrator',
    summary: {
      pt: 'API multiagente: um coordenador delega para especialistas em paralelo, com ferramentas via MCP, limites de segurança e tracing de ponta a ponta.',
      en: 'Multi-agent API: a coordinator delegates to specialists in parallel, with MCP tools, guardrails and end-to-end tracing.',
    },
    highlights: {
      pt: [
        'Delegação supervisor/especialista com chamadas de ferramenta em paralelo',
        'Ferramentas de qualquer servidor MCP, com namespace por servidor',
        'Streaming por SSE e cada execução vira um trace no genai-lens',
        'Roda com Claude, APIs compatíveis com OpenAI ou modelos locais',
      ],
      en: [
        'Supervisor/worker delegation with parallel tool calls',
        'Tools from any MCP server, namespaced per server',
        'SSE streaming, and every run becomes a trace in genai-lens',
        'Runs on Claude, OpenAI-compatible APIs or local models',
      ],
    },
    tags: ['Agents', 'MCP', 'FastAPI'],
    demo: 'demoAgents',
    featured: true,
  },
  {
    slug: 'mcp-server-brasil',
    name: 'mcp-server-brasil',
    repo: 'https://github.com/vicgamelo/mcp-server-brasil',
    summary: {
      pt: 'Servidor MCP com dados públicos do Brasil para agentes: CEP, CNPJ (inclusive o alfanumérico), feriados, dias úteis, Banco Central e IBGE.',
      en: 'MCP server with Brazilian public data for agents: CEP, CNPJ (alphanumeric too), holidays, business days, Banco Central and IBGE.',
    },
    highlights: {
      pt: [
        '8 ferramentas, um resource e um prompt',
        'Validação do CNPJ alfanumérico que entra em vigor em 2026',
        'Cache, retry e modo HTTP com limite por IP',
      ],
      en: [
        '8 tools, a resource and a prompt',
        'Validates the alphanumeric CNPJ that starts in 2026',
        'Caching, retries and an HTTP mode with per-IP rate limiting',
      ],
    },
    tags: ['MCP', 'Open source', 'Python'],
    demo: 'demoMcp',
    featured: true,
  },
  {
    slug: 'rag-normas',
    name: 'rag-normas',
    repo: 'https://github.com/vicgamelo/rag-normas',
    summary: {
      pt: 'RAG sobre as normas do Pix do Banco Central, só com peças open source: busca híbrida em um arquivo SQLite, modelos ONNX na CPU, citação do ato e do artigo em cada resposta e avaliação que roda no CI.',
      en: "RAG over the Banco Central do Brasil's Pix regulations, built only from open-source parts: hybrid search in one SQLite file, ONNX models on CPU, the act and article cited in every answer, and an evaluation that runs in CI.",
    },
    highlights: {
      pt: [
        'Indexa só o texto em vigor: as redações revogadas que o BCB deixa riscadas ficam de fora',
        'BM25 + vetores + re-ranker: o primeiro resultado certo sobe de 60% para 80%',
        'Toda frase cita [n]; citação inválida é marcada e fora do corpus vira "NÃO ENCONTREI"',
        'Ferramenta MCP para agentes, com trace no genai-lens',
      ],
      en: [
        'Indexes only the text in force: the superseded wording the BCB keeps struck through stays out',
        'BM25 + vectors + re-ranker: the right first result goes from 60% to 80%',
        'Every sentence cites [n]; invalid citations are flagged and out-of-scope questions get "NÃO ENCONTREI"',
        'An MCP tool for agents, traced in genai-lens',
      ],
    },
    tags: ['RAG', 'Evaluation', 'MCP'],
    detail: 'projectRag',
  },
  {
    slug: 'genai-lens',
    name: 'genai-lens',
    repo: 'https://github.com/vicgamelo/genai-lens',
    summary: {
      pt: 'Observabilidade de LLM auto-hospedada: traces, tokens, custo e latência por modelo, com endpoint OpenTelemetry GenAI e mascaramento de dados pessoais.',
      en: 'Self-hosted LLM observability: traces, tokens, cost and latency per model, with an OpenTelemetry GenAI endpoint and PII redaction.',
    },
    highlights: {
      pt: [
        'SDK em Python que nunca derruba a aplicação que ele observa',
        'Recebe OTLP/HTTP no padrão GenAI do OpenTelemetry',
        'Painel com cascata do trace, custo por modelo e séries temporais',
      ],
      en: [
        "Python SDK that never takes down the app it's observing",
        'Ingests OTLP/HTTP using the OpenTelemetry GenAI conventions',
        'Dashboard with trace waterfall, cost per model and time series',
      ],
    },
    tags: ['Observability', 'OpenTelemetry', 'LLM'],
    demo: 'demoAgents',
    featured: true,
  },
  {
    slug: 'mlops-platform',
    name: 'mlops-platform',
    repo: 'https://github.com/vicgamelo/mlops-platform',
    summary: {
      pt: 'MLflow de ponta a ponta para risco de crédito: treino rastreável, promoção champion/challenger com critérios de qualidade e justiça, drift e serving que troca de modelo sem parar.',
      en: 'End-to-end MLflow for credit risk: traceable training, champion/challenger promotion gated on quality and fairness, drift and serving that swaps models without downtime.',
    },
    highlights: {
      pt: [
        'AUC 0,77 no German Credit, com diferença de 0,004 entre faixas de idade',
        'Promoção só passa se ganhar do champion sem piorar calibração nem justiça',
        'Rollback com um comando e drift por PSI',
      ],
      en: [
        'AUC 0.77 on German Credit, with a 0.004 gap between age groups',
        'A model is only promoted if it beats the champion without hurting calibration or fairness',
        'One-command rollback and PSI drift detection',
      ],
    },
    tags: ['MLflow', 'MLOps', 'scikit-learn'],
    demo: 'demoCredit',
    featured: true,
  },
  {
    slug: 'ml-from-scratch',
    name: 'ml-from-scratch',
    repo: 'https://github.com/vicgamelo/ml-from-scratch',
    summary: {
      pt: 'Algoritmos clássicos de ML e attention em NumPy puro, cada um conferido contra o scikit-learn.',
      en: 'Classic ML algorithms and attention in pure NumPy, each one checked against scikit-learn.',
    },
    highlights: {
      pt: [
        'Árvore e gradient boosting com o mesmo resultado do scikit-learn',
        'K-means++, PCA, métricas (AUC, ECE) e um bloco Transformer',
      ],
      en: [
        'Decision tree and gradient boosting matching scikit-learn exactly',
        'K-means++, PCA, metrics (AUC, ECE) and a Transformer block',
      ],
    },
    tags: ['NumPy', 'Fundamentals'],
    demo: 'demoAttention',
  },
];

export interface App {
  slug: string;
  name: string;
  url: string;
  icon?: string;
  glyph?: string;
  status: T;
  summary: T;
  features: Record<Lang, string[]>;
}

export const APPS: App[] = [
  {
    slug: 'forte-pulso',
    name: 'Forte Pulso',
    url: 'https://fortepulso.com.br',
    icon: '/apps/forte-pulso.png',
    status: { pt: 'Grátis para Android', en: 'Free on Android' },
    summary: {
      pt: 'Treino, comida e saúde no mesmo app, e a sua turma junto.',
      en: 'Workouts, food and health in one app, with your friends along.',
    },
    features: {
      pt: [
        'Monte o treino com 278 exercícios explicados',
        'Registre a refeição por foto ou código de barras, com 1.957 alimentos da tabela brasileira',
        'Dados do seu relógio: passos, batimentos e sono',
        'Desafios com os amigos',
      ],
      en: [
        'Build workouts from 278 explained exercises',
        'Log meals by photo or barcode, with 1,957 foods from the Brazilian food table',
        'Data from your watch: steps, heart rate and sleep',
        'Challenges with friends',
      ],
    },
  },
  {
    slug: 'clave-certa',
    name: 'Clave Certa',
    url: 'https://clavecerta.vgmelo.tech',
    glyph: '𝄞',
    status: { pt: 'Em breve na Google Play', en: 'Coming soon to Google Play' },
    summary: {
      pt: 'Estude teoria musical, ritmo e solfejo em casa, um pouco todo dia.',
      en: 'Study music theory, rhythm and solfège at home, a little every day.',
    },
    features: {
      pt: [
        '16 módulos, das primeiras notas até a leitura nas três claves',
        'Leitura rítmica com metrônomo e avaliação do seu toque',
        'Afinador, movimentos de solfejo animados e desafio entre amigos',
      ],
      en: [
        '16 modules, from the first notes to reading in all three clefs',
        'Rhythm reading with a metronome and feedback on your timing',
        'Tuner, animated conducting patterns and challenges with friends',
      ],
    },
  },
];

export interface Service {
  key: string;
  title: T;
  text: T;
}

export const SERVICES: Service[] = [
  {
    key: 'agents',
    title: { pt: 'Agentes e MCP', en: 'Agents & MCP' },
    text: {
      pt: 'Desenho e coloco em produção agentes que usam as ferramentas e os dados da sua empresa, com servidores MCP, limites de segurança e custo sob controle.',
      en: "I design and ship agents that use your company's tools and data, with MCP servers, guardrails and costs under control.",
    },
  },
  {
    key: 'mlops',
    title: { pt: 'MLOps e MLflow', en: 'MLOps & MLflow' },
    text: {
      pt: 'Pipeline de treino, registro e promoção de modelos com critérios claros, monitoramento de drift e serving com rollback.',
      en: 'Training pipelines, model registry and promotion with clear gates, drift monitoring and serving with rollback.',
    },
  },
  {
    key: 'obs',
    title: { pt: 'Observabilidade de LLM', en: 'LLM observability' },
    text: {
      pt: 'Traces, custo, latência e qualidade das respostas da sua aplicação com LLM, no padrão OpenTelemetry.',
      en: "Traces, cost, latency and answer quality for your LLM application, on OpenTelemetry.",
    },
  },
  {
    key: 'data',
    title: { pt: 'Dados e ETL', en: 'Data & ETL' },
    text: {
      pt: 'Pipelines de dados, bancos e data lakes confiáveis, a base que qualquer modelo precisa.',
      en: 'Reliable data pipelines, databases and data lakes: the foundation any model needs.',
    },
  },
  {
    key: 'apps',
    title: { pt: 'Criação de aplicativos', en: 'App development' },
    text: {
      pt: 'Do backend ao app publicado na loja, como faço no Forte Pulso e no Clave Certa, com IA onde ela ajuda de verdade.',
      en: 'From the backend to the app in the store, like I do with Forte Pulso and Clave Certa, with AI where it actually helps.',
    },
  },
];

export const STACK = [
  'Python',
  'FastAPI',
  'LLM agents',
  'MCP',
  'Claude / OpenAI / Ollama',
  'MLflow',
  'scikit-learn',
  'NumPy',
  'SQL',
  'PostgreSQL',
  'Data lakes',
  'OpenTelemetry',
  'Docker',
  'Caddy',
  'Go',
  'AWS',
];

export interface Demo {
  key: 'demoCnpj' | 'demoDrift' | 'demoAttention' | 'demoAgents' | 'demoCredit' | 'demoMcp';
  live: boolean;
  title: T;
  text: T;
  project: string;
}

export const DEMOS: Demo[] = [
  {
    key: 'demoAgents',
    live: true,
    project: 'agent-orchestrator',
    title: { pt: 'Agentes conversando', en: 'Agents at work' },
    text: {
      pt: 'Faça uma pergunta sobre economia ou uma empresa brasileira e veja o coordenador delegar para os especialistas, com o trace completo.',
      en: 'Ask about the Brazilian economy or a company and watch the coordinator delegate to specialists, with the full trace.',
    },
  },
  {
    key: 'demoMcp',
    live: true,
    project: 'mcp-server-brasil',
    title: { pt: 'Ferramentas MCP', en: 'MCP tools' },
    text: {
      pt: 'Chame as ferramentas do servidor MCP direto: CEP, CNPJ, feriados, Selic, IPCA e dólar.',
      en: 'Call the MCP server tools directly: CEP, CNPJ, holidays, Selic, IPCA and the dollar rate.',
    },
  },
  {
    key: 'demoCredit',
    live: true,
    project: 'mlops-platform',
    title: { pt: 'Score de crédito', en: 'Credit score' },
    text: {
      pt: 'Preencha um perfil e veja a probabilidade de inadimplência dada pelo modelo campeão do MLflow.',
      en: 'Fill in a profile and get the default probability from the champion model in MLflow.',
    },
  },
  {
    key: 'demoCnpj',
    live: false,
    project: 'mcp-server-brasil',
    title: { pt: 'Validador de CNPJ alfanumérico', en: 'Alphanumeric CNPJ validator' },
    text: {
      pt: 'Valide CPF e CNPJ, inclusive o novo formato com letras, e veja a conta do dígito verificador passo a passo.',
      en: 'Validate CPF and CNPJ, including the new format with letters, and see the check digit math step by step.',
    },
  },
  {
    key: 'demoDrift',
    live: false,
    project: 'mlops-platform',
    title: { pt: 'Drift com PSI', en: 'Drift with PSI' },
    text: {
      pt: 'Mude a distribuição de produção e veja o PSI e o alerta que disparam o retreino.',
      en: 'Shift the production distribution and watch the PSI and the alert that triggers retraining.',
    },
  },
  {
    key: 'demoAttention',
    live: false,
    project: 'ml-from-scratch',
    title: { pt: 'Attention por dentro', en: 'Inside attention' },
    text: {
      pt: 'Digite uma frase e veja os pesos de attention com máscara causal, calculados no seu navegador.',
      en: 'Type a sentence and see the causal attention weights, computed in your browser.',
    },
  },
];
