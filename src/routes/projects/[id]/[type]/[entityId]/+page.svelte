<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import { enhance, deserialize } from '$app/forms';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { ENTITY_LABELS, ENTITY_PLURAL, type FieldDef } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import type { Backlink, BacklinkReason, EntityType } from '$lib/types';
  import Editor from '$lib/components/Editor.svelte';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { RELATION_TYPES, relationLabel, relationTypeGroups } from '$lib/relationTypes';
  import { renderBodyHtml } from '$lib/utils/markdown';
  import Comments from '$lib/components/Comments.svelte';
  import BrainstormDeck from '$lib/components/BrainstormDeck.svelte';
  import {
    ArrowLeft,
    Trash2,
    Bookmark,
    BookmarkMinus,
    SwitchCamera,
    Link2,
    Unlink,
    ImagePlus,
    FileText,
    Copy,
    Share2,
    Plus,
    Check,
    CloudOff,
    Loader2
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Combobox } from '$lib/components/ui/combobox';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';

  const AUTOSAVE_DELAY = 1000;
  const RETRY_DELAY = 5000;

  const BACKLINK_LABELS: Record<BacklinkReason, string> = {
    mention: 'mention',
    field: 'field',
    participant: 'in scene',
    narrator: 'narrates',
    place: 'setting'
  };

  type Values = Record<string, string>;

  let role = $derived(page.data?.role || 'owner');
  let canEdit = $derived(role !== 'commenter');
  let backlinks = $derived((page.data?.backlinks || []) as Backlink[]);
  let fieldDefs = $derived((page.data?.customFields || []) as FieldDef[]);

  interface EntityRelation {
    id: string;
    outgoing: boolean;
    relationType: string;
    label: string | null;
    otherId: string;
    otherName: string;
    otherType: EntityType | null;
  }

  let relations = $derived((page.data?.relations || []) as EntityRelation[]);
  let addingRelation = $state(false);
  let relationTypeValue = $state<string>(RELATION_TYPES[0]);
  let relationTarget = $state<string[]>([]);
  let relationLabelText = $state('');
  let newTarget = $state<{ name: string; type: EntityType } | null>(null);
  let keepRelationFormOpen = false;

  let relationTargetType = $derived.by(() => {
    if (newTarget) return newTarget.type;
    const id = relationTarget[0];
    const all = (page.data?.entities || []) as Array<{ id: string; type: string }>;
    return all.find((e) => e.id === id)?.type ?? null;
  });
  let relationGroups = $derived(
    relationTypeGroups(page.data?.entityType || 'character', relationTargetType)
  );

  $effect(() => {
    const groups = relationGroups;
    untrack(() => {
      const all = [...groups.suggested, ...groups.other];
      if (!all.includes(relationTypeValue as (typeof all)[number])) {
        relationTypeValue = groups.suggested[0];
      } else if (
        !groups.suggested.includes(relationTypeValue as (typeof groups.suggested)[number]) &&
        (newTarget || relationTarget.length > 0)
      ) {
        relationTypeValue = groups.suggested[0];
      }
    });
  });

  /** Suggestions for an entityRef field, limited to the referenced type when one is set. */
  function refOptions(refType?: string): Array<{ id: string; name: string }> {
    const all = (page.data?.entities || []) as Array<{ id: string; name: string; type: string }>;
    return refType ? all.filter((e) => e.type === refType) : all;
  }

  function encodeField(field: FieldDef, raw: unknown): string {
    if (field.type === 'tags') {
      if (Array.isArray(raw)) return raw.join(', ');
      return typeof raw === 'string' ? raw : '';
    }
    if (field.type === 'boolean') {
      return raw === true || raw === 'on' || raw === 'true' ? 'true' : 'false';
    }
    return raw === null || raw === undefined ? '' : String(raw);
  }

  function hasValue(field: FieldDef, source: Values): boolean {
    const value = source[field.key];
    return field.type === 'boolean' ? value === 'true' : !!value?.trim();
  }

  function filledKeys(source: Values): Set<string> {
    return new Set(fieldDefs.filter((f) => f.required || hasValue(f, source)).map((f) => f.key));
  }

  function snapshot(): Values {
    const entity = page.data?.entity;
    const out: Values = {
      name: entity?.name || '',
      body: entity?.body || '',
      tags: (entity?.tags || []).join(', '),
      status: entity?.status || 'draft'
    };
    for (const field of fieldDefs) {
      out[field.key] = encodeField(field, entity?.frontmatter?.[field.key]);
    }
    return out;
  }

  let showConvert = $state(false);
  let convertStoryId = $state('');
  let convertChapterId = $state('');
  let selectedImageId = $state('');

  let values = $state<Values>(untrack(() => snapshot()));
  let synced = $state<Values>(untrack(() => snapshot()));
  let shown = $state<Set<string>>(untrack(() => filledKeys(snapshot())));
  let bodyEpoch = $state(0);
  let loadedId = '';
  let mounted = $state(false);

  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let saveError = $state('');
  let revision = $state('');
  let conflict = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  let dirty = $derived(Object.keys(values).some((key) => values[key] !== synced[key]));
  let hiddenFields = $derived(fieldDefs.filter((f) => !shown.has(f.key)));
  let visibleFields = $derived(fieldDefs.filter((f) => shown.has(f.key)));

  onMount(() => {
    mounted = true;
  });

  function revealFilled(source: Values) {
    shown = new Set([...shown, ...filledKeys(source)]);
  }

  // Server data replaces the sheet when a different entity loads. On a reload of the same
  // entity (a deck answer, say) only fields the user has not touched are taken from the
  // server, so edits made since the last save survive.
  $effect(() => {
    const entity = page.data?.entity;
    if (!entity) return;
    const incoming = snapshot();
    untrack(() => {
      if (entity.id !== loadedId) {
        loadedId = entity.id;
        revision = entity.revision ?? '';
        conflict = false;
        values = incoming;
        synced = incoming;
        shown = new Set();
        bodyEpoch++;
        saveStatus = 'idle';
        showConvert = false;
        addingRelation = false;
      } else {
        // Adopt the new revision unless the server changed a field the user is also editing.
        // Fields only the server changed are merged in below, and saves send only the fields
        // the user changed, so nothing is lost; a real overlap stays a conflict.
        const clash = Object.keys(values).some(
          (key) =>
            values[key] !== synced[key] &&
            incoming[key] !== synced[key] &&
            incoming[key] !== values[key]
        );
        if (!clash && !conflict) revision = entity.revision ?? revision;
        const next = { ...values };
        for (const key of Object.keys(incoming)) {
          if (values[key] === synced[key] && values[key] !== incoming[key]) {
            next[key] = incoming[key];
            if (key === 'body') bodyEpoch++;
          }
        }
        values = next;
        synced = incoming;
      }
      revealFilled(values);
    });
  });

  $effect(() => {
    if (!canEdit || !dirty) return;
    JSON.stringify(values);
    const status = saveStatus;
    if (status === 'saving' || conflict) return;
    timer = setTimeout(() => void save(), status === 'error' ? RETRY_DELAY : AUTOSAVE_DELAY);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  async function save(keepalive = false, overwrite = false): Promise<boolean> {
    if (!canEdit) return true;
    if (conflict && !overwrite) return false;
    if (saveStatus === 'saving') return false;
    if (timer) clearTimeout(timer);
    const payload = { ...values };
    if (!Object.keys(payload).some((key) => payload[key] !== synced[key])) return true;
    if (!payload.name.trim()) {
      saveStatus = 'error';
      saveError = 'Name cannot be empty';
      return false;
    }

    saveStatus = 'saving';
    saveError = '';
    try {
      const body = new URLSearchParams();
      body.set('revision', revision);
      if (overwrite) body.set('overwrite', 'true');
      for (const [key, value] of Object.entries(payload)) {
        const def = fieldDefs.find((f) => f.key === key);
        if (def?.type === 'boolean') {
          if (value !== synced[key]) body.set(key, value);
          continue;
        }
        if (value !== synced[key]) body.set(key, value);
      }
      const res = await fetch(`${page.url.pathname}?/update`, {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body,
        keepalive
      });
      const result = deserialize(await res.text());
      if (result.type !== 'success') {
        if (result.type === 'failure' && result.status === 409) conflict = true;
        throw new Error(
          result.type === 'failure'
            ? (result.data as { error?: string } | undefined)?.error || 'Save failed'
            : 'Save failed'
        );
      }
      revision = (result.data as { revision?: string })?.revision ?? revision;
      conflict = false;
      synced = payload;
      saveStatus = 'saved';
      return true;
    } catch (e) {
      saveStatus = 'error';
      saveError = e instanceof Error ? e.message : 'Save failed';
      return false;
    }
  }

  /**
   * Resolve a conflict by discarding local edits and loading the version on disk, in place.
   * A full page reload would trip the unsaved-changes guards below.
   */
  async function reloadLatest() {
    if (dirty && !window.confirm('Discard your unsaved edits and load the latest version?')) return;
    if (timer) clearTimeout(timer);
    loadedId = '';
    await invalidateAll();
  }

  beforeNavigate((nav) => {
    if (!canEdit || !dirty) return;
    if (nav.willUnload) {
      nav.cancel();
      void save(true);
      return;
    }
    nav.cancel();
    const target = nav.to?.url;
    void save().then((ok) => {
      if (ok && target) goto(target);
    });
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  }

  async function reveal(key: string) {
    shown = new Set([...shown, key]);
    await tick();
    document.getElementById(`field-${key}`)?.focus();
  }

  $effect(() => {
    if (convertStoryId) convertChapterId = '';
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title
    >{values.name || 'Entity'} — {page.data?.entityType
      ? ENTITY_LABELS[page.data.entityType as EntityType]
      : ''} — {page.data?.project?.name || 'Project'} — DreamForge</title
  >
</svelte:head>

{#snippet fieldControl(field: FieldDef)}
  {@const id = `field-${field.key}`}
  {#if field.type === 'textarea' || field.type === 'markdown'}
    <Textarea
      {id}
      disabled={!canEdit}
      placeholder={field.placeholder || ''}
      bind:value={values[field.key]}
    />
  {:else if field.type === 'tags'}
    <Input
      {id}
      type="text"
      disabled={!canEdit}
      bind:value={values[field.key]}
      placeholder="tag1, tag2, tag3"
    />
  {:else if field.type === 'boolean'}
    <input
      {id}
      type="checkbox"
      disabled={!canEdit}
      checked={values[field.key] === 'true'}
      onchange={(e) => (values[field.key] = e.currentTarget.checked ? 'true' : 'false')}
      class="rounded border-input"
    />
  {:else if field.type === 'date'}
    <Input {id} type="date" disabled={!canEdit} bind:value={values[field.key]} />
  {:else if field.type === 'entityRef'}
    <Input
      {id}
      type="text"
      list="ref-{field.key}"
      disabled={!canEdit}
      bind:value={values[field.key]}
      placeholder={field.placeholder ||
        `Search ${ENTITY_PLURAL[field.entityType as EntityType]?.toLowerCase() || 'entities'}…`}
    />
    <datalist id="ref-{field.key}">
      {#each refOptions(field.entityType) as option (option.id)}
        <option value={option.name}></option>
      {/each}
    </datalist>
  {:else}
    <Input
      {id}
      type={field.type === 'number' ? 'number' : 'text'}
      disabled={!canEdit}
      bind:value={values[field.key]}
      placeholder={field.placeholder || ''}
    />
  {/if}
{/snippet}

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}/{entityTypeToRoute(page.data?.entityType || 'character')}"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.entityType ? ENTITY_PLURAL[page.data.entityType as EntityType] : ''}
    </a>

    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {#if canEdit}
        <input
          type="text"
          bind:value={values.name}
          aria-label="Name"
          class="w-full border-b border-transparent bg-transparent text-2xl font-bold outline-none hover:border-border focus:border-primary/50"
          placeholder="Name"
        />
      {:else}
        <h1 class="text-2xl font-bold">{values.name || 'Entity'}</h1>
      {/if}
      <div class="flex shrink-0 items-center gap-2">
        {#if canEdit}
          <span
            class="flex items-center gap-1 whitespace-nowrap text-xs"
            class:text-destructive={saveStatus === 'error'}
            class:text-muted-foreground={saveStatus !== 'error'}
            aria-live="polite"
          >
            {#if saveStatus === 'error'}
              <CloudOff class="h-3 w-3" />
              {saveError}
              {#if conflict}
                <button type="button" onclick={() => void reloadLatest()}>Reload latest</button>
                <button
                  type="button"
                  onclick={() => {
                    if (window.confirm('Overwrite the changes made elsewhere?'))
                      void save(false, true);
                  }}>Overwrite with my edits</button
                >
              {/if}
            {:else if saveStatus === 'saving'}
              <Loader2 class="h-3 w-3 animate-spin" />
              Saving…
            {:else if dirty}
              Unsaved changes
            {:else if saveStatus === 'saved'}
              <Check class="h-3 w-3" />
              Saved
            {/if}
          </span>
        {/if}
        {#if canEdit && page.data?.entityType === 'note'}
          <Button variant="outline" onclick={() => (showConvert = !showConvert)}>
            <SwitchCamera class="h-4 w-4" />
            Convert to Scene
          </Button>
        {/if}
        <form method="POST" action="?/toggleBookmark" use:enhance>
          <Button type="submit" variant="outline">
            {#if page.data?.bookmarked}
              <BookmarkMinus class="h-4 w-4" />
              Unbookmark
            {:else}
              <Bookmark class="h-4 w-4" />
              Bookmark
            {/if}
          </Button>
        </form>
        {#if canEdit}
          <form
            method="POST"
            action="?/duplicate"
            use:enhance={async () => {
              await save();
            }}
          >
            <Button type="submit" variant="outline" title="Duplicate this entity">
              <Copy class="h-4 w-4" />
              Duplicate
            </Button>
          </form>
        {/if}
      </div>
    </div>
  </div>

  <div class="space-y-6">
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div class="flex items-center gap-2">
          <label for="status-select" class="text-sm font-medium">Status:</label>
          <Select type="single" bind:value={values.status} disabled={!canEdit}>
            <SelectTrigger id="status-select" class="rounded px-2 py-1 text-sm">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="wip">In Progress</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-1 items-center gap-2">
          <label for="tags-input" class="text-sm font-medium">Tags:</label>
          <input
            id="tags-input"
            type="text"
            bind:value={values.tags}
            disabled={!canEdit}
            class="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
            placeholder="tag1, tag2, tag3"
          />
        </div>
      </div>
    </div>

    {#if canEdit && page.data?.entityType}
      <BrainstormDeck
        type={page.data.entityType as EntityType}
        answeredIds={(page.data.entity?.frontmatter?.answeredPrompts as string[]) || []}
        startOpen={!page.data.entity?.body?.trim() &&
          !(page.data.entity?.frontmatter?.answeredPrompts as string[] | undefined)?.length}
        beforeSubmit={() => save()}
      />
    {/if}

    {#if visibleFields.length > 0 || (canEdit && hiddenFields.length > 0)}
      <div class="rounded-lg border border-border bg-card p-4">
        {#if visibleFields.length > 0}
          <div class="space-y-4">
            {#each visibleFields as field (field.key)}
              <div>
                <Label for="field-{field.key}" class="mb-1">
                  {field.label}
                  {#if field.required}<span class="text-destructive">*</span>{/if}
                </Label>
                {@render fieldControl(field)}
              </div>
            {/each}
          </div>
        {/if}

        {#if canEdit && hiddenFields.length > 0}
          <div
            class="flex flex-wrap items-center gap-1.5"
            class:mt-4={visibleFields.length > 0}
            class:border-t={visibleFields.length > 0}
            class:border-border={visibleFields.length > 0}
            class:pt-3={visibleFields.length > 0}
          >
            <span class="text-xs text-muted-foreground">Add detail:</span>
            {#each hiddenFields as field (field.key)}
              <Button type="button" size="xs" variant="outline" onclick={() => reveal(field.key)}>
                <Plus class="h-3 w-3" />
                {field.label}
              </Button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="rounded-lg border border-border bg-card p-4">
      <Label for="body" class="mb-2">
        {page.data?.entityType === 'note' ? 'Content' : 'Notes'}
      </Label>
      {#if canEdit && mounted}
        {#key bodyEpoch}
          <Editor
            content={untrack(() => values.body)}
            placeholder={page.data?.entityType === 'note'
              ? 'Start writing...'
              : 'Anything that does not fit a field: scenes, ideas, references…'}
            entities={page.data?.entities || []}
            images={page.data?.projectImages || []}
            projectId={page.params.id || ''}
            onUpdate={(md) => (values.body = md)}
          />
        {/key}
      {:else}
        <div class="prose prose-sm dark:prose-invert mt-4 max-w-none">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized in renderBodyHtml -->
          {@html renderBodyHtml(values.body, page.params.id || '')}
        </div>
      {/if}
    </div>

    <div class="rounded-lg border border-border bg-card p-4">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-medium">Images</h2>
        {#if canEdit}
          <a
            href="/projects/{page.params.id}/images"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ImagePlus class="h-3 w-3" />
            Gallery
          </a>
        {/if}
      </div>
      {#if (page.data?.entityImages || []).length === 0}
        <p class="py-2 text-xs text-muted-foreground">No images linked to this entity.</p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each page.data.entityImages as img (img.id)}
            <div class="group relative">
              <a href="/projects/{page.params.id}/images/{img.id}" class="block">
                <img
                  src={img.url}
                  alt={img.altText || img.originalName}
                  class="h-20 w-20 rounded-lg border border-border object-cover"
                />
              </a>
              {#if canEdit}
                <Button
                  variant="destructive"
                  size="icon-xs"
                  class="absolute -right-1.5 -top-1.5 rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onclick={() =>
                    fetch(`${page.url.pathname}?/unlinkImage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: new URLSearchParams({ imageId: img.id })
                    }).then(() => invalidateAll())}
                  aria-label="Unlink image"
                >
                  <Unlink class="h-3 w-3" />
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      {#if canEdit}
        <div class="mt-3 flex gap-2">
          <Combobox
            bind:value={selectedImageId}
            options={(page.data?.projectImages || [])
              .filter(
                (img: any) => !(page.data?.entityImages || []).some((ei: any) => ei.id === img.id)
              )
              .map((img: any) => ({
                value: img.id,
                label: img.originalName
              }))}
            placeholder="Select an image..."
            class="flex-1"
          />
          <Button
            size="sm"
            onclick={() => {
              if (!selectedImageId) return;
              fetch(`${page.url.pathname}?/linkImage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ imageId: selectedImageId })
              }).then(() => {
                selectedImageId = '';
                return invalidateAll();
              });
            }}
          >
            <Link2 class="h-3 w-3" />
            Link
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <div class="mt-6 rounded-lg border border-border bg-card p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <Share2 class="h-4 w-4" />
        Relationships
        {#if relations.length > 0}
          <span class="text-xs text-muted-foreground">({relations.length})</span>
        {/if}
      </h2>
      {#if canEdit}
        <Button variant="outline" size="xs" onclick={() => (addingRelation = !addingRelation)}>
          <Plus class="h-3 w-3" />
          Add
        </Button>
      {/if}
    </div>

    {#if addingRelation}
      <form
        method="POST"
        action="?/addRelation"
        class="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
        use:enhance={({ submitter }) => {
          keepRelationFormOpen = submitter?.getAttribute('name') === 'another';
          return async ({ result, update }) => {
            if (result.type === 'success') {
              addingRelation = keepRelationFormOpen;
              relationTarget = [];
              newTarget = null;
              relationLabelText = '';
            }
            await update({ reset: false });
          };
        }}
      >
        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">Who</span>
          {#if newTarget}
            <span
              class="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-secondary px-3 text-sm"
            >
              {newTarget.name}
              <span class="text-xs text-muted-foreground">
                (new {ENTITY_LABELS[newTarget.type].toLowerCase()})
              </span>
              <button
                type="button"
                class="text-muted-foreground hover:text-destructive"
                aria-label="Remove {newTarget.name}"
                onclick={() => (newTarget = null)}
              >
                &times;
              </button>
            </span>
          {:else}
            <EntityPicker
              entities={page.data?.entities || []}
              bind:value={relationTarget}
              multiple={false}
              createTypes={['character', 'organization', 'location']}
              onCreate={(name, type) => {
                newTarget = { name, type };
                relationTarget = [];
              }}
              placeholder="Choose or create…"
              searchPlaceholder="Search, or type a new name…"
            />
          {/if}
          <input type="hidden" name="targetId" value={relationTarget[0] || ''} />
          {#if newTarget}
            <input type="hidden" name="newName" value={newTarget.name} />
            <input type="hidden" name="newType" value={newTarget.type} />
          {/if}
        </div>

        <div class="space-y-1">
          <Label class="text-xs text-muted-foreground">Relation</Label>
          <select
            name="relationType"
            bind:value={relationTypeValue}
            class="h-8 rounded border border-input bg-background px-2 text-sm"
          >
            {#each relationGroups.suggested as type (type)}
              <option value={type}>{relationLabel(type)}</option>
            {/each}
            <optgroup label="Other">
              {#each relationGroups.other as type (type)}
                <option value={type}>{relationLabel(type)}</option>
              {/each}
            </optgroup>
          </select>
        </div>

        <div class="space-y-1">
          <Label for="relation-label" class="text-xs text-muted-foreground">Note (optional)</Label>
          <Input
            id="relation-label"
            name="label"
            bind:value={relationLabelText}
            class="h-8 w-48"
            placeholder="e.g. estranged"
          />
        </div>

        <Button type="submit" size="sm" disabled={relationTarget.length === 0 && !newTarget}>
          Save
        </Button>
        <Button
          type="submit"
          name="another"
          value="1"
          size="sm"
          variant="outline"
          disabled={relationTarget.length === 0 && !newTarget}
        >
          Save &amp; add another
        </Button>
        <Button type="button" size="sm" variant="ghost" onclick={() => (addingRelation = false)}>
          Cancel
        </Button>
      </form>
    {/if}

    {#if relations.length === 0}
      <p class="text-sm text-muted-foreground">
        No relationships yet. Connect this entity to others to build out the web around it.
      </p>
    {:else}
      <div class="space-y-1">
        {#each relations as relation (relation.id)}
          <div class="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <span class="text-muted-foreground">
              {relation.outgoing
                ? relationLabel(relation.relationType)
                : `is ${relationLabel(relation.relationType)} of`}
            </span>
            <a
              class="font-medium hover:underline"
              href="/projects/{page.params.id}/{entityTypeToRoute(
                relation.otherType || 'character'
              )}/{relation.otherId}"
            >
              {relation.otherName}
            </a>
            {#if relation.label}
              <span class="text-xs text-muted-foreground">— {relation.label}</span>
            {/if}
            {#if canEdit}
              <form method="POST" action="?/deleteRelation" class="ml-auto" use:enhance>
                <input type="hidden" name="relationId" value={relation.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-xs"
                  class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Remove relationship"
                >
                  <Trash2 class="h-3 w-3 text-destructive" />
                </Button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if backlinks.length > 0}
    <div class="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-3 flex items-center gap-2 text-sm font-medium">
        <Link2 class="h-4 w-4" />
        Referenced By
        <span class="text-xs text-muted-foreground">({backlinks.length})</span>
      </h2>
      <div class="space-y-1">
        {#each backlinks as link (link.kind + link.id + link.reason)}
          <a
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            href={link.href}
          >
            {#if link.kind === 'scene'}
              <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {:else}
              <Link2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {/if}
            <span class="truncate">{link.name}</span>
            <span class="truncate text-xs text-muted-foreground">{link.context}</span>
            <span class="ml-auto shrink-0 text-xs text-muted-foreground">
              {BACKLINK_LABELS[link.reason]}
            </span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <Comments
    projectId={page.params.id || ''}
    targetType="entity"
    targetId={page.params.entityId || ''}
    currentUserId={page.data?.currentUserId || ''}
    projectOwnerId={page.data?.projectOwnerId || ''}
    {role}
  />

  {#if showConvert && page.data?.entityType === 'note'}
    <div class="mt-4 rounded-lg border border-border bg-card p-4">
      <h3 class="mb-3 text-sm font-medium">Convert Note to Scene</h3>
      <form method="POST" action="?/convertToScene" use:enhance class="space-y-3">
        <div class="space-y-1">
          <Label for="convertStory" class="text-xs text-muted-foreground">Story</Label>
          <Combobox
            name="storyId"
            bind:value={convertStoryId}
            options={(page.data?.stories || []).map((s: any) => ({ value: s.id, label: s.title }))}
            placeholder="Select a story..."
          />
        </div>
        <div class="space-y-1">
          <Label for="convertChapter" class="text-xs text-muted-foreground"
            >Chapter (optional)</Label
          >
          <Combobox
            name="chapterId"
            bind:value={convertChapterId}
            options={[
              { value: '', label: 'New chapter...' },
              ...(
                (page.data?.stories || []).find((s: any) => s.id === convertStoryId)?.chapters || []
              ).map((ch: any) => ({ value: ch.id, label: ch.title }))
            ]}
            placeholder="New chapter..."
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button type="submit">Convert</Button>
          <Button type="button" variant="outline" onclick={() => (showConvert = false)}
            >Cancel</Button
          >
        </div>
      </form>
    </div>
  {/if}

  {#if canEdit}
    <div class="mt-6 flex items-center justify-between gap-4 border-t border-border pt-4">
      <p class="text-xs text-muted-foreground">
        Created: {page.data?.entity?.createdAt
          ? new Date(page.data.entity.createdAt).toLocaleString()
          : ''}
        &middot; Modified: {page.data?.entity?.modifiedAt
          ? new Date(page.data.entity.modifiedAt).toLocaleString()
          : ''}
      </p>
      <form
        method="POST"
        action="?/delete"
        use:enhance={() => {
          return async ({ result }) => {
            if (result.type === 'success') {
              const type = page.data?.entityType;
              if (type) {
                synced = { ...values };
                goto(`/projects/${page.params.id}/${entityTypeToRoute(type)}`);
              }
            }
          };
        }}
      >
        <Button type="submit" variant="ghost" size="sm" class="text-destructive">
          <Trash2 class="h-4 w-4" />
          Delete
        </Button>
      </form>
    </div>
  {:else}
    <div class="mt-4 rounded-lg border border-border bg-card p-4">
      <p class="text-xs text-muted-foreground">
        Created: {page.data?.entity?.createdAt
          ? new Date(page.data.entity.createdAt).toLocaleString()
          : ''}
        &middot; Modified: {page.data?.entity?.modifiedAt
          ? new Date(page.data.entity.modifiedAt).toLocaleString()
          : ''}
      </p>
    </div>
  {/if}
</div>
