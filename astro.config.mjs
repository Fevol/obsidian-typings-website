import starlight from '@astrojs/starlight'
import {defineConfig} from 'astro/config'
import starlightTypeDoc, {typeDocSidebarGroup} from 'starlight-typedoc'

export default defineConfig({
    integrations: [
        starlight({
            title: 'Obsidian Typings TypeDoc',
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
                    autogenerate: {directory: 'guides'}

                },
                typeDocSidebarGroup
            ],

            plugins: [
                // Generate the documentation.
                starlightTypeDoc({
                    entryPoints: [
                        './obsidian-typings/src/types.d.ts',
                    ],
                    tsconfig: './obsidian-typings/tsconfig.json',
                    pagination: true,
                    sidebar: {
                        label: 'API (auto-generated)',
                    },
                    typeDoc: {
                        plugin: [
                            'typedoc-plugin-mdn-links'
                        ],
                        theme: 'starlight-typedoc',
                        githubPages: false,
                        entryPointStrategy: 'expand',
                        categorizeByGroup: true,
                        flattenOutputFiles: false,
                        // propertiesFormat: 'table',
                        excludeExternals: false,
                    },
                }),
            ]
        }),
    ],
})
