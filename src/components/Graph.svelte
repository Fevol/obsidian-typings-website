<script lang="ts" context="module">
    export type GraphConfig = {
        enableDrag: boolean,
        enableZoom: boolean,
        depth: number,

        scale: number,
        autoScale: boolean,
        renderArrows: boolean,
        fontSize: number,
        opacityScale: number,
        focusOnHover: boolean,

        repelForce: number,
        centerForce: number,
        linkDistance: number,

        showTags: boolean,
        removeTags: string[],
    }

    export type GraphProps = {
        siteData: Record<string, ContentDetails>;

        w: number;
        h: number;

        config: GraphConfig;
    }

    export type ContentDetails = {
        title: string
        links: string[]
        backlinks: string[]
        tags: string[]
        content: string
        richContent?: string
        date?: Date
        description?: string
    }

    export type NodeData = {
        id: string
        text: string
        tags: string[]
    } & d3.SimulationNodeDatum

    export type LinkData = {
        source: string
        target: string
    }

    export let defaultConfig: GraphConfig = {
        enableZoom: true,
        enableDrag: true,
        depth: 2,
        scale: 1.1,

        fontSize: 0.6,
        opacityScale: 1.3,
        autoScale: true,
        focusOnHover: true,
        renderArrows: false,

        repelForce: 0.5,
        centerForce: 0.3,
        linkDistance: 30,

        showTags: true,
        removeTags: []
    }
</script>

