import starlight from '@astrojs/starlight'
import svelte from '@astrojs/svelte'
import {defineConfig} from 'astro/config'
import starlightTypeDoc, {typeDocSidebarGroup} from 'starlight-typedoc'
import sitemap from "./integrations/astro-sitemap"



export default defineConfig({
    integrations: [
        svelte(),
        starlight({
            title: 'Obsidian Typings TypeDoc',
            social: {
                github: 'https://github.com/fevol/obsidian-typings'
            },
            components: {
                PageSidebar: './src/components/PageSidebar.astro',
            },
            sidebar: [
                {
                    label: 'Reference',
                    autogenerate: {directory: 'reference'}
                },
                {
                    label: 'Guides',
                    autogenerate: {directory: 'guides'},
                },
                typeDocSidebarGroup
            ],
            customCss: [
                './src/styles/global.css'
            ],
            plugins: [
                // Generate the documentation.
                starlightTypeDoc({
                    entryPoints: [
                        './obsidian-typings/src/full-types.d.ts'
                    ],
                    tsconfig: './obsidian-typings/tsconfig.json',
                    pagination: true,
                    sidebar: {
                        label: 'API',
                        collapsed: true
                    },
                    typeDoc: {
                        plugin: [
                            './plugins/resolve-source-plugin.js',
                            './plugins/badge-addition-plugin.js',
                            'typedoc-plugin-frontmatter',
                            'typedoc-plugin-mdn-links'
                        ],
                        theme: 'starlight-typedoc',
                        githubPages: false,
                        entryPointStrategy: 'expand',
                        // propertiesFormat: 'table',
                        excludeExternals: false
                    },
                }),
            ]
        }),
        sitemap()
    ]
})

