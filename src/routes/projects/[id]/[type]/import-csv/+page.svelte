<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { cellValue, splitList, type FieldValue } from '$lib/api/entities';
  import { csvUrl, importCsvRows, type CsvImportResult, type CsvRow } from '$lib/api/transfer';
  import { parseCSVWithHeaders } from '$lib/csv';
  import { ENTITY_PLURAL } from '$lib/entityFields';
  import type { EntityType } from '$lib/types';
  import { slugify } from '$lib/utils';
  import { ArrowLeft, Upload } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';
  import type { TargetField } from './+page';

  const FIELD_TYPE_OPTIONS = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Text (long)' },
    { value: 'number', label: 'Number' },
    { value: 'tags', label: 'Tags' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'markdown', label: 'Markdown' }
  ];
  const MAX_ROWS = 5000;

  let csvHeaders = $state<string[]>([]);
  let preview = $state<Record<string, string>[]>([]);
  let rows = $state<Record<string, string>[]>([]);
  let mapping = $state<Record<string, string>>({});
  let newFields = $state<Record<string, { label: string; type: string }>>({});
  let importResult = $state<CsvImportResult | null>(null);
  let uploading = $state(false);
  let error = $state<string | null>(null);

  let projectId = $derived(page.params.id ?? '');
  let route = $derived((page.data?.route as string) ?? '');
  let targetFields = $derived((page.data?.targetFields ?? []) as TargetField[]);
  // Only the owner can add fields (as on the settings page).
  let canAddFields = $derived(page.data?.role === 'owner');

  function buildAutoMapping(headers: string[], targetKeys: string[]) {
    const m: Record<string, string> = {};
    for (const h of headers) {
      const hLower = h.toLowerCase().trim();
      const match = targetKeys.find((k) => k.toLowerCase() === hLower);
      m[h] = match ?? '';
    }
    return m;
  }

  function reset() {
    csvHeaders = [];
    preview = [];
    rows = [];
    mapping = {};
    newFields = {};
    error = null;
  }

  function onMappingChange(header: string, value: string) {
    mapping = { ...mapping, [header]: value };
    if (value === '__new__' && !newFields[header]) {
      newFields = { ...newFields, [header]: { label: header, type: 'text' } };
    } else if (value !== '__new__') {
      const updated = { ...newFields };
      delete updated[header];
      newFields = updated;
    }
  }

  function message(cause: unknown) {
    return cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
  }

  async function readFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = null;
    uploading = true;
    try {
      const data = parseCSVWithHeaders(await file.text());
      if (data.length === 0) {
        error = 'The CSV file is empty or has no data rows.';
      } else if (data.length > MAX_ROWS) {
        error = `The CSV file has ${data.length} rows. Import at most ${MAX_ROWS} at a time.`;
      } else {
        csvHeaders = Object.keys(data[0]);
        preview = data.slice(0, 5);
        rows = data;
        mapping = buildAutoMapping(
          csvHeaders,
          targetFields.map((f) => f.key)
        );
      }
    } catch {
      error = 'Could not read that file.';
    } finally {
      uploading = false;
    }
  }

  /** Adds the fields the owner asked for; returns the final column-to-field mapping. */
  async function resolveNewFields(): Promise<Record<string, string>> {
    const resolved = { ...mapping };
    const known = new Set(targetFields.map((f) => f.key));
    for (const [header, def] of Object.entries(newFields)) {
      if (resolved[header] !== '__new__') continue;
      const label = def.label.trim();
      const key = slugify(label);
      if (!label || !key) {
        resolved[header] = '';
        continue;
      }
      if (!known.has(key)) {
        await api(`/api/projects/${projectId}/fields`, {
          method: 'POST',
          body: { entityType: page.data?.entityType, key, label, fieldType: def.type }
        });
        known.add(key);
      }
      resolved[header] = key;
    }
    return resolved;
  }

  /** One CSV row as the API takes it, with values typed by their fields. Several columns
   * mapped to one field are joined (tags are merged). */
  function toRow(row: Record<string, string>, resolved: Record<string, string>): CsvRow {
    const types = new Map(targetFields.map((f) => [f.key, f.type]));
    for (const [header, def] of Object.entries(newFields)) {
      if (resolved[header]) types.set(resolved[header], def.type as TargetField['type']);
    }
    const mapped: Record<string, string> = {};
    const tags: string[] = [];
    let hasTags = false;
    for (const [header, key] of Object.entries(resolved)) {
      if (!key || key === '__new__' || row[header] === undefined) continue;
      const value = row[header];
      if (key === 'tags') {
        hasTags = true;
        tags.push(...splitList(value));
      } else if (mapped[key] !== undefined) {
        mapped[key] = `${mapped[key]} ${value}`.trim();
      } else {
        mapped[key] = value;
      }
    }
    const { id, name, body, status, ...rest } = mapped;
    const fields: Record<string, FieldValue> = {};
    for (const [key, raw] of Object.entries(rest)) {
      const type = types.get(key);
      try {
        fields[key] = cellValue(type, type === 'boolean' ? raw.trim().toLowerCase() : raw);
      } catch {
        fields[key] = raw; // not a number: keep the text rather than lose it
      }
    }
    return {
      id: id?.trim() || undefined,
      name: name ?? '',
      body,
      tags: hasTags ? tags : undefined,
      status: status?.trim().toLowerCase() || undefined,
      fields
    };
  }

  async function runImport(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    uploading = true;
    try {
      const resolved = await resolveNewFields();
      importResult = await importCsvRows(
        projectId,
        route,
        rows.map((row) => toRow(row, resolved))
      );
    } catch (cause) {
      error = message(cause);
    } finally {
      uploading = false;
    }
  }
