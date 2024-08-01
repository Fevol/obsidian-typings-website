import * as d3 from "d3"
import sitemapFile from "./../../public/sitemap.json";

function simplifySlug(fp: string): string {
    const res = stripSlashes(trimSuffix(fp, "index"), true)
    return (res.length === 0 ? "/" : res)
}

function endsWith(s: string, suffix: string): boolean {
    return s === suffix || s.endsWith("/" + suffix)
}

function trimSuffix(s: string, suffix: string): string {
    if (endsWith(s, suffix)) {
        s = s.slice(0, -suffix.length)
    }
    return s
}

function stripSlashes(s: string, onlyStripPrefix?: boolean): string {
    if (s.startsWith("/")) {
        s = s.substring(1)
    }

    if (!onlyStripPrefix && s.endsWith("/")) {
        s = s.slice(0, -1)
    }

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
    tags: string[]
    content: string
    richContent?: string
    date?: Date
    description?: string
}
const fetchData = sitemapFile as unknown as Record<string, ContentDetails>;

type NodeData = {
    id: string
    text: string
    tags: string[]
} & d3.SimulationNodeDatum

type LinkData = {
    source: string
    target: string
}

const localStorageKey = "graph-visited"
function getVisited(): Set<string> {
    return new Set(JSON.parse(sessionStorage.getItem(localStorageKey) ?? "[]"))
}

function addToVisited(slug: string) {
    const visited = getVisited()
    visited.add(slug)
    sessionStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}

function getRelativePath(current: string, next: string) {
    const currentSegments = current.split("/")
    const nextSegments = next.split("/")
    const common = currentSegments.reduce((acc, cur, i) => (cur === nextSegments[i] ? i : acc), 0)
    const back = currentSegments.length - common
    let forward = nextSegments.slice(common).join("/")
    if (!forward.endsWith("/"))
        forward += "/"
    return `${"../".repeat(back)}${forward}`
}

export async function renderGraph(container: string, slug: string) {
    const visited = getVisited()
    const graph = document.getElementById(container)
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
    } = JSON.parse(graph.dataset["cfg"]!)

    if (slug.startsWith("/"))
        slug = slug.slice(1)
    if (slug.endsWith("/"))
        slug = slug.slice(0, -1)

    const data: Map<string, ContentDetails> = new Map(
        Object.entries<ContentDetails>(await fetchData).map(([k, v]) => [
            simplifySlug(k),
            v,
        ]),
    )
    const links: LinkData[] = []
    const tags: string[] = []

    const validLinks = new Set(data.keys())
    for (const [source, details] of data.entries()) {
        const outgoing = details.links ?? []

        for (const dest of outgoing) {
            if (validLinks.has(dest)) {
                links.push({ source: source, target: dest })
            }
        }

        if (showTags) {
            const localTags = details.tags
                .filter((tag) => !removeTags.includes(tag))
                .map((tag) => simplifySlug(("tags/" + tag)))

            tags.push(...localTags.filter((tag) => !tags.includes(tag)))

            for (const tag of localTags) {
                links.push({ source: source, target: tag })
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
        .force("center", d3.forceCenter().strength(centerForce))

    const height = Math.max(graph.offsetHeight, 250)
    const width = graph.offsetWidth

    const svg = d3
        .select<HTMLElement, NodeData>("#" + container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2 / scale, -height / 2 / scale, width / scale, height / scale])

    // draw links between nodes
    const link = svg
        .append("g")
        .selectAll("line")
        .data(graphData.links)
        .join("line")
        .attr("class", "link")
        .attr("stroke", "var(--lightgray)")
        .attr("stroke-width", 1)

    // svg groups
    const graphNode = svg.append("g").selectAll("g").data(graphData.nodes).enter().append("g")

    // calculate color
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

        const noop = () => {}
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

            const bigFont = fontSize * 1.5

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

    // draw labels
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
        // @ts-ignore
        .call(drag(simulation))

    // set panning
    if (enableZoom) {
        svg.call(
            d3
                .zoom<SVGSVGElement, NodeData>()
                .extent([
                    [0, 0],
                    [width, height],
                ])
                .scaleExtent([0.25, 4])
                .on("zoom", ({ transform }) => {
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

export async function renderGlobalGraph() {
    const slug = window.location.pathname;
    const container = document.getElementById("global-graph-outer")
    const sidebar = container?.closest(".sidebar") as HTMLElement
    container?.classList.add("active")
    if (sidebar) {
        sidebar.style.zIndex = "1"
    }

    await renderGraph("global-graph-container", slug)

    function hideGlobalGraph() {
        container?.classList.remove("active")
        const graph = document.getElementById("global-graph-container")
        if (sidebar) {
            sidebar.style.zIndex = "unset"
        }
        if (!graph) return
        removeAllChildren(graph)
    }

    registerEscapeHandler(container, hideGlobalGraph)
}
