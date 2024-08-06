<script lang="ts">
    import { clickOutside } from "../util";

    let {showModal = $bindable()}: { showModal: boolean } = $props();
</script>

{#if showModal}
    <div class="popup" use:clickOutside onclick_outside={() => { showModal = false }}>
        <slot/>
    </div>
{/if}
