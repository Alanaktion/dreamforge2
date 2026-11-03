<script lang="ts">
  import { deserialize } from '$app/forms';
  import { tick } from 'svelte';
  import EntityGridCell from '$lib/components/EntityGridCell.svelte';
  import EntityGridPanel from '$lib/components/EntityGridPanel.svelte';
  import {
    getCellValue,
    toEditString,
    layoutRow,
    parseClipboardGrid,
    normalizePastedValue,
    type GridColumn,
    type SortDirection
  } from '$lib/utils/entityGrid';
  import { ArrowUp, ArrowDown, Plus } from '@lucide/svelte';
  import { spill, scrollTracker, stickyColumns } from '$lib/utils/gridDom';
  import { cn, formatDate } from '$lib/utils';

  let {
    rows,
    entities,
    columns,
    projectId,
    route,
    canEdit = false,
    refEntities = {},
    emptyMessage = 'Nothing here yet.',
    entityHref,
    onSaved,
    sort = null,
    onSort,
    onAddRow
  }: {
    /** Rows currently visible (search-filtered). */
    rows: Record<string, any>[];
    /** Every loaded entity — panel lookups and @-mention autocomplete. */
    entities: Record<string, any>[];
    columns: GridColumn[];
    projectId: string;
    route: string;
    canEdit?: boolean;
    refEntities?: Record<string, { id: string; name: string }[]>;
    emptyMessage?: string;
    entityHref: (entity: Record<string, any>) => string;
    onSaved: (entityId: string, column: GridColumn, raw: string, revision?: string) => void;
    sort?: { key: string; dir: SortDirection } | null;
    onSort?: (key: string) => void;
    /** Resolves to an error message, or null once the row exists. */
    onAddRow?: (name: string) => Promise<string | null>;
  } = $props();

  // `activeCell` is the spreadsheet cursor, `editing` means an inline editor is open.
  let activeCell = $state<{ row: number; col: number } | null>(null);
  let editing = $state(false);
  let editSeed = $state('');
  let panelTarget = $state<{ entityId: string; colIndex: number } | null>(null);
  let gridEl = $state<HTMLElement | null>(null);
  let gridError = $state('');
  let gridNotice = $state('');
  let addName = $state('');
  let addError = $state('');
  let addInput = $state<HTMLInputElement | null>(null);

  let panelEntity = $derived(
    panelTarget ? entities.find((e) => e.id === panelTarget!.entityId) : null
  );

  /** Persist one cell to the server, then let the page patch the row optimistically. */
  async function saveCell(entityId: string, column: GridColumn, raw: string) {
    const current = toEditString(
      getCellValue(entities.find((e) => e.id === entityId) || {}, column.key)
    );
    if (current === raw) return true;

    const body = new FormData();
    body.set('entityId', entityId);
    body.set('field', column.key);
    body.set('value', raw);
    body.set('revision', entities.find((entity) => entity.id === entityId)?.revision ?? '');

    const res = await fetch(`/projects/${projectId}/${route}?/quickUpdate`, {
      method: 'POST',
      body
    });

    const result = deserialize(await res.text());
    if (result.type === 'success') {
      onSaved(entityId, column, raw, (result.data as { revision?: string })?.revision);
      return true;
    }
    gridError =
      result.type === 'failure' && result.status === 409
        ? 'This item changed elsewhere. Your edit was not saved. Copy it, then reload the page before retrying.'
        : `Could not save ${column.label}.`;
    return false;
  }

  function notify(message: string) {
    gridNotice = message;
    setTimeout(() => (gridNotice = ''), 3500);
  }

  async function submitAddRow() {
    const name = addName.trim();
    if (!name || !onAddRow) return;
    const error = await onAddRow(name);
    if (error) {
      addError = error;
      return;
    }
    addError = '';
    addName = '';
    addInput?.focus();
  }

  function onCopy(e: ClipboardEvent) {
    if (editing || !activeCell) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
    const entity = rows[activeCell.row];
    if (!entity) return;
    e.preventDefault();
    e.clipboardData?.setData(
      'text/plain',
      toEditString(getCellValue(entity, columns[activeCell.col].key))
    );
  }

  async function onPaste(e: ClipboardEvent) {
    if (editing || !activeCell || !canEdit || panelTarget) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    e.preventDefault();

    const matrix = parseClipboardGrid(text);
    const start = activeCell;
    let applied = 0;
    let skipped = 0;
    for (let r = 0; r < matrix.length; r++) {
      const entity = rows[start.row + r];
      if (!entity) {
        skipped += matrix[r].length;
        continue;
      }
      for (let c = 0; c < matrix[r].length; c++) {
        const column = columns[start.col + c];
        if (!column) {
          skipped++;
          continue;
        }
        const value = normalizePastedValue(column, matrix[r][c]);
        if (value === null) {
          skipped++;
          continue;
        }
        if (await saveCell(entity.id, column, value)) applied++;
        else skipped++;
      }
    }
    notify(
      skipped > 0
        ? `Pasted ${applied} ${applied === 1 ? 'cell' : 'cells'}, skipped ${skipped} that did not fit`
        : `Pasted ${applied} ${applied === 1 ? 'cell' : 'cells'}`
    );
  }

  async function fillDown() {
    if (!canEdit || !activeCell || activeCell.row === 0) return;
    const column = columns[activeCell.col];
    const above = rows[activeCell.row - 1];
    const entity = rows[activeCell.row];
    if (!above || !entity || column.key === 'name') return;
    await saveCell(entity.id, column, toEditString(getCellValue(above, column.key)));
  }

  function moveActive(dRow: number, dCol: number) {
    if (!activeCell) return;
    const row = Math.min(Math.max(activeCell.row + dRow, 0), rows.length - 1);
    const col = Math.min(Math.max(activeCell.col + dCol, 0), columns.length - 1);
    activeCell = { row, col };
  }

  function beginEdit(seed: string) {
    if (!canEdit || !activeCell) return;
    const column = columns[activeCell.col];
    if (column.panelOnly) {
      openPanel(activeCell.row, activeCell.col);
      return;
    }
    if (column.type === 'boolean') return;
    editSeed = seed;
    editing = true;
  }

  function openPanel(row: number, col: number) {
    if (!canEdit) return;
    const entity = rows[row];
    if (!entity) return;
    editing = false;
    panelTarget = { entityId: entity.id, colIndex: col };
  }

  function closePanel() {
    panelTarget = null;
    focusActiveCell();
  }

  /** Commit by coordinates: a cell can be edited straight from a click, without being active first. */
  function commitCell(
    row: number,
    col: number,
    raw: string,
    move: 'down' | 'right' | 'left' | 'none'
  ) {
    const entity = rows[row];
    const column = columns[col];
    editing = false;
    activeCell = { row, col };
    if (entity && column) saveCell(entity.id, column, raw);

    if (move === 'down') moveActive(1, 0);
    else if (move === 'right') moveActive(0, 1);
    else if (move === 'left') moveActive(0, -1);
    focusActiveCell();
  }

  function focusActiveCell() {
    tick().then(() => {
      if (editing || !activeCell || !gridEl) return;
      const el = gridEl.querySelector<HTMLElement>(
        `[data-cell="${activeCell.row}-${activeCell.col}"]`
      );
      el?.focus();
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function onGridKeydown(e: KeyboardEvent) {
    if (!activeCell || editing || panelTarget) return;
    const column = columns[activeCell.col];
    const entity = rows[activeCell.row];

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      fillDown();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (activeCell.row === rows.length - 1 && onAddRow && canEdit) {
          addInput?.focus();
          return;
        }
        moveActive(1, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveActive(0, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveActive(0, -1);
        break;
      case 'Tab':
        e.preventDefault();
        if (
          !e.shiftKey &&
          activeCell.col === columns.length - 1 &&
          activeCell.row < rows.length - 1
        ) {
          activeCell = { row: activeCell.row + 1, col: Math.min(1, columns.length - 1) };
        } else if (e.shiftKey && activeCell.col <= 1 && activeCell.row > 0) {
          activeCell = { row: activeCell.row - 1, col: columns.length - 1 };
        } else {
          moveActive(0, e.shiftKey ? -1 : 1);
        }
        break;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        beginEdit(toEditString(getCellValue(entity, column.key)));
        break;
      case 'Escape':
        activeCell = null;
        return;
      case ' ':
        if (canEdit && column.type === 'boolean') {
          e.preventDefault();
          const on = getCellValue(entity, column.key) === true;
          saveCell(entity.id, column, on ? 'false' : 'true');
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (canEdit && !column.panelOnly && column.key !== 'name') {
          e.preventDefault();
          saveCell(entity.id, column, column.type === 'boolean' ? 'false' : '');
        }
        return;
      default:
        // A bare printable character starts editing, seeded with what was typed.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          beginEdit(e.key);
        }
        return;
    }
    focusActiveCell();
  }

  // Keep the cursor in bounds when the filtered row set shrinks.
  $effect(() => {
    if (activeCell && activeCell.row >= rows.length) {
      activeCell = rows.length ? { ...activeCell, row: rows.length - 1 } : null;
    }
  });
</script>

<p class="mb-2 text-xs text-muted-foreground">
  Click a cell, then use arrow keys to move. Type or press Enter to edit, Enter/Tab to commit,
  Escape to cancel, Space to toggle checkboxes, Delete to clear. Ctrl/⌘+D fills down, and you can
  paste cells copied from a spreadsheet. Click a column header to sort.
</p>
<div class="rounded-lg border border-border overflow-x-auto" use:scrollTracker bind:this={gridEl}>
  {#if rows.length === 0}
    <p class="py-12 text-center text-muted-foreground">{emptyMessage}</p>
  {:else}
    <table
      role="grid"
      aria-label="Entries. Use arrow keys to move, Enter to edit, Escape to cancel."
      class="w-full text-sm min-w-max border-separate border-spacing-0"
      use:stickyColumns
      onkeydown={onGridKeydown}
      oncopy={onCopy}
      onpaste={onPaste}
    >
      <thead class="sticky top-0 z-20 bg-background">
        <tr class="bg-muted/40">
          {#each columns as column, col}
            <th
              class={cn(
                'border-b border-border px-2 py-1.5 text-left font-medium whitespace-nowrap bg-muted/40',
                col <= 1 && 'sticky z-10 backdrop-blur-md',
                col === 1 && 'min-w-48',
                activeCell?.col === col && 'bg-primary/10 text-foreground'
              )}
              style={col === 0 ? 'left: 0' : col === 1 ? 'left: var(--grid-col0, 4rem)' : undefined}
            >
              <button
                type="button"
                class="flex items-center gap-1 hover:text-foreground"
                aria-label="Sort by {column.label}"
                onclick={() => onSort?.(column.key)}
              >
                {#if col === 0}
                  <span class="sr-only">{column.label}</span>
                {:else}
                  {column.label}
                {/if}
                {#if sort?.key === column.key}
                  {#if sort.dir === 'asc'}
                    <ArrowUp class="h-3 w-3" />
                  {:else}
                    <ArrowDown class="h-3 w-3" />
                  {/if}
                {/if}
              </button>
            </th>
          {/each}
          <th
            class="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground bg-muted/40"
          >
            Modified
          </th>
        </tr>
      </thead>
      <tbody>
        {#each rows as entity, row (entity.id)}
          {@const cells = layoutRow(entity, columns)}
          <tr class="group/row hover:bg-muted/20">
            {#each columns as column, col (column.key)}
              {@const isActive = activeCell?.row === row && activeCell?.col === col}
              {@const isRowHeader = col === 1 && activeCell?.row === row}
              {@const isEditing = isActive && editing}
              {@const hasEditor = isEditing && column.key !== 'status'}
              {@const spillCount = hasEditor ? 0 : cells[col].spill}
              <td
                role="gridcell"
                tabindex={isActive || (!activeCell && row === 0 && col === 1) ? 0 : -1}
                data-cell="{row}-{col}"
                class={cn(
                  'group/cell h-9 border-b border-border p-0 align-middle focus:outline-none',
                  col === 0 ? 'w-10' : 'max-w-56',
                  col === 1 && 'min-w-48',
                  hasEditor || spillCount > 0 ? 'overflow-visible' : 'overflow-hidden',
                  col <= 1 ? 'sticky z-10 backdrop-blur-md' : 'relative',
                  col <= 1 &&
                    (isRowHeader ? 'bg-primary/10' : 'bg-background group-hover/row:bg-muted/20'),
                  isActive && !hasEditor && 'ring-2 ring-inset ring-primary'
                )}
                style={col === 0
                  ? 'left: 0'
                  : col === 1
                    ? 'left: var(--grid-col0, 4rem)'
                    : undefined}
                onclick={() => (activeCell = { row, col })}
                onfocus={() => {
                  if (!isActive) activeCell = { row, col };
                }}
                ondblclick={() => beginEdit(toEditString(getCellValue(entity, column.key)))}
              >
                <div
                  class={cn(
                    'flex h-full items-center gap-1 overflow-hidden whitespace-nowrap px-2',
                    (hasEditor || spillCount > 0) && 'absolute inset-y-0 left-0 w-max',
                    hasEditor && 'z-30 overflow-visible px-0'
                  )}
                  use:spill={{ count: spillCount, sticky: col <= 1 }}
                >
                  <EntityGridCell
                    {entity}
                    {column}
                    {canEdit}
                    editing={isEditing}
                    {editSeed}
                    covered={cells[col].covered}
                    refOptions={refEntities[column.entityType || ''] || []}
                    href={entityHref(entity)}
                    onCommit={(raw, move) => commitCell(row, col, raw, move)}
                    onCancel={() => {
                      editing = false;
                      focusActiveCell();
                    }}
                    onOpenPanel={() => openPanel(row, col)}
                  />
                </div>
              </td>
            {/each}
            <td
              class="border-b border-border px-2 py-1 text-xs text-muted-foreground whitespace-nowrap"
            >
              {formatDate(entity.modifiedAt)}
            </td>
          </tr>
        {/each}
        {#if canEdit && onAddRow}
          <tr>
            <td colspan={columns.length + 1} class="p-0">
              <div class="relative">
                <Plus
                  class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  bind:this={addInput}
                  bind:value={addName}
                  type="text"
                  autocomplete="off"
                  aria-label="Add row"
                  placeholder="Add a row: type a name and press Enter"
                  class="h-9 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:bg-muted/30"
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitAddRow();
                    } else if (e.key === 'ArrowUp' && rows.length > 0) {
                      e.preventDefault();
                      activeCell = { row: rows.length - 1, col: Math.min(1, columns.length - 1) };
                      focusActiveCell();
                    }
                  }}
                />
              </div>
              {#if addError}
                <p class="px-3 pb-1 text-xs text-destructive">{addError}</p>
              {/if}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  {/if}
</div>

{#if panelTarget && panelEntity}
  {#key panelTarget.entityId + ':' + panelTarget.colIndex}
    <EntityGridPanel
      entity={panelEntity}
      column={columns[panelTarget.colIndex]}
      entities={entities as { id: string; type: string; name: string; status?: string }[]}
      onSave={(raw) => {
        saveCell(panelTarget!.entityId, columns[panelTarget!.colIndex], raw);
        closePanel();
      }}
      onClose={closePanel}
    />
  {/key}
{/if}

{#if gridNotice && !gridError}
  <div
    class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg"
    role="status"
  >
    {gridNotice}
  </div>
{/if}

{#if gridError}
  <div
    class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-destructive/40 bg-card px-4 py-2 text-sm text-destructive shadow-lg"
  >
    {gridError}
  </div>
{/if}
