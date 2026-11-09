# vgmelo.tech

Código do meu site: projetos, apps, demos, artigos e consultoria. Português em `/`, inglês em `/en/`.

Site estático em [Astro](https://astro.build). As demos de CNPJ, drift (PSI) e attention rodam no navegador, com a mesma regra e os mesmos casos de teste dos projetos em Python. As demos com LLM (agentes, score de crédito e MCP) chamam a API em `/api/*`, que fica em outro serviço, atrás de login e com cota por usuário.

```bash
npm install
npm run dev        # http://localhost:4321, mostra os rascunhos
npm test           # vitest: demos e consistência dos artigos
npm run build      # gera dist/ e roda scripts/check-dist.mjs
```

O `check-dist` falha o build se aparecer script ou handler inline (a CSP do servidor só aceita script do próprio domínio) ou link interno quebrado.

Artigos ficam em `src/content/articles/{pt,en}/` e só são publicados com `draft: false`. Cada artigo aponta para a tradução pelo `slug`.

Anúncios só aparecem nos artigos, quando `PUBLIC_ADSENSE_CLIENT` estiver definido e depois do aceite de cookies.
