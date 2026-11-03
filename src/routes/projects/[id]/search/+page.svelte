<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { FileText, Search as SearchIcon, BookOpenText } from '@lucide/svelte';
  import { formatDate } from '$lib/utils';
  import { ENTITY_PLURAL } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import type { EntityType } from '$lib/types';
  import { _MAX_QUERY } from './+page';

  interface Result {
    kind: 'entity' | 'scene';
    id: string;
    type: string;
    name: string;
    context: string;
    href: string;
    tags: string[];
    matchedIn: 'name' | 'body' | 'field' | 'summary';
    snippet: string | null;
    modifiedAt: string;
  }

  const MATCH_LABELS: Record<Result['matchedIn'], string> = {
    name: 'title match',
    body: 'content match',
    field: 'field match',
    summary: 'summary match'
  };

  let query = $state(page.data?.query || '');
  let timer: ReturnType<typeof setTimeout>;
  let searching = $state(false);

  let results = $derived((page.data?.results || []) as Result[]);
  let activeKind = $derived(page.data?.kind || '');
  let activeType = $derived(page.data?.type || '');
  let sceneCount = $derived(results.filter((r) => r.kind === 'scene').length);
  let entityCount = $derived(results.length - sceneCount);

  // The load's query results replace page.data once navigation resolves, which
  // marks the end of the in-flight search regardless of how it was triggered.
  $effect(() => {
    void page.data?.query;
    searching = false;
  });

  async function doSearch(overrides: { kind?: string; type?: string } = {}) {
    searching = true;
    const url = new URL(window.location.href);

    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');

    const kind = overrides.kind ?? activeKind;
    const type = overrides.type ?? activeType;
    if (kind) url.searchParams.set('kind', kind);
    else url.searchParams.delete('kind');
    if (type) url.searchParams.set('type', type);
    else url.searchParams.delete('type');

    await goto(url.toString());
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(), 500);
  }

  let entityTypes = $derived(Object.keys(ENTITY_PLURAL) as EntityType[]);
</script>

<svelte:head>
  <title>Search — {page.data?.projectName || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-bold">Search</h1>
    <p class="text-sm text-muted-foreground">{page.data?.projectName || 'Project'}</p>
  </div>

  <div class="relative mb-3">
    <SearchIcon class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="search"
      placeholder="Search entities, scenes, and summaries…"
      bind:value={query}
      maxlength={_MAX_QUERY}
      oninput={onInput}
      autofocus
      class="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-16 text-sm"
    />
    {#if searching}
      <span
        class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        Searching…
      </span>
    {/if}
  </div>

  <div class="mb-6 flex flex-wrap items-center gap-1.5">
    <Button
      size="xs"
      variant={!activeKind && !activeType ? 'default' : 'outline'}
      onclick={() => doSearch({ kind: '', type: '' })}
    >
      Everything
    </Button>
    <Button
      size="xs"
      variant={activeKind === 'scene' ? 'default' : 'outline'}
      onclick={() => doSearch({ kind: 'scene', type: '' })}
    >
      Scenes
    </Button>
    {#each entityTypes as type (type)}
      <Button
        size="xs"
        variant={activeType === entityTypeToRoute(type) ? 'default' : 'outline'}
        onclick={() => doSearch({ kind: 'entity', type: entityTypeToRoute(type) })}
      >
        {ENTITY_PLURAL[type]}
      </Button>
    {/each}
  </div>

  {#if page.data?.query && results.length > 0}
    <p class="mb-3 text-xs text-muted-foreground">
      {results.length}
      {results.length === 1 ? 'result' : 'results'}
      {#if entityCount > 0 && sceneCount > 0}
        · {entityCount} in the world · {sceneCount} in scenes
      {/if}
    </p>
  {/if}

  <div class="space-y-2">
    {#if page.data?.query && results.length === 0}
      <p class="py-12 text-center text-muted-foreground">
        No results for &ldquo;{page.data.query}&rdquo;
      </p>
    {/if}

    {#each results as result (result.kind + result.id)}
      <a
        href={result.href}
        class="flex items-start gap-4 rounded-lg border border-border bg-card p-4 hover:bg-secondary/50"
      >
        {#if result.kind === 'scene'}
          <BookOpenText class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        {:else}
          <FileText class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        {/if}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{result.name}</span>
            {#if result.kind === 'scene'}
              <Badge variant="secondary">scene</Badge>
            {:else}
              <Badge variant="secondary">{result.type}</Badge>
            {/if}
            {#if result.matchedIn !== 'name'}
              <Badge variant="outline">{MATCH_LABELS[result.matchedIn]}</Badge>
            {/if}
            {#each result.tags || [] as tag (tag)}
              <Badge variant="secondary">{tag}</Badge>
            {/each}
          </div>
          {#if result.kind === 'scene'}
            <p class="mt-0.5 truncate text-xs text-muted-foreground">{result.context}</p>
          {/if}
          {#if result.snippet}
            <p class="mt-1 truncate text-sm text-muted-foreground">{result.snippet}</p>
          {/if}
          <p class="text-xs text-muted-foreground">Modified {formatDate(result.modifiedAt)}</p>
        </div>
      </a>
    {/each}
  </div>
</div>
