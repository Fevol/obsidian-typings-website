import { MarkdownPageEvent } from "typedoc-plugin-markdown";

export function load(app) {
    app.renderer.on(MarkdownPageEvent.END, (page) => {
        page.contents = page.contents.replace(/## Todo\n([\s\S]*?)(?=^## |\z)/gm, ":::todo{.todo}$1:::\n");
        page.contents = page.contents.replace(/## Todo\n([\s\S]*)/gm, ":::todo{.todo}$1:::\n");
    });
}
