import {h} from 'hastscript';
import {visit} from 'unist-util-visit';
import {decorateHast} from "./util.js";


const keywords = ["abstract"];


function extractParamInfo(current_node, parent, i) {
    const type = [];
    for (let j = 3; j < current_node.children.length; j += 2) {
        const param_desc = current_node.children[j];
        let current_type_signature = {};
        if (param_desc.type === "link") {
            current_type_signature.url = param_desc.url;
            current_type_signature.type = param_desc.children[0].value;
        } else {
            current_type_signature.type = param_desc.value;
        }

        while (current_node.children[j + 1] && current_node.children[j + 1].type === "text" && current_node.children[j + 1].value !== " | ") {
            current_type_signature.type += current_node.children[j + 1].value;
            j++;
        }

        type.push(current_type_signature);
    }

    let description = "";
    if (parent.children[i + 1].type === "paragraph" && parent.children[i + 1].children[0].value !== "• ")
        description = parent.children[i + 1].children[0].value;

    return {name: current_node.children[1].children[0].value, type, description};
}


export default function remarkToc() {
    return function (tree) {
        visit(tree, (node, index, parent) => {
            const blockquote = parent?.children[index + 1];
            if (node.type !== 'heading' || !blockquote || blockquote.type !== 'blockquote')
                return;


            let parameter_signatures = [];
            let field_signatures = [];
            let generic_signature = null;
            let isAbstract = false;

            let blockquote_parts = blockquote.children[0].children;
            if (blockquote_parts.length) {
                if (blockquote_parts[0].value === 'abstract') {
                    isAbstract = true;
                    blockquote_parts = blockquote_parts.slice(2);
                }

                // Get element after strong tag
                let generic_index = blockquote_parts.findIndex((part) => part.type === 'strong') + 1;
                if (blockquote_parts[generic_index].value.includes("<")) {
                    generic_signature = {name: blockquote_parts[generic_index + 1].value};
                    blockquote_parts = blockquote_parts.slice(generic_index + 2);
                }

                let split = blockquote_parts.findIndex((part) => part.value && part.value.endsWith(": "));
                const parameter_chunks = blockquote_parts.slice(0, split + 1);
                const field_chunks = blockquote_parts.slice(split);


                let current_signature = {"name": ""};

                // TODO: Replace keywords in heading with types
                // TODO: infer types from Types
                // FIXME: Rework heading structure to prevent types from being included in ToC
                for (const chunk of parameter_chunks) {
                    if (chunk.type === 'link') {
                        current_signature.url = chunk.url;
                        current_signature.name += chunk.children[0].value;
                    } else if (chunk.type === 'inlineCode') {
                        current_signature.name += chunk.value;
                    } else if (chunk.type === 'text') {
                        if (chunk.value.includes("?"))
                            current_signature.optional = true;
                        if (chunk.value.includes(", ")) {
                            parameter_signatures.push(current_signature);
                            current_signature = {"name": ""};
                        }
                    }
                }
                if (current_signature.name) {
                    parameter_signatures.push(current_signature);
                    current_signature = {"name": ""};
                }


                for (const chunk of field_chunks) {
                    if (chunk.type === 'link') {
                        current_signature.url = chunk.url;
                        current_signature.name += chunk.children[0].value;
                    } else if (chunk.type === 'inlineCode') {
                        current_signature.name += chunk.value;
                    } else if (chunk.type === 'text') {
                        if (chunk.value === " | ") {
                            field_signatures.push(current_signature);
                            current_signature = {"name": ""};
                        } else {
                            if (chunk.value.includes("=>"))
                                current_signature.name += chunk.value;
                            else if (chunk.value.includes(": "))
                                chunk.value = chunk.value.slice(chunk.value.indexOf(": ") + 2);
                            current_signature.name += chunk.value;
                        }
                    }
                }
                if (current_signature.name) {
                    field_signatures.push(current_signature);
                }
            }

            let parameters_heading_index = -1, parameters_length = 0;
            if (parameter_signatures.length) {
                let i = index + 1;
                let current_node;
                while (current_node = parent.children[++i] && current_node && (current_node.type !== "heading" || current_node.depth !== node.depth)) {
                    if (current_node.type === "heading" && current_node.value.includes("Parameters"))
                        break;
                }
                parameters_heading_index = i;
                i += 1;

                const all_types = [];
                while ((current_node = parent.children[++i]) && current_node && current_node.type !== "heading") {
                    if (current_node.children?.[0].value.includes("• ")) {
                        all_types.push(extractParamInfo(current_node, parent, i));
                    }
                }
                parameters_length = i - parameters_heading_index - 1;

                function recursiveGroup(arr) {
                    return Object
                        .entries(Object.groupBy(arr, (item) => item.name.split(".").shift() || item.name))
                        .map(([name, type]) => {
                            return {name, type}
                        })
                        .map((group) => {
                            group.description = group.type[0].description;
                            if (group.type.length === 1) {
                                group.type = group.type[0].type;
                            } else {
                                group.type = recursiveGroup(group.type.slice(1).map((item) => {
                                    item.name = item.name.split(".").slice(1).join(".");
                                    return item;
                                }));
                            }
                            return group;
                        });
                }
                parameter_signatures = recursiveGroup(all_types);
            }

            let heading = node.children[0];
            const isMethod = heading.value.includes("()") || parameter_signatures.length;
            let returns_heading_index = -1, returns_length = 0;
            if (isMethod) {
                let i = index + 1;
                let current_node;
                while (current_node = parent.children[++i] && current_node && (current_node.type !== "heading" || current_node.depth !== node.depth)) {
                    if (current_node.type === "heading" && current_node.value.includes("Returns"))
                        break;
                }
                returns_heading_index = i;
                i += 1;

                const all_types = [];
                while ((current_node = parent.children[++i]) && current_node && current_node.type !== "heading") {
                    if (current_node.children?.[0].value.includes("• ")) {
                        all_types.push(extractParamInfo(current_node, parent, i));
                    }
                }
                returns_length = i - returns_heading_index - 1;
            }


            function createTypeElement(signature) {
                if (signature.type.some((type) => type.name))
                    return createNestedTypeElement(signature);
                else
                    return createBaseTypeElement(signature);
            }

            function createBaseTypeElement(signature) {
                return h('div', {class: 'parameter-field', ariaLabel: signature.description}, [
                    signature.url ? h('a', {href: signature.url}, signature.name) : signature.name,
                    signature.type ? [
                        {type: 'text', value: ": "},
                        signature.type.map((type, i) => {
                            return [
                                h('div', {class: 'parameter-type'}, [
                                    type.url ? h('a', {href: type.url}, type.type) : {type: 'text', value: type.type}
                                ]),
                                i !== signature.type.length - 1 ? {type: 'text', value: " | "} : undefined
                            ];
                        })
                    ] : undefined
                ]);
            }

            function createNestedTypeElement(signature) {
                return h('div', {class: 'nested-parameter-type'}, [
                    {type: 'text', value: signature.name + ": {"},
                    ...Object.entries(signature.type).map((k, v) => {
                        return [
                            createTypeElement(k[1]),
                            (v !== Object.keys(signature.type).length - 1) ? {type: 'text', value: ", "} : undefined
                        ];
                    }),
                    {type: 'text', value: "}"}
                ]);
            }

            parameter_signatures = parameter_signatures.map((signature) => {
                return h('div', {
                    class: 'signature-type parameter' + (signature.optional ? " parameter-optional" : ""),
                    ariaLabel: signature.description
                }, [
                    createTypeElement(signature),
                ]);
            });

            field_signatures = field_signatures.map((signature) => {
                return h('div', {class: 'signature-type field-type'}, [
                    signature.url ? h('a', {href: signature.url}, signature.name) : signature.name,
                ]);
            });


            // if (isAbstract) {
            //     node.children.unshift(
            //         h('div', { class: 'signature-type abstract-method' }, [{ type: 'text', value: 'abstract'}])
            //     );
            // }

            // if (generic_signature) {
            //     node.children.unshift(
            //         h('div', { class: 'signature-type generic-type' }, [
            //             generic_signature.type,
            //         ])
            //     );
            // }

            // Set current node as display: none
            node.properties = {
                style: 'font-size: 0;'
            };

            const node_children = [];
            let isDeprecated = false;
            if (heading.type === "delete") {
                isDeprecated = true;
                heading = heading.children[0];
            }
            const heading_text = heading.value.replace(/\(.*\)/, "");
            if (!isMethod) {
                node_children.push(h("span", {class: isDeprecated ? "deprecated" : ""},
                    [{"type": "text", "value": heading_text}
                    ]));
                node_children.push(...field_signatures);
            } else {
                node_children.push(...field_signatures.map((signature) => {
                    signature.properties = {
                        class: 'signature-type return-type'
                    };
                    return signature;
                }));
                node_children.push({
                    type: 'text',
                    value: heading_text + "("
                });
                node_children.push(...parameter_signatures);
                node_children.push({
                    type: 'text',
                    value: ")"
                });
            }

            // Create a new container node
            const signature_container = h('div', {class: 'object-signature'}, node_children);

            // node.children = [
            //     ...parameter_signatures,
            //     ...node.children,
            //     ...field_signatures
            // ]
            // node.properties = {
            //     class: 'object-signature'
            // };

            decorateHast(node);
            decorateHast(signature_container);

            let removeBlockQuote = true;
            let offset = 0;
            parent.children.splice(index + 1, removeBlockQuote, signature_container);
            offset += removeBlockQuote;
            if (parameters_heading_index !== -1) {
                parent.children.splice(parameters_heading_index + 1, parameters_length);
                offset -= parameters_length;
            }
            if (returns_heading_index !== -1) {
                parent.children.splice(returns_heading_index + 1, returns_length);
                offset -= returns_length;
            }
        });
    }
}
