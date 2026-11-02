<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { provideTheme } from '$lib/stores/theme.svelte';
  import { provideZenMode } from '$lib/stores/zenMode.svelte';
  import { provideOverlays } from '$lib/stores/overlays.svelte';
  import ZenMode from '$lib/components/ZenMode.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
  import * as SidebarUI from '$lib/components/ui/sidebar/index.js';

  const theme = provideTheme();
  const zen = provideZenMode();
  provideOverlays();

  let { children } = $props();

  let hasSidebar = $derived(!!page.data?.user && !zen.active);

  $effect(() => {
    document.documentElement.classList.toggle('dark', theme.value === 'dark');
  });
</script>

<ZenMode />
{#if page.data?.user}
  <CommandPalette />
  <KeyboardShortcuts />
{/if}
<div class="flex h-screen overflow-hidden" class:zen-mode={zen.active}>
  {#if hasSidebar}
    <SidebarUI.Provider>
      <Sidebar />
      <main
        class="flex-1 overflow-auto"
        style={zen.active && zen.backgroundImage
          ? `background-image: url(${zen.backgroundImage}); background-size: cover; background-position: center; background-attachment: fixed;`
          : ''}
      >
        {#if page.data.storageProblems?.length}
          <aside role="alert" class="m-3 rounded border border-destructive p-3">
            <p>Some files could not be read. Repair them on disk; other items remain available.</p>
            {#each page.data.storageProblems as problem}<p>
                {problem.file}: {problem.message}
              </p>{/each}
          </aside>
        {/if}
        {@render children()}
      </main>
    </SidebarUI.Provider>
  {:else}
    <main
      class="flex-1 overflow-auto"
      style={zen.active && zen.backgroundImage
        ? `background-image: url(${zen.backgroundImage}); background-size: cover; background-position: center; background-attachment: fixed;`
        : ''}
    >
      {@render children()}
    </main>
  {/if}
</div>
