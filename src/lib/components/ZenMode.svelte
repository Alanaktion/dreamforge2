<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { getZenMode } from '$lib/stores/zenMode.svelte';

  const zen = getZenMode();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && zen.active) {
      zen.active = false;
    }
    if (e.key === 'F11' && page.params?.storyId) {
      e.preventDefault();
      zen.toggle();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>
