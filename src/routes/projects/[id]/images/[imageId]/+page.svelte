<script lang="ts">
  import EntityThumbnail from '$lib/components/EntityThumbnail.svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { ArrowLeft, Save, Trash2, Link2, Unlink, Image, ExternalLink } from '@lucide/svelte';
  import { ApiError } from '$lib/api';
  import type { EntitySummary } from '$lib/api/entities';
  import * as images from '$lib/api/images';
  import { ENTITY_LABELS } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import type { EntityType } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Combobox } from '$lib/components/ui/combobox';

  let editing = $state(false);
  let caption = $state('');
  let altText = $state('');
  let showLinkPicker = $state(false);
  let selectedEntityId = $state('');
  let error = $state<string | null>(null);

  let image = $derived(page.data?.image as images.ProjectImage | undefined);
  let projectId = $derived(page.params.id ?? '');
  let readOnly = $derived(page.data?.role === 'commenter');

  $effect.pre(() => {
    if (editing) return; // keep unsaved edits across reloads (a failed save, a link change)
    caption = image?.caption || '';
    altText = image?.altText || '';
  });

  function unlinkedEntities() {
    const all = (page.data?.allEntities ?? []) as EntitySummary[];
    const linked = new Set(page.data?.linkedIds || []);
    return all.filter((e) => !linked.has(e.id));
  }

  function message(cause: unknown) {
    return cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
  }

  /** Runs a change and reloads the image. Returns whether the change went through. */
  async function run(change: () => Promise<unknown>): Promise<boolean> {
    let ok = false;
    try {
      await change();
      error = null;
      ok = true;
    } catch (cause) {
      error = message(cause);
    }
    await invalidateAll().catch(() => {});
    return ok;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!image) return;
    const id = image.id;
    if (await run(() => images.updateImage(projectId, id, { caption, altText }))) editing = false;
  }

  async function remove() {
    if (!image || !confirm('Move this image to the trash?')) return;
    const id = image.id;
    try {
      await images.deleteImage(projectId, id);
      await goto(`/projects/${projectId}/images`);
    } catch (cause) {
      error = message(cause);
    }
  }

  async function link(event: SubmitEvent) {
    event.preventDefault();
    if (!image || !selectedEntityId) return;
    const [id, entityId] = [image.id, selectedEntityId];
    if (await run(() => images.linkImage(projectId, id, entityId))) {
      showLinkPicker = false;
      selectedEntityId = '';
    }
  }

  function unlink(entityId: string) {
    if (!image) return;
    const id = image.id;
    return run(() => images.unlinkImage(projectId, id, entityId));
  }
</script>

<svelte:head>
  <title
    >{image?.originalName || 'Image'} — {page.data?.project?.name || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}/images"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to Images
    </a>

    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{image?.originalName || 'Image'}</h1>
      <div class="flex flex-wrap gap-2">
        {#if readOnly}
          <!-- Commenters can look, not change. -->
        {:else if editing}
          <Button form="edit-form" type="submit">
            <Save class="h-4 w-4" />
            Save
          </Button>
          <Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
        {:else}
          <Button variant="outline" onclick={() => (editing = true)}>Edit Details</Button>
          <Button variant="destructive" onclick={remove}>
            <Trash2 class="h-4 w-4" />
            Delete
          </Button>
        {/if}
      </div>
    </div>
    {#if error}
      <p class="mt-3 text-sm text-destructive" role="alert">{error}</p>
    {/if}
  </div>

  <div class="mb-6 overflow-hidden rounded-lg border border-border bg-card">
    <img
      src={image?.url || ''}
      alt={image?.altText || image?.originalName || ''}
      class="mx-auto max-h-[70vh] w-full object-contain"
    />
  </div>

  <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
    <form id="edit-form" onsubmit={save} class="rounded-lg border border-border bg-card p-4">
      <h2 class="mb-3 text-sm font-medium">Details</h2>
      <div class="space-y-3">
        <div class="space-y-1">
          <Label for="caption" class="text-xs text-muted-foreground">Caption</Label>
          <Input
            id="caption"
            name="caption"
            type="text"
            disabled={!editing}
            bind:value={caption}
            placeholder="Add a caption..."
          />
        </div>
        <div class="space-y-1">
          <Label for="altText" class="text-xs text-muted-foreground">Alt Text</Label>
          <Textarea
            id="altText"
            name="altText"
            disabled={!editing}
            bind:value={altText}
            placeholder="Describe the image for accessibility..."
          />
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span class="block font-medium">File</span>
            <span>{image?.originalName || ''}</span>
          </div>
          <div>
            <span class="block font-medium">Type</span>
            <span>{image?.mimeType || ''}</span>
          </div>
          <div>
            <span class="block font-medium">Size</span>
            <span>{image?.size ? Math.round(image.size / 1024) + ' KB' : ''}</span>
          </div>
          <div>
            <span class="block font-medium">URL</span>
            <a href={image?.url} target="_blank" class="underline hover:text-foreground">
              <ExternalLink class="inline h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </form>

    <div class="rounded-lg border border-border bg-card p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium">Linked Entities</h2>
        {#if !readOnly}
          <Button
            variant="ghost"
            size="xs"
            class="text-muted-foreground hover:text-foreground"
            onclick={() => (showLinkPicker = !showLinkPicker)}
          >
            <Link2 class="h-3 w-3" />
            Link
          </Button>
        {/if}
      </div>

      {#if showLinkPicker}
        <form onsubmit={link} class="mb-3 flex gap-2">
          <Combobox
            bind:value={selectedEntityId}
            options={unlinkedEntities().map((e) => ({
              value: e.id,
              label: `${ENTITY_LABELS[e.type as keyof typeof ENTITY_LABELS] || e.type}: ${e.name}`
            }))}
            placeholder="Select entity..."
            class="flex-1"
          />
          <Button type="submit" size="sm">Add</Button>
        </form>
      {/if}

      <div class="space-y-1">
        {#each image?.linkedEntities ?? [] as entity (entity.id)}
          <div
            class="flex items-center justify-between rounded border border-border/50 px-2 py-1.5"
          >
            <a
              href="/projects/{projectId}/{entityTypeToRoute(
                entity.type as EntityType
              )}/{entity.id}"
              class="flex items-center gap-1 text-xs hover:underline"
            >
              <EntityThumbnail
                src={page.data?.allEntities.find((e: EntitySummary) => e.id === entity.id)
                  ?.primaryImageUrl}
              />
              <Badge variant="secondary">{entity.type}</Badge>
              {entity.name}
            </a>
            {#if !readOnly}
              <Button
                variant="ghost"
                size="icon-xs"
                class="text-muted-foreground hover:text-destructive"
                aria-label="Unlink {entity.name}"
                onclick={() => unlink(entity.id)}
              >
                <Unlink class="h-3 w-3" />
              </Button>
            {/if}
          </div>
        {/each}
        {#if !image?.linkedEntities?.length}
          <p class="py-4 text-center text-xs text-muted-foreground">
            <Image class="mx-auto mb-1 h-6 w-6 opacity-30" />
            No entities linked to this image
          </p>
        {/if}
      </div>
    </div>
  </div>
</div>
