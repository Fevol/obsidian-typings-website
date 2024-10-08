import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSchema } from 'starlight-site-graph/schema';

export const collections = {
    docs: defineCollection({
        schema: docsSchema({
            extend: context => pageSchema(context),
        }),
    }),
};
