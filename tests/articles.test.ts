// O glob loader do Astro usa o `slug` como id da entrada. Dois artigos com o mesmo
// slug (mesmo em idiomas diferentes) fazem um deles sumir do build, só com um aviso.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', 'src', 'content', 'articles');

type Front = { file: string; lang: string; slug: string; translation?: string };

function frontmatter(file: string): Front {
  const text = readFileSync(file, 'utf8');
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const field = (name: string) => block.match(new RegExp(`^${name}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm'))?.[1];
  return { file, lang: field('lang') ?? '', slug: field('slug') ?? '', translation: field('translation') };
}

const articles: Front[] = readdirSync(ROOT).flatMap((lang) =>
  readdirSync(join(ROOT, lang))
    .filter((f) => f.endsWith('.md'))
    .map((f) => frontmatter(join(ROOT, lang, f))),
);

describe('artigos', () => {
  it('existem artigos nos dois idiomas', () => {
    expect(articles.filter((a) => a.lang === 'pt').length).toBeGreaterThan(0);
    expect(articles.filter((a) => a.lang === 'en').length).toBeGreaterThan(0);
  });

  it('slugs são únicos entre todos os idiomas', () => {
    const seen = new Map<string, string>();
    for (const a of articles) {
      expect(a.slug, a.file).not.toBe('');
      expect(seen.get(a.slug), `slug repetido: ${a.slug}`).toBeUndefined();
      seen.set(a.slug, a.file);
    }
  });

  it('a tradução aponta para um artigo do outro idioma que aponta de volta', () => {
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    for (const a of articles.filter((x) => x.translation)) {
      const other = bySlug.get(a.translation!);
      expect(other, `${a.slug} → ${a.translation} não existe`).toBeDefined();
      expect(other!.lang).not.toBe(a.lang);
      expect(other!.translation).toBe(a.slug);
    }
  });
});
