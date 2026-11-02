<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { enhance, deserialize } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { ENTITY_LABELS, ENTITY_PLURAL } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import Editor from '$lib/components/Editor.svelte';
  import EntityCardList from '$lib/components/EntityCardList.svelte';
  import EntityGrid from '$lib/components/EntityGrid.svelte';
  import GridColumnsMenu from '$lib/components/GridColumnsMenu.svelte';
  import {
    buildGridColumns,
    applyCellValue,
    defaultVisibleKeys,
    sortRows,
    LOCKED_COLUMNS,
    STATUS_OPTIONS,
    type GridColumn,
    type SortDirection
  } from '$lib/utils/entityGrid';
  import { filterEntities, collectTags, type EntitySort } from '$lib/utils/entityFilter';
  import { cn } from '$lib/utils';
  import type { EntityType } from '$lib/types';
  import { Plus, Search, Undo2, Download, Upload, LayoutList, Table2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';

  let showCreate = $state(false);
  let newName = $state('');
  let newBody = $state('');
  let selectedTemplate = $state('');
  let searchQuery = $state('');
  let statusFilter = $state('');
  let tagFilters = $state<string[]>([]);
  let sort = $state<EntitySort>('modified');
  let toastMessage = $state('');
  let toastTrashId = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let toastVisible = $state(false);
  let layout = $state<'cards' | 'table'>('cards');
  let quickName = $state('');
  let quickInput = $state<HTMLInputElement | null>(null);
  let quickAdded = $state<string[]>([]);
  let quickError = $state('');

  let role = $derived(page.data?.role || 'owner');
  let canEdit = $derived(role !== 'commenter');

  const LAYOUT_KEY = $derived(`entity-layout-${page.data?.entityType || 'entity'}`);

  // The command palette links here with ?new=1 to jump straight into creation.
  $effect(() => {
    if (page.url.searchParams.get('new')) showCreate = true;
  });

  $effect(() => {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored === 'table' || stored === 'cards') layout = stored;
  });

  function setLayout(l: 'cards' | 'table') {
    layout = l;
    localStorage.setItem(LAYOUT_KEY, l);
  }

  function showToast(message: string, trashId: string) {
    toastMessage = message;
    toastTrashId = trashId;
    toastVisible = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastVisible = false;
    }, 5000);
  }

  function cancelDelete() {
    if (toastTimer) clearTimeout(toastTimer);
    toastVisible = false;
  }

  function selectTemplate(templateId: string) {
    selectedTemplate = templateId;
    const templates = page.data?.templates || [];
    const tpl = templates.find((t: any) => t.id === templateId);
    newBody = tpl?.body || '';
  }

  function downloadCsv() {
    const route = entityTypeToRoute(page.data?.entityType || 'character');
    window.open(`/projects/${page.params.id}/${route}/export-csv`, '_blank');
  }

  let allEntities = $state<any[]>(page.data?.entities || []);

  $effect(() => {
    allEntities = page.data?.entities || [];
  });

  let availableTags = $derived(collectTags(allEntities));

  let entities = $derived(
    filterEntities(allEntities, {
      query: searchQuery,
      status: statusFilter,
      tags: tagFilters,
      sort
    })
  );

  function toggleTag(tag: string) {
    tagFilters = tagFilters.includes(tag)
      ? tagFilters.filter((t) => t !== tag)
      : [...tagFilters, tag];
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = '';
    tagFilters = [];
  }

  let filtersActive = $derived(!!searchQuery || !!statusFilter || tagFilters.length > 0);

  let gridColumns = $derived(buildGridColumns(page.data?.customFields || []));

  const COLUMNS_KEY = $derived(`entity-columns-${page.data?.entityType || 'entity'}`);
  let columnChoice = $state<string[] | null>(null);
  let autoKeys = $state<Set<string>>(
    untrack(() => defaultVisibleKeys(page.data?.entities || [], gridColumns))
  );

  $effect(() => {
    const stored = localStorage.getItem(COLUMNS_KEY);
    try {
      const parsed = stored ? JSON.parse(stored) : null;
      columnChoice = Array.isArray(parsed) ? parsed : null;
    } catch {
      columnChoice = null;
    }
  });

  // Auto columns are fixed when a list loads, so clearing a field never makes its column vanish.
  $effect(() => {
    const signature = `${page.data?.entityType}:${gridColumns.map((c) => c.key).join(',')}`;
    untrack(() => {
      if (signature) autoKeys = defaultVisibleKeys(page.data?.entities || [], gridColumns);
    });
  });

  let visibleKeys = $derived(
    columnChoice ? new Set([...columnChoice, ...LOCKED_COLUMNS]) : autoKeys
  );
  let shownColumns = $derived(gridColumns.filter((c) => visibleKeys.has(c.key)));

  function chooseColumns(keys: string[]) {
    columnChoice = keys;
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys));
    if (gridSort && !keys.includes(gridSort.key) && !LOCKED_COLUMNS.includes(gridSort.key)) {
      gridSort = null;
    }
  }

  function resetColumns() {
    columnChoice = null;
    localStorage.removeItem(COLUMNS_KEY);
    autoKeys = defaultVisibleKeys(allEntities, gridColumns);
  }

  let gridSort = $state<{ key: string; dir: SortDirection } | null>(null);
  let gridOrder = $state<string[]>([]);

  function toggleGridSort(key: string) {
    if (gridSort?.key !== key) gridSort = { key, dir: 'asc' };
    else if (gridSort.dir === 'asc') gridSort = { key, dir: 'desc' };
    else gridSort = null;
  }

  // Row order is fixed when the view is (re)sorted or filtered, not on every edit or add:
  // rows keep their place while you type, and a row you add lands at the bottom.
  $effect(() => {
    void [
      layout,
      entityType,
      searchQuery,
      statusFilter,
      tagFilters.join(','),
      sort,
      gridSort?.key,
      gridSort?.dir
    ];
    untrack(() => {
      const column = gridSort ? gridColumns.find((c) => c.key === gridSort!.key) : undefined;
      const ordered = column && gridSort ? sortRows(entities, column, gridSort.dir) : entities;
      gridOrder = ordered.map((e) => e.id);
    });
  });

  let gridRows = $derived.by(() => {
    const byId = new Map(entities.map((e) => [e.id, e]));
    const placed = new Set(gridOrder);
    return [
      ...gridOrder.filter((id) => byId.has(id)).map((id) => byId.get(id)!),
      ...entities.filter((e) => !placed.has(e.id))
    ];
  });

  async function addGridRow(name: string): Promise<string | null> {
    const body = new URLSearchParams({ name });
    try {
      const res = await fetch(`${page.url.pathname}?/quickCreate`, {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body
      });
      const result = deserialize(await res.text());
      if (result.type === 'success') {
        await invalidateAll();
        return null;
      }
      if (result.type === 'failure') {
        return (result.data as { error?: string } | undefined)?.error || 'Could not add row';
      }
      return 'Could not add row';
    } catch {
      return 'Could not add row';
    }
  }

  let entityType = $derived((page.data?.entityType || 'character') as EntityType);
  let route = $derived(entityTypeToRoute(entityType));
  let emptyMessage = $derived(
    `No ${ENTITY_PLURAL[entityType].toLowerCase()} yet. Create one to get started.`
  );

  function entityHref(entity: Record<string, any>) {
    return `/projects/${page.params.id}/${entityTypeToRoute(entity.type)}/${entity.id}`;
  }

  /** Mirror a saved cell edit onto the local row so the grid updates without a reload. */
  function applySavedCell(entityId: string, column: GridColumn, raw: string, revision?: string) {
    allEntities = allEntities.map((e) =>
      e.id === entityId ? { ...applyCellValue(e, column, raw), revision } : e
    );
  }