</script>

<svelte:head>
  <title
    >Import CSV — {page.data?.entityType
      ? ENTITY_PLURAL[page.data.entityType as EntityType]
      : 'Entities'} — {page.data?.projectName || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{projectId}/{route}"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.entityType
        ? ENTITY_PLURAL[page.data.entityType as EntityType]
        : 'Entities'}
    </a>
    <h1 class="text-2xl font-bold">Import CSV</h1>
    <p class="text-sm text-muted-foreground">
      Upload a CSV file to create or update {page.data?.entityType
        ? ENTITY_PLURAL[page.data.entityType as EntityType].toLowerCase()
        : 'entities'}. Rows are matched by ID first, then by name.
      <a class="underline" href={csvUrl(projectId, route)} download
        >Download the current {page.data?.entityType
          ? ENTITY_PLURAL[page.data.entityType as EntityType].toLowerCase()
          : 'entities'} as CSV</a
      > to use as a template.
    </p>
  </div>

  {#if error}<p role="alert" class="mb-4 text-sm text-destructive">{error}</p>{/if}

  {#if importResult}
    <div class="mb-6 rounded-lg border border-border bg-card p-6">
      <h2 class="mb-2 text-lg font-semibold">Import Complete</h2>
      <p class="text-sm text-muted-foreground">
        Created: {importResult.created} &middot; Updated: {importResult.updated}
      </p>
      {#if importResult.errors.length > 0}
        <div class="mt-4">
          <p class="mb-2 text-sm font-medium text-destructive">Errors:</p>
          <ul class="space-y-1">
            {#each importResult.errors as err}
              <li class="text-xs text-destructive">{err}</li>
            {/each}
          </ul>
        </div>
      {/if}
      <div class="mt-4 flex gap-2">
        <Button
          onclick={() => {
            importResult = null;
            reset();
          }}
        >
          Import Another File
        </Button>
        <Button variant="outline" onclick={() => goto(`/projects/${projectId}/${route}`)}>
          Back to List
        </Button>
      </div>
    </div>
  {:else if csvHeaders.length > 0}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 text-lg font-semibold">Map Columns</h2>
      <p class="mb-4 text-xs text-muted-foreground">
        Map CSV columns to entity fields.{canAddFields
          ? ' Choose "New field..." to create a new field from a column.'
          : ''} Leave blank to skip.
      </p>

      <form onsubmit={runImport} class="space-y-3">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="px-2 py-1 text-left text-xs text-muted-foreground font-medium"
                  >CSV Column</th
                >
                <th class="px-2 py-1 text-left text-xs text-muted-foreground font-medium"
                  >Map to Field</th
                >
                <th class="px-2 py-1 text-left text-xs text-muted-foreground font-medium"
                  >Preview</th
                >
              </tr>
            </thead>
            <tbody>
              {#each csvHeaders as header}
                <tr class="border-b border-border/50">
                  <td class="px-2 py-1.5 font-mono text-xs align-top pt-3">{header}</td>
                  <td class="px-2 py-1.5 align-top">
                    <Select
                      type="single"
                      value={mapping[header] || ''}
                      onValueChange={(v) => onMappingChange(header, v)}
                    >
                      <SelectTrigger class="w-full text-xs">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent class="text-xs">
                        <SelectItem value="">— Skip —</SelectItem>
                        {#if canAddFields}
                          <SelectItem value="__new__">— New field... —</SelectItem>
                        {/if}
                        {#each targetFields as field}
                          <SelectItem value={field.key}>{field.label}</SelectItem>
                        {/each}
                      </SelectContent>
                    </Select>
                    {#if mapping[header] === '__new__'}
                      <div class="mt-1.5 space-y-1">
                        <input
                          type="text"
                          class="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                          placeholder="Field label"
                          value={newFields[header]?.label ?? header}
                          oninput={(e) => {
                            newFields = {
                              ...newFields,
                              [header]: {
                                ...newFields[header],
                                label: (e.target as HTMLInputElement).value
                              }
                            };
                          }}
                        />
                        <Select
                          type="single"
                          value={newFields[header]?.type ?? 'text'}
                          onValueChange={(v) => {
                            newFields = {
                              ...newFields,
                              [header]: {
                                ...newFields[header],
                                type: v
                              }
                            };
                          }}
                        >
                          <SelectTrigger class="w-full text-xs">
                            <SelectValue placeholder="Text" />
                          </SelectTrigger>
                          <SelectContent class="text-xs">
                            {#each FIELD_TYPE_OPTIONS as opt}
                              <SelectItem value={opt.value}>{opt.label}</SelectItem>
                            {/each}
                          </SelectContent>
                        </Select>
                      </div>
                    {/if}
                  </td>
                  <td
                    class="px-2 py-1.5 text-xs text-muted-foreground align-top pt-3 max-w-[200px]"
                  >
                    <div class="space-y-0.5">
                      {#each preview.slice(0, 3) as row}
                        <div class="truncate">{row[header] || ''}</div>
                      {/each}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <p class="text-xs text-muted-foreground">
          Showing {preview.length} preview rows of {rows.length} total.
        </p>

        <div class="flex gap-2">
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Importing...' : 'Import Data'}
          </Button>
          <Button type="button" variant="outline" onclick={reset}>Cancel</Button>
        </div>
      </form>
    </div>

    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="mb-2 text-sm font-medium">Data Preview</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-border">
              {#each csvHeaders as header}
                <th class="px-2 py-1 text-left text-muted-foreground font-medium">{header}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each preview as row}
              <tr class="border-b border-border/50">
                {#each csvHeaders as header}
                  <td class="px-2 py-1 max-w-[150px] truncate">{row[header] || ''}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="rounded-lg border border-border bg-card p-6">
      <div class="space-y-4">
        {#if uploading}
          <div
            class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 gap-2"
          >
            <div
              class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
            ></div>
            <span class="text-sm text-muted-foreground">Reading...</span>
          </div>
        {:else}
          <label
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 hover:border-primary/50 transition-colors"
          >
            <Upload class="h-8 w-8 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Click to upload a CSV file</span>
            <span class="text-xs text-muted-foreground/60">.csv files only</span>
            <input type="file" name="file" accept=".csv" class="hidden" onchange={readFile} />
          </label>
        {/if}
      </div>
    </div>
  {/if}
</div>
