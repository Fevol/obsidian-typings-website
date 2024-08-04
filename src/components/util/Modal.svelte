<script lang="ts">
    let {showModal = $bindable()}: { showModal: boolean } = $props();

</script>

{#if showModal}
    <div class="modal">
        <slot/>
    </div>
{/if}




<svelte:window on:contextmenu|preventDefault
               onclick={(_) => { showModal = false; }}
/>
