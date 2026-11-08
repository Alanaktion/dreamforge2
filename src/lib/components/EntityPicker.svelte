<script lang="ts">
  import EntityThumbnail from '$lib/components/EntityThumbnail.svelte';
  import * as Command from '$lib/components/ui/command/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { Button } from '$lib/components/ui/button';
  import { fuzzyFilter } from '$lib/utils/fuzzy';
  import { ENTITY_LABELS } from '$lib/entityFields';
  import { Plus, X, ChevronsUpDown } from '@lucide/svelte';
  import type { EntityType } from '$lib/types';

  interface PickerEntity {
    primaryImageUrl?: string | null;
    id: string;
    name: string;
    type: EntityType;
  }

  let {
    entities = [],
    value = $bindable<string[]>([]),
    types,
    multiple = true,
    /** Store the entity name instead of its id — for fields that stay human-readable. */
    storeNames = false,
    allowFreeText = false,
    createTypes = [],
    onCreate,
    placeholder = 'Add…',
    searchPlaceholder = 'Search…',
    disabled = false
  }: {
    entities: PickerEntity[];
    value: string[];
    types?: EntityType[];
    multiple?: boolean;
    storeNames?: boolean;
    allowFreeText?: boolean;
    /** Types offered as "Create …" for a name that matches nothing; needs onCreate. */
    createTypes?: EntityType[];
    onCreate?: (name: string, type: EntityType) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  let query = $state('');

  let candidates = $derived(
    types && types.length > 0 ? entities.filter((e) => types.includes(e.type)) : entities
  );

  let matches = $derived(
    fuzzyFilter(
      candidates.filter((e) => !value.includes(storeNames ? e.name : e.id)),
      query,
      (e) => [e.name, ENTITY_LABELS[e.type]],
      12
    )
  );

  let creatable = $derived.by(() => {
    const name = query.trim();
    if (!onCreate || !name) return [];
    if (candidates.some((e) => e.name.toLowerCase() === name.toLowerCase())) return [];
    return createTypes;
  });

  function create(type: EntityType) {
    onCreate?.(query.trim(), type);
    query = '';
    open = false;
  }

  /** Stored values may be ids, names, or leftover free text — show the best label we have. */
  function labelFor(stored: string): string {
    return entities.find((e) => e.id === stored)?.name || stored;
  }

  function add(stored: string) {
    const next = stored.trim();
    if (!next) return;
    value = multiple ? [...value.filter((v) => v !== next), next] : [next];
    query = '';
    open = false;
  }

  function remove(stored: string) {
    value = value.filter((v) => v !== stored);
  }
</script>

<div class="flex flex-wrap items-center gap-1">
  {#each value as stored (stored)}
    {@const selected = entities.find((e) => (storeNames ? e.name === stored : e.id === stored))}
    <span
      class="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs"
    >
      {#if selected}<EntityThumbnail src={selected.primaryImageUrl} class="size-3" />{/if}
      {labelFor(stored)}
      {#if !disabled}
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive"
          aria-label="Remove {labelFor(stored)}"
          onclick={() => remove(stored)}
        >
          <X class="h-3 w-3" />
        </button>
      {/if}
    </span>
  {/each}

  {#if !disabled && (multiple || value.length === 0)}
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="xs" class="text-muted-foreground">
            {#if multiple}
              <Plus class="h-3 w-3" />
            {:else}
              <ChevronsUpDown class="h-3 w-3" />
            {/if}
            {placeholder}
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-64 p-0" align="start">
        <Command.Root shouldFilter={false} loop>
          <Command.Input bind:value={query} placeholder={searchPlaceholder} />
          <Command.List>
            {#if matches.length === 0 && creatable.length === 0 && !(allowFreeText && query.trim())}
              <Command.Empty>No matches.</Command.Empty>
            {/if}
            {#each matches as entity (entity.id)}
              <Command.Item
                value={entity.id}
                onSelect={() => add(storeNames ? entity.name : entity.id)}
              >
                <EntityThumbnail src={entity.primaryImageUrl} />
                <span class="truncate">{entity.name}</span>
                <span class="ml-auto text-xs text-muted-foreground">
                  {ENTITY_LABELS[entity.type]}
                </span>
              </Command.Item>
            {/each}
            {#each creatable as type (type)}
              <Command.Item value="__create-{type}" onSelect={() => create(type)}>
                <Plus class="h-3 w-3" />
                <span class="truncate"
                  >Create {ENTITY_LABELS[type].toLowerCase()} “{query.trim()}”</span
                >
              </Command.Item>
            {/each}
            {#if allowFreeText && query.trim()}
              <Command.Item value="__free__" onSelect={() => add(query)}>
                Use “{query.trim()}”
              </Command.Item>
            {/if}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  {/if}
</div>
