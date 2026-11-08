<script lang="ts">
  import EntityThumbnail from '$lib/components/EntityThumbnail.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import * as Popover from '$lib/components/ui/popover';
  import { cn } from '$lib/utils';
  import {
    getCellValue,
    toEditString,
    statusOption,
    STATUS_OPTIONS,
    type GridColumn
  } from '$lib/utils/entityGrid';
  import { autoWidth } from '$lib/utils/gridDom';
  import { Maximize2, Circle, CircleCheck, CircleDashed } from '@lucide/svelte';

  const STATUS_ICONS = { draft: Circle, wip: CircleDashed, complete: CircleCheck };

  type Move = 'down' | 'right' | 'left' | 'none';

  let {
    entity,
    column,
    editing = false,
    editSeed = '',
    canEdit = false,
    covered = false,
    refOptions = [],
    href,
    onCommit,
    onCancel,
    onOpenPanel
  }: {
    entity: Record<string, any>;
    column: GridColumn;
    editing?: boolean;
    /** Value the editor opens with — a typed character, or the current value. */
    editSeed?: string;
    canEdit?: boolean;
    /** An earlier cell overflows across this one, so drop the empty placeholder. */
    covered?: boolean;
    refOptions?: { id: string; name: string; primaryImageUrl?: string | null }[];
    href?: string;
    onCommit: (raw: string, move: Move) => void;
    onCancel: () => void;
    onOpenPanel: () => void;
  } = $props();

  let value = $derived(getCellValue(entity, column.key));
  let display = $derived(toEditString(value));
  let placeholder = $derived(covered ? '' : '—');

  let draft = $state('');
  let editorEl = $state<HTMLElement | null>(null);
  let status = $derived(statusOption(value));
  /** The status dropdown opens on click, or when the grid puts this cell into edit mode. */
  let statusOpen = $state(false);
  /** Set once the edit is resolved by key, so the unmount blur doesn't commit a second time. */
  let resolved = $state(false);

  // Reseed whenever this cell (re)enters edit mode.
  $effect(() => {
    if (editing) {
      draft = editSeed;
      resolved = false;
    }
  });

  $effect(() => {
    if (editing && column.key === 'status') statusOpen = true;
  });

  function onStatusOpenChange(open: boolean) {
    statusOpen = open;
    if (!open && editing) onCancel();
  }

  function pickStatus(next: string) {
    statusOpen = false;
    onCommit(next, 'none');
  }

  function commitOnBlur() {
    if (resolved) return;
    resolved = true;
    onCommit(draft, 'none');
  }

  $effect(() => {
    if (editing && editorEl) {
      editorEl.focus();
      if (editorEl instanceof HTMLInputElement) {
        // Seeded by a keystroke: keep the caret after it rather than selecting.
        const end = editorEl.value.length;
        editorEl.setSelectionRange(end, end);
      }
    }
  });

  function onEditorKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== 'Escape' && e.key !== 'Tab') return;
    // The grid's own handler would otherwise act on the same key once editing ends.
    e.preventDefault();
    e.stopPropagation();
    resolved = true;
    if (e.key === 'Enter') onCommit(draft, 'down');
    else if (e.key === 'Escape') onCancel();
    else onCommit(draft, e.shiftKey ? 'left' : 'right');
  }

  const inputClass =
    'h-full min-w-0 rounded-none border-0 bg-background px-2 py-0 text-sm shadow-md ring-2 ring-inset ring-primary focus:outline-none';

  let inputType = $derived(
    column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'
  );

  let listId = $derived(`grid-ref-${column.key}`);
</script>

{#if column.key === 'status'}
  {@const StatusIcon = STATUS_ICONS[status.value]}
  {#if canEdit}
    <Popover.Root bind:open={statusOpen} onOpenChange={onStatusOpenChange}>
      <Popover.Trigger
        title={status.label}
        aria-label="Status: {status.label}"
        tabindex={-1}
        class="flex items-center rounded-sm focus:outline-none"
      >
        <StatusIcon class={cn('h-4 w-4', status.class)} />
      </Popover.Trigger>
      <Popover.Content align="start" class="w-40 gap-0 rounded-lg p-1">
        {#each STATUS_OPTIONS as option (option.value)}
          {@const OptionIcon = STATUS_ICONS[option.value]}
          <button
            type="button"
            class={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary',
              option.value === status.value && 'bg-secondary/60'
            )}
            onclick={() => pickStatus(option.value)}
          >
            <OptionIcon class={cn('h-4 w-4', option.class)} />
            {option.label}
          </button>
        {/each}
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span role="img" aria-label={status.label} title={status.label}>
      <StatusIcon class={cn('h-4 w-4', status.class)} />
    </span>
  {/if}
{:else if editing && column.type === 'entityRef'}
  <!-- Free-text with suggestions: entity references are stored as plain names. -->
  <input
    bind:this={editorEl}
    type="text"
    list={listId}
    bind:value={draft}
    class={inputClass}
    use:autoWidth={draft}
    onkeydown={onEditorKeydown}
    onblur={commitOnBlur}
  />
  <datalist id={listId}>
    {#each refOptions as opt (opt.id)}
      <option value={opt.name}></option>
    {/each}
  </datalist>
{:else if editing}
  <input
    bind:this={editorEl}
    type={inputType}
    bind:value={draft}
    placeholder={column.type === 'tags' ? 'tag1, tag2' : column.placeholder || ''}
    class={inputClass}
    use:autoWidth={draft}
    onkeydown={onEditorKeydown}
    onblur={commitOnBlur}
  />
{:else if column.type === 'boolean'}
  <input
    type="checkbox"
    checked={value === true || value === 'true'}
    disabled={!canEdit}
    class="rounded border-input"
    onchange={(e) =>
      onCommit((e.currentTarget as HTMLInputElement).checked ? 'true' : 'false', 'none')}
  />
{:else if column.key === 'name'}
  <a class="flex min-w-0 items-center gap-2 font-medium hover:underline" {href} tabindex={-1}>
    <EntityThumbnail src={entity.primaryImageUrl} />
    <span class="truncate">{display}</span>
  </a>
{:else if column.type === 'entityRef'}
  {@const reference = refOptions.find((e) => e.name === display)}
  <span class="flex min-w-0 items-center gap-2">
    {#if reference}<EntityThumbnail src={reference.primaryImageUrl} />{/if}
    <span class="truncate text-sm text-muted-foreground">{display || placeholder}</span>
  </span>
{:else if column.type === 'tags'}
  {#if Array.isArray(value) && value.length}
    <span class="flex items-center gap-1">
      {#each value.slice(0, 3) as tag}
        <Badge variant="secondary">{tag}</Badge>
      {/each}
      {#if value.length > 3}
        <span class="text-xs text-muted-foreground">+{value.length - 3}</span>
      {/if}
    </span>
  {:else}
    <span class="text-xs text-muted-foreground">{placeholder}</span>
  {/if}
{:else if column.panelOnly}
  <span class={cn('flex min-w-0 items-center gap-1', !display && 'w-full')}>
    <span class="truncate text-sm text-muted-foreground">{display || placeholder}</span>
    {#if canEdit}
      <button
        type="button"
        class="ml-auto shrink-0 opacity-0 group-hover/cell:opacity-100"
        onclick={onOpenPanel}
        tabindex={-1}
        aria-label="Edit {column.label}"
      >
        <Maximize2 class="h-3 w-3 text-muted-foreground" />
      </button>
    {/if}
  </span>
{:else}
  <span class="truncate text-sm text-muted-foreground">{display || placeholder}</span>
{/if}
