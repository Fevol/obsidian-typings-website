import {h, s} from 'hastscript';
import {visit} from 'unist-util-visit';
import {fromHtml} from 'hast-util-from-html';

const acceptableCalloutTypes = {
    'todo': {
        representation: 'Todo',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check">
                <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
            </svg>`
    }
};

/**
 * Recursively walk a `hast` tree and decorate each node with the metadata
 * required for `remark-directive`
 *
 * @param {JSX.Element} node
 */
const decorateHast = node => {
    Object.assign(node.data ?? (node.data = {}), {
        hName: node.tagName,
        hProperties: node.properties,
    });

    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(decorateHast);
    }
};


export default function remarkToc() {
    return function (tree) {
        visit(tree, (node) => {
            if (
                !(
                    node.type === 'textDirective' ||
                    node.type === 'leafDirective' ||
                    node.type === 'containerDirective'
                )
            ) {
                return;
            }

            if (!acceptableCalloutTypes[node.name])
                return;

            const svgContent = acceptableCalloutTypes[node.name].svg;
            const svg = fromHtml(svgContent);


            const bodyContainer = h(
                'section',
                {
                    class: 'starlight-aside__content',
                },
                node.children,
            );

            const titleContainer = h(
                'p',
                {
                    class: 'starlight-aside__title',
                    'aria-hidden': 'true',
                },
                [svg, acceptableCalloutTypes[node.name].representation],
            );

            node.tagName = "aside";
            node.properties = {
                'aria-label': acceptableCalloutTypes[node.name].representation,
                class: `starlight-aside starlight-aside--${node.name}`
            };
            node.children = [titleContainer, bodyContainer];

            decorateHast(node);
        });
    }
}
