export type Lang = 'pt' | 'en';
export const LANGS: Lang[] = ['pt', 'en'];

// Uma chave por página; cada idioma tem o próprio caminho. O seletor de idioma usa isto.
export const ROUTES = {
  home: { pt: '/', en: '/en/' },
  projects: { pt: '/projetos/', en: '/en/projects/' },
  apps: { pt: '/apps/', en: '/en/apps/' },
  demos: { pt: '/demos/', en: '/en/demos/' },
  articles: { pt: '/artigos/', en: '/en/articles/' },
  consulting: { pt: '/consultoria/', en: '/en/consulting/' },
  about: { pt: '/sobre/', en: '/en/about/' },
  contact: { pt: '/contato/', en: '/en/contact/' },
  agenda: { pt: '/agenda/', en: '/en/schedule/' },
  agendaBooking: { pt: '/agenda/reserva/', en: '/en/schedule/booking/' },
  privacy: { pt: '/privacidade/', en: '/en/privacy/' },
  terms: { pt: '/termos/', en: '/en/terms/' },
  login: { pt: '/entrar/', en: '/en/login/' },
  demoCnpj: { pt: '/demos/cnpj/', en: '/en/demos/cnpj/' },
  demoDrift: { pt: '/demos/drift/', en: '/en/demos/drift/' },
  demoAttention: { pt: '/demos/attention/', en: '/en/demos/attention/' },
  demoAgents: { pt: '/demos/agentes/', en: '/en/demos/agents/' },
  demoCredit: { pt: '/demos/credito/', en: '/en/demos/credit/' },
  demoMcp: { pt: '/demos/mcp/', en: '/en/demos/mcp/' },
  demoOcr: { pt: '/demos/ocr/', en: '/en/demos/ocr/' },
  demoPca: { pt: '/demos/pca/', en: '/en/demos/pca/' },
  projectAgentAuth: { pt: '/projetos/agent-auth/', en: '/en/projects/agent-auth/' },
  projectRag: { pt: '/projetos/rag-normas/', en: '/en/projects/rag-normas/' },
} as const satisfies Record<string, Record<Lang, string>>;

export type RouteKey = keyof typeof ROUTES;

export const route = (key: RouteKey, lang: Lang): string => ROUTES[key][lang];

export const articlePath = (lang: Lang, slug: string): string =>
  lang === 'pt' ? `/artigos/${slug}/` : `/en/articles/${slug}/`;
