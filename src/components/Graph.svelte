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
    }

    const defaultGraphOptions: GraphOptions = {
        drag: true,
        zoom: true,
        depth: 1,
        scale: 1.1,
        autoScale: false,
        repelForce: 0.5,
        centerForce: 0.3,
        linkDistance: 30,
        fontSize: 0.6,
        opacityScale: 1.3,
        showTags: true,
        removeTags: [],
        focusOnHover: false,
    };

    const localGraphOptions: Partial<GraphOptions> = {
        autoScale: true,
    };
    const globalGraphSettings: Partial<GraphOptions> = {
        depth: -1,
        scale: 0.8,
        repelForce: 0.055,
        centerForce: 1.85,
        linkDistance: 30,
        focusOnHover: true,
    };

    let isFullscreen = false;
    let isGlobalGraph = false;

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

    function removeAllChildren(node: HTMLElement) {
        while (node.firstChild) {
            node.removeChild(node.firstChild)
        }
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

    async function renderGraph() {
        const config = Object.assign({}, defaultGraphOptions, isGlobalGraph ? globalGraphSettings : localGraphOptions);
        const graph = isFullscreen ? fullscreenGraphContainer.children[0] as HTMLElement : regularGraphContainer;
        let slug = location.pathname;

        const visited = getVisited()
        if (!graph) return
        removeAllChildren(graph)

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
        } = config

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
            const outgoing = (details.links ?? []).concat(details.backlinks ?? [])
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
            .attr("class", "link")
            .attr("stroke", "var(--lightgray)")
            .attr("stroke-width", 1)

        // SVG groups
        const graphNode = svg.append("g").selectAll("g").data(graphData.nodes).enter().append("g")

        // Calculate color
        const color = (d: NodeData) => {
            const isCurrent = d.id === slug
            if (isCurrent) {
                return "var(--secondary)"
            } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
                return "var(--tertiary)"
            } else {
                return "var(--gray)"
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

        // draw individual nodes
        const node = graphNode
            .append("circle")
            .attr("class", "node")
            .attr("id", (d) => d.id)
            .attr("r", nodeRadius)
            .attr("fill", color)
            .style("cursor", "pointer")
            .on("click", (_, d) => {
                addToVisited(d.id)
                window.location.assign(getRelativePath(slug, d.id))
            })
            .on("mouseover", function (_, d) {
                const currentId = d.id
                const linkNodes = d3
                    .selectAll(".link")
                    .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

                if (focusOnHover) {
                    // fade out non-neighbour nodes
                    connectedNodes = linkNodes.data().flatMap((d: any) => [d.source.id, d.target.id])

                    d3.selectAll<HTMLElement, NodeData>(".link")
                        .transition()
                        .duration(200)
                        .style("opacity", 0.2)
                    d3.selectAll<HTMLElement, NodeData>(".node")
                        .filter((d) => !connectedNodes.includes(d.id))
                        .transition()
                        .duration(200)
                        .style("opacity", 0.2)

                    d3.selectAll<HTMLElement, NodeData>(".node")
                        .filter((d) => !connectedNodes.includes(d.id))
                        .nodes()
                        .map((it) => d3.select(it.parentNode as HTMLElement).select("text"))
                        .forEach((it) => {
                            let opacity = parseFloat(it.style("opacity"))
                            it.transition()
                                .duration(200)
                                .attr("opacityOld", opacity)
                                .style("opacity", Math.min(opacity, 0.2))
                        })
                }

                // highlight links
                linkNodes.transition().duration(200).attr("stroke", "var(--gray)").attr("stroke-width", 1)

                const bigFont = fontSize * 1.5;

                // show text for self
                const parent = this.parentNode as HTMLElement
                d3.select<HTMLElement, NodeData>(parent)
                    .raise()
                    .select("text")
                    .transition()
                    .duration(200)
                    .attr("opacityOld", d3.select(parent).select("text").style("opacity"))
                    .style("opacity", 1)
                    .style("font-size", bigFont + "em")
            })
            .on("mouseleave", function (_, d) {
                if (focusOnHover) {
                    d3.selectAll<HTMLElement, NodeData>(".link").transition().duration(200).style("opacity", 1)
                    d3.selectAll<HTMLElement, NodeData>(".node").transition().duration(200).style("opacity", 1)

                    d3.selectAll<HTMLElement, NodeData>(".node")
                        .filter((d) => !connectedNodes.includes(d.id))
                        .nodes()
                        .map((it) => d3.select(it.parentNode as HTMLElement).select("text"))
                        .forEach((it) => it.transition().duration(200).style("opacity", it.attr("opacityOld")))
                }
                const currentId = d.id
                const linkNodes = d3
                    .selectAll(".link")
                    .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

                linkNodes.transition().duration(200).attr("stroke", "var(--lightgray)")

                const parent = this.parentNode as HTMLElement
                d3.select<HTMLElement, NodeData>(parent)
                    .select("text")
                    .transition()
                    .duration(200)
                    .style("opacity", d3.select(parent).select("text").attr("opacityOld"))
                    .style("font-size", fontSize + "em")
            })
            // @ts-ignore
            .call(drag(simulation))

        // make tags hollow circles
        node
            .filter((d) => d.id.startsWith("tags/"))
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("fill", "var(--light)")

        // Draw labels
        const labels = graphNode
            .append("text")
            .attr("dx", 0)
            .attr("dy", (d) => -nodeRadius(d) + "px")
            .attr("text-anchor", "middle")
            .text((d) => d.text)
            .style("opacity", (opacityScale - 1) / 3.75)
            .style("pointer-events", "none")
            .style("font-size", fontSize + "em")
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

        // progress the simulation
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

    async function renderFullscreenGraph() {
        isFullscreen = true
        const sidebar = fullscreenGraphContainer?.closest(".sidebar") as HTMLElement
        fullscreenGraphContainer?.classList.add("active")
        if (sidebar)
            sidebar.style.zIndex = "1"

        await renderGraph()
        function hideGlobalGraph() {
            isFullscreen = false
            fullscreenGraphContainer?.classList.remove("active")
            const graph = fullscreenGraphContainer.children[0] as HTMLElement
            if (sidebar) sidebar.style.zIndex = "unset"
            if (!graph) return
            removeAllChildren(graph)
        }
        registerEscapeHandler(fullscreenGraphContainer, hideGlobalGraph)
    }

    onMount(async () => {
        await renderGraph()
    })
</script>

<div class="graph">
    <h3>Graph View</h3>

    <div class="graph-outer">
        <div bind:this={regularGraphContainer} id="graph-container"></div>

        <div class="graph-action-container">
            <svg class="graph-action" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 on:click={renderFullscreenGraph}
            >
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>

            <svg class="graph-action" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 55 55"
                 fill="currentColor" xml:space="preserve" aria-label="Reveal Global Graph"
                 on:click={() => {
                        isGlobalGraph = !isGlobalGraph
                        renderGraph()
                 }}
            >
                <path
                        d="M49,0c-3.309,0-6,2.691-6,6c0,1.035,0.263,2.009,0.726,2.86l-9.829,9.829C32.542,17.634,30.846,17,29,17
            s-3.542,0.634-4.898,1.688l-7.669-7.669C16.785,10.424,17,9.74,17,9c0-2.206-1.794-4-4-4S9,6.794,9,9s1.794,4,4,4
            c0.74,0,1.424-0.215,2.019-0.567l7.669,7.669C21.634,21.458,21,23.154,21,25s0.634,3.542,1.688,4.897L10.024,42.562
            C8.958,41.595,7.549,41,6,41c-3.309,0-6,2.691-6,6s2.691,6,6,6s6-2.691,6-6c0-1.035-0.263-2.009-0.726-2.86l12.829-12.829
            c1.106,0.86,2.44,1.436,3.898,1.619v10.16c-2.833,0.478-5,2.942-5,5.91c0,3.309,2.691,6,6,6s6-2.691,6-6c0-2.967-2.167-5.431-5-5.91
            v-10.16c1.458-0.183,2.792-0.759,3.898-1.619l7.669,7.669C41.215,39.576,41,40.26,41,41c0,2.206,1.794,4,4,4s4-1.794,4-4
            s-1.794-4-4-4c-0.74,0-1.424,0.215-2.019,0.567l-7.669-7.669C36.366,28.542,37,26.846,37,25s-0.634-3.542-1.688-4.897l9.665-9.665
            C46.042,11.405,47.451,12,49,12c3.309,0,6-2.691,6-6S52.309,0,49,0z M11,9c0-1.103,0.897-2,2-2s2,0.897,2,2s-0.897,2-2,2
            S11,10.103,11,9z M6,51c-2.206,0-4-1.794-4-4s1.794-4,4-4s4,1.794,4,4S8.206,51,6,51z M33,49c0,2.206-1.794,4-4,4s-4-1.794-4-4
            s1.794-4,4-4S33,46.794,33,49z M29,31c-3.309,0-6-2.691-6-6s2.691-6,6-6s6,2.691,6,6S32.309,31,29,31z M47,41c0,1.103-0.897,2-2,2
            s-2-0.897-2-2s0.897-2,2-2S47,39.897,47,41z M49,10c-2.206,0-4-1.794-4-4s1.794-4,4-4s4,1.794,4,4S51.206,10,49,10z"
                ></path>
            </svg>
        </div>
    </div>

    <div bind:this={fullscreenGraphContainer} id="fullscreen-graph-outer">
        <div id="fullscreen-graph-container"></div>
    </div>
</div>
