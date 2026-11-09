import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n/routes';

export type Article = CollectionEntry<'articles'>;

// Rascunho só aparece no `astro dev` ou com SHOW_DRAFTS=1 (para o Victor revisar antes de publicar).
const showDrafts = import.meta.env.DEV || process.env.SHOW_DRAFTS === '1';

export async function articlesFor(lang: Lang): Promise<Article[]> {
  const all = await getCollection('articles', (a) => a.data.lang === lang && (showDrafts || !a.data.draft));
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function translationOf(article: Article): Promise<Article | undefined> {
  if (!article.data.translation) return undefined;
  const other: Lang = article.data.lang === 'pt' ? 'en' : 'pt';
  const list = await articlesFor(other);
  return list.find((a) => a.data.slug === article.data.translation);
}

export const readingMinutes = (body: string | undefined): number =>
  Math.max(1, Math.round((body ?? '').split(/\s+/).filter(Boolean).length / 220));

export const formatDate = (d: Date, lang: Lang): string =>
  d.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
