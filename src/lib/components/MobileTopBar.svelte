<script lang="ts">
  import { page } from '$app/state';
  import { Command } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { getOverlays } from '$lib/stores/overlays.svelte';

  const overlays = getOverlays();

  let title = $derived(page.data?.projectName || 'DreamForge');
</script>

<header
  class="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 md:hidden"
>
  <Sidebar.Trigger aria-label="Open navigation" />
  {#if page.params?.id}
    <a href="/projects/{page.params.id}" class="min-w-0 flex-1 truncate font-semibold">{title}</a>
  {:else}
    <span class="min-w-0 flex-1 truncate font-semibold">{title}</span>
  {/if}
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label="Quick open"
    onclick={() => overlays.palette.toggle()}
  >
    <Command class="h-4 w-4" />
  </Button>
</header>
