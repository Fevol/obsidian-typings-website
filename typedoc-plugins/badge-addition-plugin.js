import { MarkdownPageEvent} from "typedoc-plugin-markdown";

export function load(app) {
    app.renderer.on(
        MarkdownPageEvent.BEGIN,
        /** @param {MarkdownPageEvent} page */
        (page) => {
            if (page.model.comment?.blockTags.some(tag => tag.tag === "@todo")) {
                page.frontmatter = {
                    sidebar: {
                        badge: {
                            text: "TODO",
                            variant: "caution"
                        },
                    },
                    ...page.frontmatter,
                };
            }
            // FIXME: Temporary fix, there is some really nasty race condition going on
            //  Three plugins are working together
            //   - `./plugins/badge-addition-plugin.js`   | Adds badge to model frontmatter
            //   - `typedoc-plugin-frontmatter`           | Parses the model frontmatter and adds it to MD content
            //   - `starlight-typedoc`                    | Adds default information to frontmatter (title)
            //  As far as I can tell, the problem exists in that `typedoc-plugin-frontmatter`'s
            //  `MarkdownPageEvent.BEGIN` is invoked before `starlight-typedoc`'s `MarkdownPageEvent.BEGIN`.
            page.frontmatter = {
                title: page.model.name,
                editUrl: false,
                next: true,
                prev: true,
                ...page.frontmatter
            }
        }
    );
}
