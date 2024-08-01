import { MarkdownPageEvent} from "typedoc-plugin-markdown";

export function load(app) {
    app.renderer.on(
        MarkdownPageEvent.END,
        /** @param {MarkdownPageEvent} page */
        (page) => {
            if (page.model.comment?.blockTags.some(tag => tag.tag === "@todo")) {
                page.frontmatter = {
                    sidebar: '\n  badge:\n    text: TODO\n    variant: tip',
                    ...page.frontmatter,
                };
            }
        }
    );
}
