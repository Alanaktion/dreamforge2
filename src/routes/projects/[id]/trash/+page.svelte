<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import type { TrashItem } from './+page';
  import { ENTITY_LABELS } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import { formatDate } from '$lib/utils';
  import type { EntityType } from '$lib/types';
  import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog/index.js';

  let confirmEmpty = $state(false);
  let emptying = $state(false);
  let error = $state('');
  let busy = $state<string | null>(null);

  const trashPath = $derived(`/api/projects/${page.params.id}/trash`);
  const canEdit = $derived(page.data?.role !== 'commenter');

  async function act(id: string, run: () => Promise<unknown>) {
    error = '';
    busy = id;
    try {
      await run();
      await invalidateAll();
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
      // Gone already (deleted elsewhere, or its file was missing and the row was dropped):
      // reload so the list matches the server. The message above stays.
      if (cause instanceof ApiError && cause.status === 404) await invalidateAll().catch(() => {});
    } finally {
      busy = null;
    }
  }

  const restore = (item: TrashItem) =>
    act(item.id, () => api(`${trashPath}/${item.id}/restore`, { method: 'POST' }));
  const deleteForever = (item: TrashItem) =>
    act(item.id, () => api(`${trashPath}/${item.id}`, { method: 'DELETE' }));

  async function emptyTrash() {
    emptying = true;
    await act('all', () => api(trashPath, { method: 'DELETE' }));
    emptying = false;
    confirmEmpty = false;
  }

  const KIND_LABELS: Record<string, string> = {
    image: 'Image',
    story: 'Story',
    chapter: 'Chapter',
    scene: 'Scene'
  };

  function itemLabel(item: TrashItem): string {
    return (
      KIND_LABELS[item.entityType] ||
      ENTITY_LABELS[item.entityType as EntityType] ||
      item.entityType
    );
  }

  function goToEntity(item: TrashItem) {
    if (item.entityType === 'image') {
      goto(`/projects/${page.params.id}/images/${item.entityId}`);
    } else if (item.entityType === 'story') {
      goto(`/projects/${page.params.id}/stories/${item.entityId}`);
    } else if (item.entityType === 'chapter' || item.entityType === 'scene') {
      // Chapters and scenes are shown inline within their story page, not at a
      // route of their own.
      const storyId = item.storyId;
      if (storyId) goto(`/projects/${page.params.id}/stories/${storyId}`);
    } else {
      const route = entityTypeToRoute(item.entityType as EntityType);
      goto(`/projects/${page.params.id}/${route}/${item.entityId}`);
    }
  }
</script>

<Dialog.Root bind:open={confirmEmpty}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Empty trash?</Dialog.Title>
      <Dialog.Description>
        {(page.data?.items || []).length}
        {(page.data?.items || []).length === 1 ? 'item' : 'items'} will be permanently deleted. This can't
        be undone.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (confirmEmpty = false)}>Cancel</Button>
      <Button variant="destructive" disabled={emptying} onclick={emptyTrash}>
        <Trash2 class="h-4 w-4" />
        Delete Forever
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<svelte:head>
  <title>Trash — {page.data?.projectName || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.projectName || 'Project'}
    </a>
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Trash</h1>
        <p class="text-sm text-muted-foreground">
          Deleted content is stored here for 30 days before automatic permanent deletion.
        </p>
      </div>
      {#if (page.data?.items || []).length > 0 && canEdit}
        <Button variant="destructive" onclick={() => (confirmEmpty = true)}>
          <Trash2 class="h-4 w-4" />
          Empty Trash
        </Button>
      {/if}
    </div>
  </div>

  {#if error}
    <p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if (page.data?.items || []).length === 0}
    <div class="flex flex-col items-center gap-3 py-16 text-muted-foreground">
      <Trash2 class="h-12 w-12 opacity-30" />
      <p class="text-sm">Trash is empty</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each page.data.items as item (item.id)}
        <div class="rounded-lg border border-border bg-card p-4">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <button
                  class="truncate text-left font-medium hover:underline"
                  onclick={() => goToEntity(item)}
                >
                  {item.name}
                </button>
                <Badge variant="secondary">{itemLabel(item)}</Badge>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                Deleted {formatDate(item.deletedAt)}
                {#if item.expiresAt}
                  &middot; Expires {formatDate(item.expiresAt)}
                {/if}
              </p>
              {#if item.kind === 'image'}
                <p class="mt-2 text-xs text-muted-foreground">
                  {item.name} &middot; {item.mimeType || ''}
                  {#if item.size}
                    &middot; {Math.round(item.size / 1024)} KB
                  {/if}
                </p>
              {:else if item.preview}
                <p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {item.preview}
                </p>
              {/if}
            </div>
            {#if canEdit}
              <div class="flex shrink-0 items-center gap-2 ml-4">
                <Button size="sm" disabled={busy === item.id} onclick={() => restore(item)}>
                  <RotateCcw class="h-3 w-3" />
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === item.id}
                  onclick={() => deleteForever(item)}
                >
                  <AlertTriangle class="h-3 w-3" />
                  Delete Forever
                </Button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
