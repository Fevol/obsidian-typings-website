import fs from "node:fs";
import path from "node:path";

async function* walk(dir) {
    for await (const d of await fs.promises.opendir(dir)) {
        const entry = path.join(dir, d.name);
        if (d.isDirectory()) yield* await walk(entry);
        else if (d.isFile()) yield entry;
    }
}



function siteMapDict() {
    const handler = {
        get: function(target, key) {
            if (!(key in target)) {
                const path = key.toString(); // Assuming the key is the path
                target[key] = {
                    title: path.split("/").pop(),
                    content: "",
                    links: [],
                    tags: []
                };
            }
            return target[key];
        }
    };
    return new Proxy({}, handler);
}

/**
 * Generates a static sitemap for all md files in the docs directory inside public/sitemap.json,
 * consumed by graph generating code
 */
export default function sitemap() {
    return {
        name: "astro-sitemap-plugin",
        hooks: {
            "astro:build:start": async ({ logger }) => {
                logger.info("Mapping site links...");
                const sitemap = siteMapDict();
                const DOCS_ROOT = "src/content/docs";
                for await (const p of walk(DOCS_ROOT)) {
                    if (!p.endsWith(".md")) continue;

                    const content = await fs.promises.readFile(p, "utf8");
                    const path = p.replace(/\\/g, "/").slice(0, -3);
                    const links = content.match(/\[.*?\]\((.*?)\)/g);
                    const entry_name = path.slice(DOCS_ROOT.length + 1).toLowerCase();
                    const sitemap_entry = sitemap[entry_name];
                    sitemap_entry.title = path.split("/").pop();
                    let new_links = [];
                    if (links) {
                        for (const link of links) {
                            const url = link.match(/\((.*?)\)/)[1];
                            if (!url.startsWith("http")) {
                                new_links.push(url.slice(1));
                            }
                        }
                        new_links = new_links
                            .map((link) => link
                                .split("/").slice(0, -1).join("/")
                                .replace(/^.\/(\.\.\/)+/, "")
                            )
                            .filter(link => link !== entry_name);
                        new_links = [...new Set(new_links)];
                        // Create backlinks
                        for (const link of new_links)
                            sitemap[link].links.push(entry_name);
                        sitemap_entry.links = [...new Set([...sitemap_entry.links, ...new_links])];
                    }
                    sitemap[entry_name] = sitemap_entry;
                }

                for (const entry of Object.keys(sitemap)) {
                    const sitemap_entry = sitemap[entry];
                    sitemap_entry.links = [...new Set(sitemap_entry.links)];
                    sitemap[entry] = sitemap_entry;
                }
                await fs.promises.writeFile("./public/sitemap.json", JSON.stringify(sitemap, null, 2));
                logger.info("Site links mapped.");
            }
        }
    };
}