</script>

<svelte:head>
  <title
    >{page.data?.entityType ? ENTITY_PLURAL[page.data.entityType as EntityType] : 'Entities'} — {page
      .data?.projectName || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="mx-auto p-6" class:max-w-5xl={layout !== 'table'}>
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold">
        {page.data?.entityType ? ENTITY_PLURAL[page.data.entityType as EntityType] : 'Entities'}
      </h1>
      <p class="text-sm text-muted-foreground">
        {page.data?.projectName || 'Project'}
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if layout === 'table'}
        <GridColumnsMenu
          columns={gridColumns}
          visible={visibleKeys}
          customized={columnChoice !== null}
          onChange={chooseColumns}
          onReset={resetColumns}
        />
      {/if}
      <div class="flex rounded-lg border border-border overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onclick={() => setLayout('cards')}
          class={cn('rounded-none', layout === 'cards' && 'bg-secondary')}
          aria-label="Card layout"
          aria-pressed={layout === 'cards'}
        >
          <LayoutList class="h-4 w-4" />
          Cards
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onclick={() => setLayout('table')}
          class={cn('rounded-none', layout === 'table' && 'bg-secondary')}
          aria-label="Table layout"
          aria-pressed={layout === 'table'}
        >
          <Table2 class="h-4 w-4" />
          Table
        </Button>
      </div>
      <Button variant="outline" onclick={downloadCsv}>
        <Download class="h-4 w-4" />
        Export CSV
      </Button>
      {#if canEdit}
        <Button
          variant="outline"
          href="/projects/{page.params.id}/{entityTypeToRoute(
            page.data?.entityType || 'character'
          )}/import-csv"
        >
          <Upload class="h-4 w-4" />
          Import CSV
        </Button>
        <Button onclick={() => (showCreate = !showCreate)}>
          <Plus class="h-4 w-4" />
          New {page.data?.entityType ? ENTITY_LABELS[page.data.entityType as EntityType] : ''}
        </Button>
      {/if}
    </div>
  </div>

  {#if showCreate && canEdit}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              showCreate = false;
              newName = '';
              const created = (result.data as { entityId?: string } | undefined)?.entityId;
              if (created) {
                goto(`/projects/${page.params.id}/${route}/${created}`);
                return;
              }
              update();
            }
          };
        }}
        class="space-y-4"
      >
        <div class="space-y-1.5">
          <Label for="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            bind:value={newName}
            placeholder="Enter name..."
          />
        </div>
        {#if page.data?.entityType === 'note' && (page.data?.templates || []).length > 0}
          <div class="space-y-1.5">
            <Label for="template">Template (optional)</Label>
            <Select type="single" value={selectedTemplate} onValueChange={(v) => selectTemplate(v)}>
              <SelectTrigger id="template" class="w-full">
                <SelectValue placeholder="Blank note" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Blank note</SelectItem>
                {#each page.data?.templates || [] as tmpl}
                  <SelectItem value={tmpl.id}>{tmpl.name} — {tmpl.description}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
          {#if newBody}
            <div class="space-y-1.5">
              <Label for="body">Content (edit as needed)</Label>
              <input type="hidden" name="body" value={newBody} />
              <Editor
                content={newBody}
                entities={page.data?.entities || []}
                onUpdate={(md) => (newBody = md)}
              />
            </div>
          {/if}
        {/if}
        {#if (page.data?.customFields || []).length > 0}
          <div class="border-t border-border pt-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">Custom Fields</p>
            {#each page.data.customFields as field}
              <div class="mb-2">
                <Label for="cf-{field.key}" class="text-xs text-muted-foreground mb-0.5">
                  {field.label}
                  {#if field.required}<span class="text-destructive">*</span>{/if}
                </Label>
                {#if field.type === 'boolean'}
                  <input
                    id="cf-{field.key}"
                    name={field.key}
                    type="checkbox"
                    class="rounded border-input"
                  />
                {:else if field.type === 'date'}
                  <Input id="cf-{field.key}" name={field.key} type="date" class="mt-1" />
                {:else if field.type === 'textarea' || field.type === 'markdown'}
                  <Textarea
                    id="cf-{field.key}"
                    name={field.key}
                    class="mt-1"
                    placeholder={field.placeholder || ''}
                  />
                {:else}
                  <Input
                    id="cf-{field.key}"
                    name={field.key}
                    type={field.type === 'number' ? 'number' : 'text'}
                    class="mt-1"
                    placeholder={field.placeholder || ''}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        <div class="flex gap-2">
          <Button type="submit">Create</Button>
          <Button type="button" variant="outline" onclick={() => (showCreate = false)}
            >Cancel</Button
          >
        </div>
      </form>
    </div>
  {/if}

  {#if canEdit && (layout === 'cards' || entities.length === 0)}
    <form
      method="POST"
      action="?/quickCreate"
      class="mb-4"
      use:enhance={() => {
        quickError = '';
        return async ({ result, update }) => {
          if (result.type === 'success') {
            const added = (result.data as { name?: string } | undefined)?.name;
            if (added) quickAdded = [added, ...quickAdded].slice(0, 5);
            quickName = '';
            await update({ reset: false });
          } else if (result.type === 'failure') {
            quickError = (result.data as { error?: string } | undefined)?.error || 'Could not add';
          }
          quickInput?.focus();
        };
      }}
    >
      <div class="relative">
        <Plus class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="name"
          type="text"
          autocomplete="off"
          bind:this={quickInput}
          bind:value={quickName}
          placeholder={entityType === 'character' || entityType === 'species'
            ? 'Quick add: type a name, or "Vess: cynical, smuggler", then press Enter'
            : `Quick add: type a name and press Enter`}
          aria-label="Quick add {ENTITY_LABELS[entityType].toLowerCase()}"
          class="w-full rounded-lg border border-dashed border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary"
        />
      </div>
      {#if quickError}
        <p class="mt-1 text-xs text-destructive">{quickError}</p>
      {:else if quickAdded.length > 0}
        <p class="mt-1 text-xs text-muted-foreground">Added {quickAdded.join(', ')}</p>
      {/if}
    </form>
  {/if}

  <div class="mb-4 space-y-3">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder="Search by name..."
        bind:value={searchQuery}
        class="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm"
      />
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <Button
        size="xs"
        variant={statusFilter === '' ? 'default' : 'outline'}
        onclick={() => (statusFilter = '')}
      >
        All
      </Button>
      {#each STATUS_OPTIONS as option (option.value)}
        <Button
          size="xs"
          variant={statusFilter === option.value ? 'default' : 'outline'}
          onclick={() => (statusFilter = statusFilter === option.value ? '' : option.value)}
        >
          {option.label}
        </Button>
      {/each}

      <span class="mx-1 h-4 w-px bg-border"></span>

      <select
        bind:value={sort}
        aria-label="Sort entities"
        class="h-7 rounded-lg border border-input bg-background px-2 text-xs"
      >
        <option value="modified">Recently edited</option>
        <option value="created">Recently created</option>
        <option value="name">Name A–Z</option>
      </select>

      <span class="ml-auto text-xs text-muted-foreground">
        {entities.length} of {allEntities.length}
      </span>
      {#if filtersActive}
        <Button size="xs" variant="ghost" onclick={clearFilters}>Clear</Button>
      {/if}
    </div>

    {#if availableTags.length > 0}
      <div class="flex flex-wrap items-center gap-1.5">
        {#each availableTags as { tag, count } (tag)}
          <Button
            size="xs"
            variant={tagFilters.includes(tag) ? 'default' : 'outline'}
            onclick={() => toggleTag(tag)}
          >
            {tag}
            <span class="text-[10px] opacity-70">{count}</span>
          </Button>
        {/each}
      </div>
    {/if}
  </div>

  {#if layout === 'cards'}
    <EntityCardList
      {entities}
      {canEdit}
      {emptyMessage}
      {entityHref}
      onDeleted={(trashId) => showToast('Entity moved to trash', trashId)}
    />
  {:else}
    <EntityGrid
      rows={gridRows}
      entities={allEntities}
      columns={shownColumns}
      sort={gridSort}
      onSort={toggleGridSort}
      onAddRow={addGridRow}
      projectId={page.params.id || ''}
      {route}
      {canEdit}
      {emptyMessage}
      refEntities={page.data?.refEntities || {}}
      {entityHref}
      onSaved={applySavedCell}
    />
  {/if}
</div>

{#if toastVisible}
  <div
    class="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg"
  >
    <span class="text-sm">{toastMessage}</span>
    <form
      method="POST"
      action="?/restore"
      use:enhance={() => {
        return async ({ result }) => {
          if (result.type === 'success') {
            cancelDelete();
            goto(window.location.href);
          }
        };
      }}
    >
      <input type="hidden" name="trashId" value={toastTrashId} />
      <Button type="submit" size="sm">
        <Undo2 class="h-3 w-3" />
        Undo
      </Button>
    </form>
    <button class="text-xs text-muted-foreground hover:text-foreground" onclick={cancelDelete}>
      Dismiss
    </button>
  </div>
{/if}
