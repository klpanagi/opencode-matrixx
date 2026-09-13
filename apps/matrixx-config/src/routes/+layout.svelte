<script lang="ts">
  import "../app.css"
  import Sidebar from "$lib/components/layout/Sidebar.svelte"
  import ToastContainer from "$lib/components/layout/ToastContainer.svelte"
  import { configStore } from "$lib/store/config-store"
  import { onMount } from "svelte"

  let { children }: { children?: import("svelte").Snippet } = $props()

  onMount(() => {
    configStore.load()
  })
</script>

<div class="app-shell">
  <Sidebar />
  <main class="main-content" id="main-content">
    {#if children}{@render children()}{/if}
  </main>
</div>

<ToastContainer />

<style>
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    background: var(--color-bg);
  }
</style>
