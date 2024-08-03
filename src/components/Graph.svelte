<script lang="ts">
    /**
     * The graph rendering script was originally created by jackyzha0 for Quartz and released under the MIT license
     * All credits for the original script go to the original author
     * In particular, this script combines `Graph.tsx`, `graph.inline.ts` and incorporates some small changes to make
     *   the construct be compatible with Astro.
     * @license MIT
     */

    import {onMount} from "svelte";
    import * as d3 from "d3"
    import sitemapFile from "./../../public/sitemap.json";
    import {getRelativePath} from "./util.ts";
    import ContextMenu from './util/ContextMenu.svelte';

    import fullscreen from "../assets/svgs/fullscreen.svg?raw"
    import arrow from "../assets/svgs/arrow.svg?raw"
    import line from "../assets/svgs/line.svg?raw"
    import graph0 from "../assets/svgs/graph-0.svg?raw"
    import graph1 from "../assets/svgs/graph-1.svg?raw"
    import graph2 from "../assets/svgs/graph-2.svg?raw"
    import graph3 from "../assets/svgs/graph-3.svg?raw"
    import graph4 from "../assets/svgs/graph-4.svg?raw"
    import graph5 from "../assets/svgs/graph-5.svg?raw"


    type GraphOptions = {
        drag: boolean,
        zoom: boolean,
        depth: number,
        scale: number,
        autoScale?: boolean,
        repelForce: number,
        centerForce: number,
        linkDistance: number,
        fontSize: number,
        opacityScale: number,
        showTags: boolean,
        removeTags: string[],
        focusOnHover: boolean,
        renderArrows: boolean,
    }

    const defaultOptions = {
        drag: true,
        zoom: true,
        depth: 2,
        scale: 1.1,
        autoScale: true,
        repelForce: 0.5,
        centerForce: 0.3,
        linkDistance: 30,
        fontSize: 0.6,
        opacityScale: 1.3,
        showTags: true,
        removeTags: [],
        focusOnHover: true,
        renderArrows: false,
    };
    const config = $state(Object.assign({}, defaultOptions, JSON.parse(sessionStorage.getItem("graph-config") ?? "{}")));
    let renderArrowAction: HTMLElement | null = null;
    let updateGraphDepthAction: HTMLElement | null = null;

    let isFullscreen = false;
    $effect(() => {
        sessionStorage.setItem("graph-config", JSON.stringify(config))
    });

    let regularGraphContainer: HTMLElement;
    let fullscreenGraphContainer: HTMLElement;

    const sessionStorageKey = "graph-visited"

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

    function registerEscapeHandler(outsideContainer: HTMLElement | null, cb: () => void) {
        if (!outsideContainer) return

        function click(this: HTMLElement, e: HTMLElementEventMap["click"]) {
            if (e.target !== this) return
            e.preventDefault()
            cb()
        }

        function esc(e: HTMLElementEventMap["keydown"]) {
            if (!e.key.startsWith("Esc")) return
            e.preventDefault()
            cb()
        }

        outsideContainer?.addEventListener("click", click)
        document.addEventListener("keydown", esc)
    }

    type ContentDetails = {
        title: string
        links: string[]
        backlinks: string[]
        tags: string[]
        content: string
        richContent?: string
        date?: Date
        description?: string
    }

    type NodeData = {
        id: string
        text: string
        tags: string[]
    } & d3.SimulationNodeDatum

    type LinkData = {
        source: string
        target: string
    }

    function getVisited(): Set<string> {
        return new Set(JSON.parse(sessionStorage.getItem(sessionStorageKey) ?? "[]"))
    }

    function addToVisited(slug: string) {
        const visited = getVisited()
        visited.add(slug)
        sessionStorage.setItem(sessionStorageKey, JSON.stringify([...visited]))
    }

    function updateGraph() {
        if (isFullscreen) {
            const svg = regularGraphContainer.children[0] as SVGElement;
            svg.setAttribute("height", Math.max(fullscreenGraphContainer.offsetHeight, 250).toString())
            svg.setAttribute("width", fullscreenGraphContainer.offsetWidth.toString())

            fullscreenGraphContainer.replaceChildren(svg)

            regularGraphContainer.replaceChildren();

        } else {
            const svg = fullscreenGraphContainer.children[0] as SVGElement;
            svg.setAttribute("height", Math.max(regularGraphContainer.offsetHeight, 250).toString())
            svg.setAttribute("width", regularGraphContainer.offsetWidth.toString())

            regularGraphContainer.replaceChildren(svg)

            fullscreenGraphContainer.replaceChildren();
        }
    }

    async function renderGraph() {
        const graph = isFullscreen ? fullscreenGraphContainer as HTMLElement : regularGraphContainer;
        let slug = location.pathname;

        const visited = getVisited()
        graph.replaceChildren()

        let {
            drag: enableDrag,
            zoom: enableZoom,
            depth,
            scale,
            repelForce,
            centerForce,
            linkDistance,
            fontSize,
            opacityScale,
            removeTags,
            showTags,
            focusOnHover,
            renderArrows,
        } = config
        if (depth === 5) {
            depth = -1;
        }

        if (slug.startsWith("/"))
            slug = slug.slice(1)
        if (slug.endsWith("/"))
            slug = slug.slice(0, -1)

        const data: Map<string, ContentDetails> = new Map(
            Object.entries<ContentDetails>(sitemapFile).map(([k, v]) => [
                simplifySlug(k),
                v,
            ]),
        )
        const links: LinkData[] = []
        const tags: string[] = []

        const validLinks = new Set(data.keys())
        for (const [source, details] of data.entries()) {
            const outgoing = details.links ?? [];
            for (const dest of outgoing) {
                if (validLinks.has(dest)) {
                    links.push({source: source, target: dest})
                }
            }

            if (showTags) {
                const localTags = details.tags
                    .filter((tag) => !removeTags.includes(tag))
                    .map((tag) => simplifySlug(("tags/" + tag)))

                tags.push(...localTags.filter((tag) => !tags.includes(tag)))

                for (const tag of localTags) {
                    links.push({source: source, target: tag})
                }
            }
        }

        const neighbourhood = new Set<string>()
        const wl: (string | "__SENTINEL")[] = [slug, "__SENTINEL"]
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
            if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
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
            .force("charge", d3.forceManyBody().strength(-100 * repelForce))
            .force(
                "link",
                d3
                    .forceLink(graphData.links)
                    .id((d: any) => d.id)
                    .distance(linkDistance),
            )
            .force("center", d3.forceCenter().strength(centerForce));

        if (config.autoScale)
            // Automatically scale the graph based on the number of nodes, determined experimentally
            scale = 4 * Math.pow(graphData.nodes.length, -0.4)

        const height = Math.max(graph.offsetHeight, 250)
        const width = graph.offsetWidth

        const svg = d3
            .select<HTMLElement, NodeData>(graph)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-width / 2 / scale, -height / 2 / scale, width / scale, height / scale])

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

            const noop = () => {
            }
            return d3
                .drag<Element, NodeData>()
                .on("start", enableDrag ? dragstarted : noop)
                .on("drag", enableDrag ? dragged : noop)
                .on("end", enableDrag ? dragended : noop)
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
            .on("mouseover", function (_, d) {
                const currentId = d.id
                const linkNodes = d3
                    .selectAll(".graph-link")
                    .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

                if (focusOnHover) {
                    connectedNodes = linkNodes.data()
                        .flatMap((d) => [d.source.id, d.target.id])
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
            .style("opacity", (opacityScale - 1) / 3.75)
            .attr("class", "graph-label")
            .raise()
            // @ts-expect-error Incompatible types
            .call(drag(simulation))

        // Set panning
        if (enableZoom) {
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
                        const scale = transform.k * opacityScale
                        const scaledOpacity = Math.max((scale - 1) / 3.75, 0)
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

    function renderFullscreenGraph() {
        isFullscreen = !isFullscreen
        fullscreenGraphContainer.parentElement!.parentElement!.classList.toggle("modal-active", isFullscreen)
        updateGraph()
    }

    function updateGraphDepth() {
        config.depth = (config.depth + 1) % 6

        renderGraph()
    }

    function updateArrowStyle(renderArrows = !config.renderArrows) {
        if (renderArrows === config.renderArrows) return

        config.renderArrows = renderArrows;
        const currentContainer = isFullscreen ? fullscreenGraphContainer : regularGraphContainer
        const defs = currentContainer.getElementsByTagName("defs")[0];
        defs.style.display = config.renderArrows ? "block" : "none"
    }

    onMount(async () => {
        await renderGraph()
        registerEscapeHandler(fullscreenGraphContainer.parentElement!.parentElement!, () => {
            isFullscreen = false
            fullscreenGraphContainer.parentElement!.parentElement!.classList.remove("modal-active")
            updateGraph()
        })
    })
</script>


{#snippet graphActions()}
    <div class="graph-action-container">
        <div class="graph-action svg-embed" onclick={() => updateArrowStyle()} bind:this={renderArrowAction}>
            {@html config.renderArrows ? arrow : line}
        </div>

        <ContextMenu
                bind:target={renderArrowAction}
                menuItems={[
                { text: "Show arrows", icon: arrow, onClick: () => updateArrowStyle(true) },
                { text: "Show lines", icon: line, onClick: () => updateArrowStyle(false) },
            ]}
        />

        <div class="graph-action svg-embed" onclick={renderFullscreenGraph}>
            {@html fullscreen}
        </div>

        <div class="graph-action svg-embed" onclick={updateGraphDepth} bind:this={updateGraphDepthAction}>
            {@html eval(`graph${config.depth}`)}
        </div>

        <ContextMenu
                bind:target={updateGraphDepthAction}
                menuItems={
                    Array.from({length: 6}, (_, i) => ({
                        text: i === 5 ?
                         "Show Entire Graph" :
                          i === 0 ?
                           "Show Only Current" :
                            i === 1 ?
                            "Show Adjacent" :
                            `Show Distance ${i}`,
                        icon: eval(`graph${i}`),
                        onClick: () => {
                            config.depth = i
                            renderGraph()
                        }
                    }))
                 }
        />
    </div>

{/snippet}

<div class="graph">
    <h3>Graph View</h3>

    <div class="graph-outer">
        <div bind:this={regularGraphContainer}></div>
        {@render graphActions()}
    </div>

    <div class="fullscreen-graph-outer modal">
        <div class="fullscreen-graph-window">
            <div class="fullscreen-graph-container" bind:this={fullscreenGraphContainer}></div>
            {@render graphActions()}
        </div>
    </div>
</div>
