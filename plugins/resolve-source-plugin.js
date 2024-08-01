import {Converter, ReflectionKind} from "typedoc";
import fs from "node:fs";

const TYPINGS_JSON_PATH = "./obsidian-typings/package.json";

const typings_package = JSON.parse(fs.readFileSync(TYPINGS_JSON_PATH, "utf-8"));
const typings_version = typings_package.version;

const ROOT_FOLDER = "./obsidian-typings/"
const packages = {
    "obsidian": {
        // TODO: Obsidian does not version its github repository, so links will be to master (with risk of being out of sync when an update occurs)
        // version: JSON.parse(fs.readFileSync(ROOT_FOLDER + "node_modules/obsidian/package.json", "utf-8")).version,
        github: "obsidianmd/obsidian",
    },
    "typescript": {
        version: JSON.parse(fs.readFileSync(ROOT_FOLDER + "node_modules/typescript/package.json", "utf-8")).version,
        github: "microsoft/TypeScript",
        version_prefix: "v",
    },
}


const ENTRYPOINT_NAME = "full-types.d.ts";

function traverseChildren(ref, cb) {
    if (ref.children) {
        for (const child of ref.children) {
            cb(child);
            traverseChildren(child, cb);
        }
    }
}

function setSources(ref, file_name = "", file_path = "", offset = 0) {
    if (ref.sources?.length > 0) {
        for (const source of ref.sources) {
            if (source.fullFileName.includes(ENTRYPOINT_NAME)) {
                source.fileName = file_name;
                source.fullFileName = file_path;
                source.line -= offset;
                source.url = "https://github.com/" + file_path + "#L" + source.line;
            }

            // Do not point to included node_modules, but the main entrypoint
            else if (source.fullFileName.includes("node_modules")) {
                if (file_name) {
                    source.fileName = file_name;
                    source.fullFileName = file_path;
                    // source.line -= offset; (Offset is not needed probably, since import was straight from node_modules)
                    source.url = "https://github.com/" + file_path + "#L" + source.line;
                } else {
                    const package_name = source.fileName.slice(13).split("/")[0];
                    if (packages[package_name]) {
                        source.fullFileName = source.fileName.slice(13)
                        source.fileName = source.fileName.split("/").pop();
                        const file_path = source.fullFileName.slice(package_name.length + 1);
                        const version = packages[package_name].version ? ((packages[package_name].version_prefix || "") + packages[package_name].version) : "HEAD";
                        source.url = `https://github.com/${packages[package_name].github}/blob/${version}/${file_path}#L` + source.line;
                    }
                }
                source.line -= offset;
            }

            // Force URL to point to corresponding version, rather than a git commit
            else if (source.url.match(/blob\/[0-9a-f]{5,40}\/src/)) {
                source.url = source.url.replace(/blob\/[0-9a-f]{5,40}\/src/, `blob/${typings_version}/src`);
            }
        }
    }
}

function setAllSources(ref, file_name = "", file_path = "", offset = 0) {
    setSources(ref, file_name, file_path, offset);
    if (ref.signatures) {
        for (const sig of ref.signatures) {
            setSources(sig, file_name, file_path, offset);
        }
    }
}


export function load(app) {
    app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
        const namespace = context.project.getReflectionsByKind(ReflectionKind.Namespace);
        for (const ns of namespace) {
            if (ns.comment?.blockTags.some(tag => tag.tag === "@source")) {
                const source_tag = ns.comment.blockTags.find(tag => tag.tag === "@source");
                let source = source_tag.content[0].text;
                let offset = 0;
                if (source.includes("#")) {
                    ([source, offset] = source.split("#"));
                    offset = parseInt(offset);
                }
                const last_part = source.split('/').pop();
                setAllSources(ns, last_part, source, offset);
                traverseChildren(ns, (child) => {
                    setAllSources(child, last_part, source, offset);
                });
            } else {
                setAllSources(ns);
                traverseChildren(ns, (child) => {
                    setAllSources(child);
                });
            }
        }
    });
}
