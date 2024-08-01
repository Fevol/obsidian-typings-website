import {Converter, ReflectionKind} from "typedoc";

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
            } else if (source.fullFileName.includes("node_modules")) {
                if (file_name) {
                    source.fileName = file_name;
                    source.fullFileName = file_path;
                    // source.line -= offset; (Offset is not needed probably, since import was straight from node_modules)
                    source.url = "https://github.com/" + file_path + "#L" + source.line;
                } else {
                    if (source.fullFileName.includes("obsidian.d.ts")) {
                        source.fileName = "obsidian.d.ts";
                        source.fullFileName = "obsidianmd/obsidian-api/blob/master/obsidian.d.ts";
                        source.url = "https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts#L" + source.line;
                    }
                }
                source.line -= offset;
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
