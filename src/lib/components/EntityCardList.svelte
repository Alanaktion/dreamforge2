<script lang="ts">
  import { page } from '$app/state';
  import { ApiError } from '$lib/api';
  import { deleteEntity } from '$lib/api/entities';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { cn, formatDate } from '$lib/utils';
  import { FileText, MoreHorizontal, Trash2 } from '@lucide/svelte';

  let {
    entities,
    canEdit = false,
    emptyMessage = 'Nothing here yet.',
    entityHref,
    onDeleted
  }: {
    entities: Record<string, any>[];
    canEdit?: boolean;
    emptyMessage?: string;
    entityHref: (entity: Record<string, any>) => string;
    onDeleted: (trashId: string) => void;
  } = $props();

  let showMenu = $state<string | null>(null);
  let deleteError = $state('');

  async function remove(entity: Record<string, any>) {
    deleteError = '';
    try {
      const item = await deleteEntity(page.params.id!, entity.type, entity.id);
      showMenu = null;
      onDeleted(item.id);
    } catch (cause) {
      deleteError = cause instanceof ApiError ? cause.message : 'Could not delete';
    }
  }
</script>

<div class="space-y-2">
  {#if entities.length === 0}
    <p class="py-12 text-center text-muted-foreground">{emptyMessage}</p>
  {/if}

  {#each entities as entity}
    <div class="group relative rounded-lg border border-border bg-card hover:bg-secondary/50">
      <a href={entityHref(entity)} class="flex items-center gap-4 px-4 py-3">
        <div
          class={cn(
            'flex-shrink-0 rounded-full border p-2',
            entity.status === 'complete' && 'border-green-500/30',
            entity.status === 'wip' && 'border-yellow-500/30',
            entity.status === 'draft' && 'border-muted-foreground/30'
          )}
        >
          <FileText class="h-4 w-4 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium truncate">{entity.name}</span>
            {#if entity.tags?.length}
              {#each entity.tags.slice(0, 3) as tag}
                <Badge variant="secondary">{tag}</Badge>
              {/each}
              {#if entity.tags.length > 3}
                <span class="text-xs text-muted-foreground">+{entity.tags.length - 3}</span>
              {/if}
            {/if}
          </div>
          <p class="text-xs text-muted-foreground">
            Modified {formatDate(entity.modifiedAt)}
            {#if entity.status === 'complete'}
              <span class="text-green-500">&#9679; Complete</span>
            {:else if entity.status === 'wip'}
              <span class="text-yellow-500">&#9679; WIP</span>
            {:else}
              <span class="text-muted-foreground">&#9679; Draft</span>
            {/if}
          </p>
        </div>
      </a>
      {#if canEdit}
        <div class="absolute right-2 top-1/2 -translate-y-1/2">
          <Button
            variant="ghost"
            size="icon-sm"
            class="max-sm:opacity-100 opacity-0 group-hover:opacity-100"
            onclick={(e) => {
              e.preventDefault();
              showMenu = showMenu === entity.id ? null : entity.id;
            }}
            aria-label="More actions"
          >
            <MoreHorizontal class="h-4 w-4" />
          </Button>
          {#if showMenu === entity.id}
            <div
              class="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-popover shadow-lg"
            >
              <button
                type="button"
                onclick={() => remove(entity)}
                class="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-secondary"
              >
                <Trash2 class="h-4 w-4" />
                Delete
              </button>
              {#if deleteError}
                <p class="px-3 pb-2 text-xs text-destructive">{deleteError}</p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
