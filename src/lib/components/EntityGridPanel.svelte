<script lang="ts">
  import { untrack } from 'svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import Editor from '$lib/components/Editor.svelte';
  import { getCellValue, toEditString, type GridColumn } from '$lib/utils/entityGrid';

  let {
    entity,
    column,
    entities = [],
    onSave,
    onClose
  }: {
    entity: Record<string, any>;
    column: GridColumn;
    /** Entity list for the editor's @-mention autocomplete. */
    entities?: {
      id: string;
      type: string;
      name: string;
      status?: string;
      primaryImageUrl?: string | null;
    }[];
    onSave: (raw: string) => void;
    onClose: () => void;
  } = $props();

  // The panel is remounted per target (keyed by the parent), so this initialises once.
  let draft = $state(untrack(() => toEditString(getCellValue(entity, column.key))));

  function setOpen(open: boolean) {
    if (!open) onClose();
  }
</script>

<Sheet.Root open onOpenChange={setOpen}>
  <Sheet.Content side="right" class="w-full gap-0 sm:max-w-xl">
    <Sheet.Header>
      <Sheet.Title>{column.label}</Sheet.Title>
      <Sheet.Description>{entity.name}</Sheet.Description>
    </Sheet.Header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4">
      {#if column.type === 'markdown'}
        <Editor content={draft} {entities} onUpdate={(md) => (draft = md)} />
      {:else}
        <Textarea
          bind:value={draft}
          class="min-h-64"
          placeholder={column.placeholder || ''}
          autofocus
        />
      {/if}
    </div>

    <Sheet.Footer class="flex-row justify-end gap-2">
      <Button variant="outline" onclick={onClose}>Cancel</Button>
      <Button onclick={() => onSave(draft)}>Save</Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
