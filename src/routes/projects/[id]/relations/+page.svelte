<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import type { EntitySummary } from '$lib/api/entities';
  import type { Relation } from './+page';
  import { Plus, Trash2, Share2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { ComboboxRich } from '$lib/components/ui/combobox';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';
  import RelationGraph from '$lib/components/RelationGraph.svelte';
  import { RELATION_TYPES, relationLabel } from '$lib/relationTypes';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';

  let showCreate = $state(false);
  let sourceId = $state('');
  let targetId = $state('');
  let relationType = $state('related_to');
  let label = $state('');

  let error = $state<string | null>(null);
  let projectId = $derived(page.params.id ?? '');
  let readOnly = $derived(page.data?.role === 'commenter');
  let entities = $derived((page.data?.entities ?? []) as EntitySummary[]);
  let relations = $derived((page.data?.relations ?? []) as Relation[]);
  let byId = $derived(new Map(entities.map((e) => [e.id, e])));

  async function run(change: () => Promise<unknown>): Promise<boolean> {
    let ok = false;
    try {
      await change();
      error = null;
      ok = true;
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
    }
    await invalidateAll().catch(() => {});
    return ok;
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!sourceId || !targetId) {
      error = 'Pick both entities.';
      return;
    }
    const body = { sourceId, targetId, relationType, label };
    if (await run(() => api(`/api/projects/${projectId}/relations`, { method: 'POST', body }))) {
      showCreate = false;
      sourceId = targetId = label = '';
      relationType = 'related_to';
    }
  }

  function remove(relationId: string) {
    return run(() =>
      api(`/api/projects/${projectId}/relations/${encodeURIComponent(relationId)}`, {
        method: 'DELETE'
      })
    );
  }

  let entityOptions = $derived(
    entities.map((e) => ({
      value: e.id,
      label: e.name,
      group: e.type as string,
      entity: e
    }))
  );
</script>

<svelte:head>
  <title>Relations — {page.data?.projectName || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Relations</h1>
      <p class="text-sm text-muted-foreground">{page.data?.projectName || 'Project'}</p>
    </div>
    {#if !readOnly}
      <Button onclick={() => (showCreate = !showCreate)}>
        <Plus class="h-4 w-4" /> Add Relation
      </Button>
    {/if}
  </div>

  {#if error}
    <p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if showCreate}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <form onsubmit={create} class="space-y-3">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="sourceId">Source Entity</Label>
            <ComboboxRich bind:value={sourceId} options={entityOptions} placeholder="Select..." />
          </div>
          <div class="space-y-1.5">
            <Label for="targetId">Target Entity</Label>
            <ComboboxRich bind:value={targetId} options={entityOptions} placeholder="Select..." />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="relationType">Relation Type</Label>
            <Select type="single" bind:value={relationType}>
              <SelectTrigger id="relationType" class="w-full">
                <SelectValue placeholder="Select relation..." />
              </SelectTrigger>
              <SelectContent>
                {#each RELATION_TYPES as rt (rt)}
                  <SelectItem value={rt}>{rt.replace(/_/g, ' ')}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="label">Label (optional)</Label>
            <Input id="label" type="text" bind:value={label} />
          </div>
        </div>
        <div class="flex gap-2">
          <Button type="submit">Create</Button>
          <Button type="button" variant="outline" onclick={() => (showCreate = false)}
            >Cancel</Button
          >
        </div>
      </form>
    </div>
  {/if}

  <RelationGraph class="mb-4" {entities} {relations} projectId={page.params.id || ''} />

  <h2 class="sr-only">Relation list</h2>
  <ul class="space-y-2" aria-label="Relations">
    {#each relations as rel (rel.id)}
      {@const source = byId.get(rel.sourceId)}
      {@const target = byId.get(rel.targetId)}
      <li
        class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Share2 class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {#if source}
            <a
              href="/projects/{page.params.id}/{entityTypeToRoute(source.type)}/{source.id}"
              class="font-medium hover:underline">{source.name}</a
            >
          {:else}
            <span class="font-medium">{rel.sourceId}</span>
          {/if}
          <span class="text-muted-foreground italic"
            >{rel.label || relationLabel(rel.relationType)}</span
          >
          {#if target}
            <a
              href="/projects/{page.params.id}/{entityTypeToRoute(target.type)}/{target.id}"
              class="font-medium hover:underline">{target.name}</a
            >
          {:else}
            <span class="font-medium">{rel.targetId}</span>
          {/if}
        </div>
        {#if !readOnly}
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={() => remove(rel.id)}
            aria-label="Delete relation {source?.name ?? rel.sourceId} {rel.label ||
              relationLabel(rel.relationType)} {target?.name ?? rel.targetId}"
          >
            <Trash2 class="h-4 w-4 text-destructive" />
          </Button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if relations.length === 0}
    <p class="py-12 text-center text-muted-foreground">
      No relations yet. Connect characters, places, and groups to see who is allied with whom, who
      belongs where, and who owes whom.
    </p>
  {/if}
</div>
