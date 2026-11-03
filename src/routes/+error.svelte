<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
</script>

<svelte:head><title>{page.status} — DreamForge</title></svelte:head>

<div class="mx-auto max-w-lg space-y-4 p-6">
  <h1 class="text-2xl font-bold">
    {#if page.status === 404}Not found{:else}Something went wrong{/if}
  </h1>
  <p class="text-muted-foreground">{page.error?.message}</p>
  {#if page.status === 401}
    <Button href="/login?next={encodeURIComponent(page.url.pathname + page.url.search)}"
      >Log in</Button
    >
  {:else}
    <Button href="/projects" variant="outline">Back to projects</Button>
  {/if}
</div>
