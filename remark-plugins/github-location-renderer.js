import {h} from 'hastscript';
import {visit} from 'unist-util-visit';
import {decorateHast} from "./util.js";

export default function remarkToc() {
    return function (tree) {
        visit(tree, (node, index, parent) => {
            if (node.type !== 'heading' || node.children[0].value !== 'Defined in') {
                return;
            }

            const href = parent.children[index + 1].children[0].url;
            let prev_heading = null;
            for (let i = index - 1; i >= 0; i--) {
                if ((parent.children[i].tagName === 'div' && parent.children[i].properties.className.includes('object-signature')) || (parent.children[i].type === 'heading' && parent.children[i].depth < node.depth)) {
                    prev_heading = parent.children[i];
                    break;
                }
            }

            const github_icon = h('svg', {xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'currentColor', 'width': 16, 'height': 16}, [
                h('path', {
                    d: 'M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.08 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3Z'
                })
            ]);
            if (prev_heading) {
                prev_heading.children.push(h('a', {class: 'code-location-icon', href}, [github_icon]));
                decorateHast(prev_heading);
                parent.children.splice(index, 2);

            } else {
                const container_node = h('a', {class: 'code-location-text', href}, [github_icon, {type: 'text', value: 'Code location'}]);
                decorateHast(container_node);
                parent.children.splice(index, 2);
                parent.children.unshift(container_node);
            }

        });
    }
}