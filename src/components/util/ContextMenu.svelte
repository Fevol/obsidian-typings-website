<!--
    Adapted from https://svelte.dev/repl/6fb90919e24942b2b47d9ad154386b0c?version=3.49.0
-->
<script lang="ts">
    import {onMount} from "svelte";

    let pos = $state({x: 0, y: 0});
    let menu = {w: 0, h: 0};
    let browser = {w: 0, h: 0};
    let showMenu = $state(false);

    interface MenuItem {
        type?: "hr" | "warning" | "info",
        group?: string,
        text: string,
        icon?: string
        onClick: () => void,
    }

    interface MenuProps {
        target: HTMLElement | null,
        menuItems?: MenuItem[]
    }

    let {target = $bindable(), menuItems = []}: MenuProps = $props();
    let groupedItems = $derived(Object.groupBy(menuItems, ({ group }) => group || ""))

    onMount(() => {
        return () => {
            if (target !== null) {
                target.removeEventListener("contextmenu", () => {
                    showMenu = true;
                });
            }
        }
    })

    $effect(() => {
        if (target !== null) {
            target.addEventListener("contextmenu", rightClickContextMenu);
        }
    })

    function rightClickContextMenu(e: MouseEvent) {
        showMenu = true
        browser = {
            w: window.innerWidth,
            h: window.innerHeight
        };
        pos = {
            x: e.clientX,
            y: e.clientY
        };
        console.log(pos)

        if (browser.h - pos.y < menu.h)
            pos.y = pos.y - menu.h
        if (browser.w - pos.x < menu.w)
            pos.x = pos.x - menu.w
    }

    function getContextMenuDimension(node: HTMLElement) {
        menu = {
            w: node.offsetWidth,
            h: node.offsetHeight
        }
    }
</script>

{#if showMenu}
    <nav use:getContextMenuDimension class="menu-container" style="top:{pos.y}px; left:{pos.x}px">
        <div class="menu">
            {#each Object.entries(groupedItems) as [key, group] (key)}
                {#if key !== ""}
                    <div class="menu-separator"/>
                {/if}

                {#each group as item}
                    <div class="menu-item" onclick={(e) => {
                        e.preventDefault();
                        item.onClick();
                    }}>
                        {#if item.icon}
                            <div class="menu-icon">
                                {@html item.icon}
                            </div>
                        {/if}
                        <div class="menu-item-title">
                            {item.text}
                        </div>
                    </div>
                {/each}
            {/each}
        </div>
    </nav>
{/if}

<svelte:window on:contextmenu|preventDefault
               onclick={(_) => { showMenu = false; }}
               onmouseup={(e) => { if (e.button === 2) showMenu = false }}
/>
