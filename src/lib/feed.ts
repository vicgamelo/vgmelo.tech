import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { articlePath, type Lang } from '../i18n/routes';
import { useT } from '../i18n/ui';
import { articlesFor } from './articles';

export const feed = (lang: Lang) => async (context: APIContext) => {
  const t = useT(lang);
  const items = (await articlesFor(lang)).filter((a) => !a.data.draft);
  return rss({
    title: `${t('site.name')} · ${t('articles.title')}`,
    description: t('articles.lead'),
    site: context.site!,
    items: items.map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.date,
      link: articlePath(lang, a.data.slug),
    })),
    customData: `<language>${lang === 'pt' ? 'pt-br' : 'en'}</language>`,
  });
};
