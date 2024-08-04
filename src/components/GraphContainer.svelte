<script lang="ts">
    /**
     * The graph rendering script was originally created by jackyzha0 for Quartz and released under the MIT license
     * All credits for the original script go to the original author
     * In particular, this script combines `Graph.tsx`, `graph.inline.ts` and incorporates some small changes to make
     *   the construct be compatible with Astro.
     * @license MIT
     */

    import Graph from "./Graph.svelte";
    import { type GraphConfig, defaultConfig } from "./Graph.svelte";

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
    import settings from "../assets/svgs/settings.svg?raw"
    import Modal from "./util/Modal.svelte";
    import sitemapFile from "./../../public/sitemap.json";


    const config: GraphConfig = $state(Object.assign({}, defaultConfig, JSON.parse(sessionStorage.getItem("graph-config") ?? "{}")));
    let renderArrowAction: HTMLElement | null = null;
    let updateGraphDepthAction: HTMLElement | null = null;

    let width;
    let height;

    let isFullscreen = $state(false);
    let showSettings = false;

    const sessionStorageKey = "graph-visited"

    $effect(() => {
        sessionStorage.setItem("graph-config", JSON.stringify(config));
    });

    // function registerEscapeHandler(outsideContainer: HTMLElement | null, cb: () => void) {
    //     if (!outsideContainer) return
    //
    //     function click(this: HTMLElement, e: HTMLElementEventMap["click"]) {
    //         if (e.target !== this) return
    //         e.preventDefault()
    //         cb()
    //     }
    //
    //     function esc(e: HTMLElementEventMap["keydown"]) {
    //         if (!e.key.startsWith("Esc")) return
    //         e.preventDefault()
    //         cb()
    //     }
    //
    //     outsideContainer?.addEventListener("click", click)
    //     document.addEventListener("keydown", esc)
    // }

    function toggleFullscreenGraph() {
        isFullscreen = !isFullscreen
    }

    function showGraphSettings() {
        showSettings = true;
    }

</script>


{#snippet graphActions()}
    <div class="graph-action-container">
        <div class="graph-action svg-embed" onclick={() => { config.renderArrows = !config.renderArrows }} bind:this={renderArrowAction}>
            {@html config.renderArrows ? arrow : line}
        </div>

        <ContextMenu
                bind:target={renderArrowAction}
                menuItems={[
                { text: "Show arrows", icon: arrow, onClick: () => { config.renderArrows = true } },
                { text: "Show lines", icon: line, onClick: () => { config.renderArrows = false } },
            ]}
        />

        <div class="graph-action svg-embed" onclick={toggleFullscreenGraph}>
            {@html fullscreen}
        </div>

        <div class="graph-action svg-embed" onclick={() => { (config.depth + 1) % 6 }} bind:this={updateGraphDepthAction}>
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
                        }
                    }))
                 }
        />

        <div class="graph-action svg-embed" onclick={showGraphSettings}>
            {@html settings}
        </div>
    </div>
{/snippet}

{#snippet settingsModal()}
    <Modal bind:showModal={showSettings}>
        <div class="graph-settings-modal">
            This is a test
        </div>
    </Modal>
{/snippet}


<div class="graph">
    <h3>Graph View</h3>


    <div class="graph-outer">
        {@render graphActions()}
        {@render settingsModal()}
        <div class="graph-container" bind:clientHeight={height} bind:clientWidth={width}>
            <Graph
                    siteData={sitemapFile} w={width} h={height} config={config}
            />
        </div>
    </div>

    <!--    <div class="fullscreen-graph-outer fullscreen-modal" class:fullscreen-modal-active={isFullscreen}>-->
    <!--        <div class="fullscreen-graph-window">-->
    <!--            {@render graphActions()}-->
    <!--            {@render settingsModal()}-->
    <!--        </div>-->
    <!--    </div>-->
</div>