<script lang="ts">
    /**
     * The graph rendering script was originally created by jackyzha0 for Quartz and released under the MIT license
     * All credits for the original script go to the original author
     * In particular, this script combines `Graph.tsx`, `graph.inline.ts` and incorporates some small changes to make
     *   the construct be compatible with Astro.
     * @license MIT
     */

    import * as d3 from "d3"
    import {getRelativePath} from "./util.ts";

    let {
        siteData = {},
        w = 250,
        h = 250,
        config = defaultConfig
    }: GraphProps = $props();

    let svgContainer: HTMLElement;
    let defsElement: SVGDefsElement;

    let width = $derived(Math.max(250, w));
    let height = $derived(Math.max(250, h));
    let scale = $state(config.scale);
    let viewBox = $derived([-width / 2 / scale, -height / 2 / scale, width / scale, height / scale]);
    $inspect(scale, config.depth)

    const sessionStorageKey = "graph-visited";


    $effect(() => {
         constructGraph(siteData);
    });

    $effect(() => {
        if (defsElement)
            defsElement.style.display = config.renderArrows ? "block" : "none"
    });


    function simplifySlug(fp: string): string {
        const res = stripSlashes(trimSuffix(fp, "index"), true)
        return (res.length === 0 ? "/" : res)
    }

    function endsWith(s: string, suffix: string): boolean {
        return s === suffix || s.endsWith("/" + suffix)
    }

    function trimSuffix(s: string, suffix: string): string {
        if (endsWith(s, suffix))
            s = s.slice(0, -suffix.length)
        return s
    }

    function stripSlashes(s: string, onlyStripPrefix?: boolean): string {
        if (s.startsWith("/"))
            s = s.substring(1)
        if (!onlyStripPrefix && s.endsWith("/"))
            s = s.slice(0, -1)
        return s
    }

    function getVisited(): Set<string> {
        return new Set(JSON.parse(sessionStorage.getItem(sessionStorageKey) ?? "[]"))
    }

    function addToVisited(slug: string) {
        const visited = getVisited()
        visited.add(slug)
        sessionStorage.setItem(sessionStorageKey, JSON.stringify([...visited]))
    }

    function constructGraph(siteData: Record<string, ContentDetails> = {}) {
        if (!Object.keys(siteData).length) return;

        let slug = location.pathname;
        const visited = getVisited()
        const links: LinkData[] = []
        const tags: string[] = []
        const data: Map<string, ContentDetails> = new Map(
            Object.entries<ContentDetails>(siteData).map(([k, v]) => [
                simplifySlug(k),
                v,
            ]),
        )

        if (config.depth >= 5)
            config.depth = -1;

        if (slug.startsWith("/"))
            slug = slug.slice(1)
        if (slug.endsWith("/"))
            slug = slug.slice(0, -1)

        const validLinks = new Set(data.keys())
        for (const [source, details] of data.entries()) {
            const outgoing = details.links ?? [];
            for (const dest of outgoing) {
                if (validLinks.has(dest)) {
                    links.push({source: source, target: dest})
                }
            }

            if (config.showTags) {
                const localTags = details.tags
                    .filter((tag) => !config.removeTags.includes(tag))
                    .map((tag) => simplifySlug(("tags/" + tag)))

                tags.push(...localTags.filter((tag) => !tags.includes(tag)))

                for (const tag of localTags) {
                    links.push({source: source, target: tag})
                }
            }
        }

        const neighbourhood = new Set<string>()
        const wl: (string | "__SENTINEL")[] = [slug, "__SENTINEL"]
        let depth = config.depth;
        if (depth >= 0) {
            while (depth >= 0 && wl.length > 0) {
                // compute neighbours
                const cur = wl.shift()!
                if (cur === "__SENTINEL") {
                    depth--
                    wl.push("__SENTINEL")
                } else {
                    neighbourhood.add(cur)
                    const outgoing = links.filter((l) => l.source === cur)
                    const incoming = links.filter((l) => l.target === cur)
                    wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
                }
            }
        } else {
            validLinks.forEach((id) => neighbourhood.add(id))
            if (config.showTags) tags.forEach((tag) => neighbourhood.add(tag))
        }

        const graphData: { nodes: NodeData[]; links: LinkData[] } = {
            nodes: [...neighbourhood].map((url) => {
                const text = url.startsWith("tags/") ? "#" + url.substring(5) : data.get(url)?.title ?? url
                return {
                    id: url,
                    text: text,
                    tags: data.get(url)?.tags ?? [],
                }
            }),
            links: links.filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target)),
        }

        const simulation: d3.Simulation<NodeData, LinkData> = d3
            .forceSimulation(graphData.nodes)
            .force("charge", d3.forceManyBody().strength(-100 * config.repelForce))
            .force(
                "link",
                d3
                    .forceLink(graphData.links)
                    .id((d: any) => d.id)
                    .distance(config.linkDistance),
            )
            .force("center", d3.forceCenter().strength(config.centerForce));

        if (config.autoScale)
            // Automatically scale the graph based on the number of nodes, determined experimentally
            scale = 4 * Math.pow(graphData.nodes.length, -0.4)

        const svg = d3.select<HTMLElement, NodeData>(svgContainer)

        // Draw links between nodes
        const link = svg
            .append("g")
            .selectAll("line")
            .data(graphData.links)
            .join("line")
            .attr("class", "graph-link")
            .attr("marker-end", "url(#graph-link-head)");

        // Define arrowheads for each color
        const defs = svg.append("svg:defs")
            .attr("display", config.renderArrows ? "block" : "none")
        defsElement = defs.node() as SVGDefsElement

        function marker(className: string) {
            defs.append("svg:marker")
                .attr("id", className)
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 15)
                .attr("refY", 0)
                .attr("markerWidth", 5)
                .attr("markerHeight", 5)
                .attr("orient", "auto")
                .attr("markerUnits", "userSpaceOnUse")
                .attr("class", "graph-link-arrow " + className)
                .append("svg:path")
                .attr("d", "M0,-5L10,0L0,5");
            return "url(" + className + ")";
        }


        marker("graph-link-head")
        marker("graph-link-head-hover")

        // SVG groups
        const graphNode = svg.append("g").selectAll("g").data(graphData.nodes).enter().append("g")

        // Calculate color
        const determineClass = (d: NodeData) => {
            if (d.id === slug) {
                return "graph-node graph-node-current"
            } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
                return "graph-node graph-node-visited"
            } else {
                return "graph-node"
            }
        }

        const drag = (simulation: d3.Simulation<NodeData, LinkData>) => {
            function dragstarted(event: any, d: NodeData) {
                if (!event.active) simulation.alphaTarget(1).restart()
                d.fx = d.x
                d.fy = d.y
            }

            function dragged(event: any, d: NodeData) {
                d.fx = event.x
                d.fy = event.y
            }

            function dragended(event: any, d: NodeData) {
                if (!event.active) simulation.alphaTarget(0)
                d.fx = null
                d.fy = null
            }

            return d3
                .drag<Element, NodeData>()
                .on("start", config.enableDrag ? dragstarted : () => {})
                .on("drag", config.enableDrag ? dragged : () => {})
                .on("end", config.enableDrag ? dragended : () => {})
        }

        function nodeRadius(d: NodeData) {
            const numLinks = links.filter((l: any) => l.source.id === d.id || l.target.id === d.id).length
            return 2 + Math.sqrt(numLinks)
        }

        let connectedNodes: string[] = []

        // Draw individual nodes
        const node = graphNode
            .append("circle")
            .attr("class", determineClass)
            .attr("id", (d) => d.id)
            .attr("r", nodeRadius)
            .style("cursor", "pointer")
            .on("click", (_, d) => {
                addToVisited(d.id)
                window.location.assign(getRelativePath(slug, d.id))
            })
            .on("mouseover", function (_: any, d: any) {
                const currentId = d.id
                const linkNodes = d3
                    .selectAll(".graph-link")
                    .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

                if (config.focusOnHover) {
                    connectedNodes = [currentId, ...linkNodes.data()
                        .flatMap((d: any) => [d.source.id, d.target.id])]
                    d3.selectAll(".graph-link")
                        .filter((d: any) => d.source.id !== currentId && d.target.id !== currentId)
                        .classed("graph-faded", true)
                    d3.selectAll<HTMLElement, NodeData>(".graph-node")
                        .filter((d) => !connectedNodes.includes(d.id))
                        .classed("graph-faded", true)
                }

                // Highlight adjacent links, label and node, hide non-adjacent links and nodes
                linkNodes
                    .classed("graph-link-hover", true)
                    .attr("marker-end", "url(#graph-link-head-hover)")

                const parent = this.parentNode as HTMLElement
                d3.select<HTMLElement, NodeData>(parent)
                    .select("text")
                    .classed("graph-label-hover", true)

                d3.selectAll(".graph-label")
                    .filter((d: any) => !connectedNodes.includes(d.id))
                    .classed("graph-faded", true)
            })
            .on("mouseleave", function (_, d) {
                const parent = this.parentNode as HTMLElement
                d3.select<HTMLElement, NodeData>(parent)
                    .select("text")
                    .classed("graph-label-hover", false)
                d3.selectAll(".graph-link")
                    .classed("graph-faded", false)
                    .classed("graph-link-hover", false)
                    .attr("marker-end", "url(#graph-link-head)")
                d3.selectAll(".graph-node")
                    .classed("graph-faded", false)
                d3.selectAll(".graph-label")
                    .classed("graph-faded", false)
            })
            // @ts-ignore
            .call(drag(simulation))

        // Make tags hollow circles
        node
            .filter((d) => d.id.startsWith("tags/"))
            .classed("graph-node-tag", true)

        // Draw labels
        const labels = graphNode
            .append("text")
            .attr("dx", 0)
            .attr("dy", (d) => nodeRadius(d) + 8 + "px")
            .attr("text-anchor", "middle")
            .text((d) => d.text)
            .style("opacity", (config.opacityScale - 1) / 3.75)
            .attr("class", "graph-label")
            .raise()
            // @ts-expect-error Incompatible types
            .call(drag(simulation))

        // Set panning
        if (config.enableZoom) {
            svg.call(
                d3
                    .zoom<SVGSVGElement, NodeData>()
                    .extent([
                        [0, 0],
                        [width, height],
                    ])
                    .scaleExtent([0.25, 4])
                    .on("zoom", ({transform}) => {
                        link.attr("transform", transform)
                        node.attr("transform", transform)
                        const currentScale = transform.k * config.opacityScale
                        const scaledOpacity = Math.max((currentScale - 1) / 3.75, 0)
                        labels.attr("transform", transform).style("opacity", scaledOpacity)
                    }),
            )
        }

        // Progress the simulation
        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y)
            node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
            labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
        })
    }

</script>


<svg bind:this={svgContainer}
     width={width}
     height={height}
     viewBox={viewBox}
/>
