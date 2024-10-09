import starlight from '@astrojs/starlight'
import svelte from '@astrojs/svelte'
import {defineConfig} from 'astro/config'
import starlightTypeDoc, {typeDocSidebarGroup} from 'starlight-typedoc'
import {argumentsRenderer, admonitionRenderer, githubLocationRenderer} from './remark-plugins'
import starlightThemeObsidian from "starlight-theme-obsidian";


export default defineConfig({
    integrations: [
        starlight({
            title: 'Obsidian Typings',
            social: {
                github: 'https://github.com/fevol/obsidian-typings'
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
                            'typedoc-plugin-mdn-links',
                            'typedoc-plugin-frontmatter',
                            './typedoc-plugins/resolve-source-plugin.js',
                            './typedoc-plugins/badge-addition-plugin.js',
                            './typedoc-plugins/custom-md-render-plugin.js',
                        ],
                        theme: 'starlight-typedoc',
                        githubPages: false,
                        entryPointStrategy: 'expand',
                        // propertiesFormat: 'table',
                        excludeExternals: false
                    },
                }),
                starlightThemeObsidian()
            ]
        }),
        svelte(),

    ],
    markdown: {
        remarkPlugins: [
            // argumentsRenderer,
            admonitionRenderer,
            githubLocationRenderer
        ]
    }
})

