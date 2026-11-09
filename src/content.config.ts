import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Um arquivo por idioma: content/articles/pt/<slug>.md e content/articles/en/<slug>.md.
// `translation` liga as duas versões; `draft: true` não é publicado.
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().max(110),
    description: z.string().max(200),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    lang: z.enum(['pt', 'en']),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    translation: z.string().regex(/^[a-z0-9-]+$/).optional(),
    tags: z.array(z.string()).default([]),
    project: z.string().optional(),
    draft: z.boolean().default(true),
  }),
});

export const collections = { articles };
