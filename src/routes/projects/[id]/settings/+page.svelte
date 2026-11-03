<script lang="ts">
  import { page } from '$app/state';
  import { enhance } from '$app/forms'; // only on sections not yet ported (disabled)
  import { goto } from '$app/navigation';
  import { api, apiForm, ApiError } from '$lib/api';
  import NotPorted from '$lib/components/NotPorted.svelte';
  import { ENTITY_LABELS } from '$lib/entityFields';
  import {
    ArrowLeft,
    Plus,
    Trash2,
    Settings,
    Users,
    UserPlus,
    TriangleAlert,
    Target,
    Archive,
    RefreshCw,
    Link2
  } from '@lucide/svelte';
  import { invalidateAll } from '$app/navigation';
  import type { EntityType } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';

  let selectedType = $state<EntityType>('character');
  let dailyGoal = $state(page.data?.dailyGoal ?? 500);
  let goalSaved = $state(false);
  let newKey = $state('');
  let newLabel = $state('');
  let newFieldType = $state('text');
  let newRefEntityType = $state('');
  let newPlaceholder = $state('');
  let newRequired = $state(false);

  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'number', label: 'Number' },
    { value: 'tags', label: 'Tags' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'entityRef', label: 'Entity Reference' },
    { value: 'boolean', label: 'Boolean (checkbox)' },
    { value: 'date', label: 'Date' }
  ];

  const entityTypes: EntityType[] = [
    'character',
    'organization',
    'location',
    'culture',
    'species',
    'item',
    'note'
  ];

  function resetForm() {
    newKey = '';
    newLabel = '';
    newFieldType = 'text';
    newRefEntityType = '';
    newPlaceholder = '';
    newRequired = false;
  }

  function deriveKey(e: Event) {
    const input = e.target as HTMLInputElement;
    newKey = input.value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  let typeFields = $derived(
    (page.data?.customFields || []).filter((f: any) => f.entityType === selectedType)
  );

  let fieldError = $state<string | null>(null);

  let reindexing = $state(false);
  let reindexMessage = $state('');

  async function reindex() {
    reindexing = true;
    reindexMessage = '';
    try {
      await api(`/api/projects/${page.params.id}/sync`, { method: 'POST' });
      reindexMessage = 'Index rebuilt from disk.';
      await invalidateAll();
    } catch {
      reindexMessage = 'Re-index failed.';
    } finally {
      reindexing = false;
    }
  }

  async function deleteField(fieldId: string) {
    try {
      await api(`/api/projects/${page.params.id}/fields/${encodeURIComponent(fieldId)}`, {
        method: 'DELETE'
      });
      fieldError = null;
      await invalidateAll();
    } catch (cause) {
      fieldError = cause instanceof ApiError ? cause.message : 'Could not delete the field';
    }
  }
  let addMemberQuery = $state('');
  let addMemberRole = $state<'editor' | 'commenter'>('editor');
  let memberError = $state<string | null>(null);
  let isOwner = $derived(page.data?.role === 'owner');

  let projectName = $state(page.data?.project?.name || '');
  let projectDescription = $state(page.data?.project?.description || '');
  let detailsError = $state<string | null>(null);
  let detailsSaved = $state(false);

  let deleteConfirmName = $state('');
  let deleteError = $state<string | null>(null);

  let inviteError = $state<string | null>(null);

  async function call(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown = {}) {
    memberError = null;
    try {
      await api(path, { method, body });
      await invalidateAll();
    } catch (cause) {
      memberError = cause instanceof ApiError ? cause.message : 'Could not reach the server.';
    }
  }
</script>

<svelte:head>
  <title>Settings — {page.data?.project?.name || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.project?.name || 'Project'}
    </a>
    <h1 class="text-2xl font-bold">Project Settings</h1>
    <p class="text-sm text-muted-foreground">
      Customize entity fields for {page.data?.project?.name || 'this project'}
    </p>
  </div>

  {#if isOwner}
    <div class="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Settings class="h-4 w-4" />
        Project Details
      </h2>
      <form
        use:apiForm={{
          path: `/api/projects/${page.params.id}`,
          method: 'PATCH',
          onresult: async (result) => {
            if (result.ok) {
              detailsError = null;
              detailsSaved = true;
              setTimeout(() => (detailsSaved = false), 2000);
              await invalidateAll();
            } else detailsError = result.error;
          }
        }}
        class="space-y-3"
      >
        <div class="space-y-1">
          <Label for="project-name" class="text-xs text-muted-foreground">Name</Label>
          <Input id="project-name" name="name" type="text" required bind:value={projectName} />
        </div>
        <div class="space-y-1">
          <Label for="project-description" class="text-xs text-muted-foreground">Description</Label>
          <Input
            id="project-description"
            name="description"
            type="text"
            bind:value={projectDescription}
            placeholder="Optional description"
          />
        </div>
        {#if detailsError}
          <p class="text-sm text-destructive">{detailsError}</p>
        {/if}
        <Button type="submit">{detailsSaved ? 'Saved' : 'Save'}</Button>
      </form>
    </div>
  {/if}

  <div class="mb-8 rounded-lg border border-border bg-card p-4">
    <h2 class="mb-1 flex items-center gap-2 text-lg font-semibold">
      <Target class="h-4 w-4" />
      Writing Goal
    </h2>
    <p class="mb-4 text-sm text-muted-foreground">
      Words per day to aim for. Progress toward it shows on the dashboard.
    </p>
    <NotPorted />
    <fieldset disabled>
      <form
        method="POST"
        action="?/updateDailyGoal"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'success') {
              goalSaved = true;
              setTimeout(() => (goalSaved = false), 2000);
            }
            await update();
          };
        }}
        class="flex items-end gap-2"
      >
        <div class="space-y-1">
          <Label for="daily-goal" class="text-xs text-muted-foreground">Daily word goal</Label>
          <Input
            id="daily-goal"
            name="dailyGoal"
            type="number"
            min="0"
            step="50"
            class="w-40"
            bind:value={dailyGoal}
          />
        </div>
        <Button type="submit">{goalSaved ? 'Saved' : 'Save'}</Button>
      </form>
    </fieldset>
  </div>

  <!-- Only the owner manages fields; the API refuses everyone else too. -->
  <fieldset disabled={!isOwner}>
    <div class="mb-6">
      <Label class="mb-2">Entity Type</Label>
      <div class="flex flex-wrap gap-2">
        {#each entityTypes as et}
          <Button
            variant={selectedType === et ? 'default' : 'outline'}
            size="sm"
            onclick={() => (selectedType = et)}
          >
            {ENTITY_LABELS[et]}
          </Button>
        {/each}
      </div>
    </div>

    <div class="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Settings class="h-4 w-4" />
        Custom Fields — {ENTITY_LABELS[selectedType]}
      </h2>

      {#if typeFields.length === 0}
        <p class="mb-4 text-sm text-muted-foreground">
          No custom fields defined for this entity type.
        </p>
      {:else}
        <div class="mb-4 space-y-2">
          {#each typeFields as field}
            <div class="flex items-center justify-between rounded border border-border px-3 py-2">
              <div class="flex-1">
                <span class="font-medium">{field.label}</span>
                <span class="ml-2 text-xs text-muted-foreground">
                  ({field.key} — {field.fieldType}{#if field.required}, required{/if})
                </span>
                {#if field.placeholder}
                  <span class="ml-2 text-xs text-muted-foreground"
                    >placeholder: "{field.placeholder}"</span
                  >
                {/if}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-destructive hover:text-destructive"
                aria-label="Delete field"
                onclick={() => deleteField(field.id)}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="border-t border-border pt-4">
        <h3 class="mb-3 text-sm font-medium">Add New Field</h3>
        <form
          use:apiForm={{
            path: `/api/projects/${page.params.id}/fields`,
            body: () => ({
              entityType: selectedType,
              key: newKey,
              label: newLabel,
              fieldType: newFieldType,
              refEntityType:
                newFieldType === 'entityRef' && newRefEntityType ? newRefEntityType : null,
              placeholder: newPlaceholder,
              required: newRequired
            }),
            onresult: async (result) => {
              if (result.ok) {
                fieldError = null;
                resetForm();
                await invalidateAll();
              } else fieldError = result.error;
            }
          }}
          class="space-y-3"
        >
          <input type="hidden" name="entityType" value={selectedType} />

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label for="field-label" class="text-xs text-muted-foreground">Label</Label>
              <Input
                id="field-label"
                name="label"
                type="text"
                required
                bind:value={newLabel}
                oninput={deriveKey}
                placeholder="e.g. Age"
              />
            </div>
            <div class="space-y-1">
              <Label for="field-key" class="text-xs text-muted-foreground">Key</Label>
              <Input
                id="field-key"
                name="key"
                type="text"
                required
                bind:value={newKey}
                class="font-mono"
                placeholder="e.g. age"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label for="field-type" class="text-xs text-muted-foreground">Field Type</Label>
              <Select type="single" bind:value={newFieldType}>
                <SelectTrigger id="field-type" class="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {#each fieldTypes as ft}
                    <SelectItem value={ft.value}>{ft.label}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
              <input type="hidden" name="fieldType" value={newFieldType} />
            </div>
            <div class="space-y-1">
              <Label for="field-placeholder" class="text-xs text-muted-foreground"
                >Placeholder</Label
              >
              <Input
                id="field-placeholder"
                name="placeholder"
                type="text"
                bind:value={newPlaceholder}
                placeholder="Optional placeholder"
              />
            </div>
          </div>

          {#if newFieldType === 'entityRef'}
            <div class="space-y-1">
              <Label for="ref-entity-type" class="text-xs text-muted-foreground"
                >Referenced Entity Type</Label
              >
              <Select type="single" bind:value={newRefEntityType}>
                <SelectTrigger id="ref-entity-type" class="w-full">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select type...</SelectItem>
                  {#each entityTypes as et}
                    <SelectItem value={et}>{ENTITY_LABELS[et]}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
              <input type="hidden" name="refEntityType" value={newRefEntityType} />
            </div>
          {/if}

          <div class="flex items-center gap-2">
            <input
              id="field-required"
              type="checkbox"
              name="required"
              value="true"
              bind:checked={newRequired}
              class="rounded border-input"
            />
            <Label for="field-required">Required</Label>
          </div>

          {#if fieldError}
            <p class="text-sm text-destructive">{fieldError}</p>
          {/if}

          <Button type="submit">
            <Plus class="h-4 w-4" />
            Add Field
          </Button>
        </form>
      </div>
    </div>
  </fieldset>

  {#if isOwner}
    <div class="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Users class="h-4 w-4" />
        Members
      </h2>

      {#if (page.data?.members || []).length === 0}
        <p class="mb-4 text-sm text-muted-foreground">
          No members added yet. Only you have access.
        </p>
      {:else}
        <div class="mb-4 space-y-2">
          {#each page.data.members as member}
            <div class="flex items-center justify-between rounded border border-border px-3 py-2">
              <div class="flex items-center gap-3">
                <div>
                  <span class="font-medium text-sm">{member.username}</span>
                  <span class="ml-2 text-xs text-muted-foreground">{member.email}</span>
                </div>
                <Select
                  type="single"
                  value={member.role}
                  onValueChange={(role) =>
                    call(`/api/projects/${page.params.id}/members/${member.userId}`, 'PATCH', {
                      role
                    })}
                >
                  <SelectTrigger
                    class="text-xs px-2 py-0.5"
                    aria-label="Role for {member.username}"
                  >
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="commenter">Commenter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove {member.username}"
                onclick={() =>
                  call(`/api/projects/${page.params.id}/members/${member.userId}`, 'DELETE')}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="border-t border-border pt-4">
        <h3 class="mb-3 text-sm font-medium">Add Member</h3>
        <form
          use:apiForm={{
            path: `/api/projects/${page.params.id}/members`,
            onresult: async (result) => {
              memberError = result.ok ? null : result.error;
              if (result.ok) {
                addMemberQuery = '';
                await invalidateAll();
              }
            }
          }}
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div class="flex-1 space-y-1">
            <Label for="member-query" class="text-xs text-muted-foreground">Email or username</Label
            >
            <Input
              id="member-query"
              name="query"
              type="text"
              required
              bind:value={addMemberQuery}
              placeholder="user@example.com or username"
            />
          </div>
          <div class="space-y-1">
            <Label for="member-role" class="text-xs text-muted-foreground">Role</Label>
            <Select type="single" bind:value={addMemberRole}>
              <SelectTrigger id="member-role" class="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="commenter">Commenter</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="role" value={addMemberRole} />
          </div>
          <Button type="submit">
            <UserPlus class="h-4 w-4" />
            Add
          </Button>
        </form>
        {#if memberError}
          <p class="mt-2 text-sm text-destructive">{memberError}</p>
        {/if}
        <p class="mt-2 text-xs text-muted-foreground">
          Editors can view and edit content. Commenters can view and leave comments.
        </p>
      </div>

      <div class="mt-6 border-t border-border pt-4">
        <h3 class="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Link2 class="h-4 w-4" />
          Invite links
        </h3>
        <p class="mb-3 text-xs text-muted-foreground">
          Anyone with a link can join for 7 days, even if registration is closed. Revoke a link to
          stop it working.
        </p>
        <form
          use:apiForm={{
            path: `/api/projects/${page.params.id}/invites`,
            onresult: async (result) => {
              inviteError = result.ok ? null : result.error;
              if (result.ok) await invalidateAll();
            }
          }}
          class="flex flex-wrap items-end gap-2"
        >
          <label class="space-y-1 text-xs text-muted-foreground">
            <span class="block">Role</span>
            <select
              name="role"
              class="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
            </select>
          </label>
          <Button type="submit" variant="outline">Create invite link</Button>
        </form>
        {#if (page.data?.invites ?? []).length > 0}
          <ul class="mt-3 space-y-2">
            {#each page.data.invites as invite (invite.token)}
              {@const url = `${page.url.origin}/invite/${invite.token}`}
              <li
                class="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span class="rounded bg-secondary px-1.5 py-0.5 text-xs capitalize"
                  >{invite.role}</span
                >
                <input
                  readonly
                  value={url}
                  aria-label="Invite link for {invite.role}s"
                  class="min-w-0 flex-1 rounded border-0 bg-transparent font-mono text-xs"
                  onfocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <span class="text-xs text-muted-foreground"
                  >expires {new Date(invite.expiresAt).toLocaleDateString()}</span
                >
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onclick={() => navigator.clipboard?.writeText(url)}>Copy</Button
                >
                <Button
                  variant="ghost"
                  size="xs"
                  class="text-destructive"
                  onclick={() =>
                    call(`/api/projects/${page.params.id}/invites/${invite.token}`, 'DELETE')}
                  >Revoke</Button
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if inviteError}<p class="mt-2 text-sm text-destructive">{inviteError}</p>{/if}
      </div>
    </div>

    <div class="mb-8 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Archive class="h-4 w-4" />
        Backups
      </h2>
      <NotPorted />
      <fieldset disabled class="flex flex-wrap items-center gap-3">
        <form method="POST" action="?/backup" use:enhance>
          <Button type="submit">Back up now</Button>
        </form>
        <form method="POST" action="?/backupSettings" use:enhance class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm"
            ><input type="checkbox" name="enabled" checked={page.data?.backupEnabled} /> Automatic backups</label
          >
          <Button type="submit" variant="outline">Save backup settings</Button>
        </form>
      </fieldset>
      <ul class="mt-3 space-y-1 text-sm">
        {#each page.data?.backups ?? [] as backup (backup.name)}
          <li>
            <a class="underline" href={`/projects/${page.params.id}/backups/${backup.name}`}
              >{backup.createdAt}</a
            >
            <span class="text-muted-foreground">({Math.round(backup.size / 1024)} KB)</span>
          </li>
        {:else}<li class="text-muted-foreground">No backups yet.</li>{/each}
      </ul>
    </div>

    <div class="rounded-lg border border-destructive/50 bg-card p-4">
      <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold text-destructive">
        <TriangleAlert class="h-4 w-4" />
        Danger Zone
      </h2>
      <p class="mb-4 text-sm text-muted-foreground">
        Deleting a project permanently removes all its entities, stories, images, and settings. This
        cannot be undone.
      </p>
      <form
        use:apiForm={{
          path: `/api/projects/${page.params.id}`,
          method: 'DELETE',
          onresult: async (result) => {
            deleteError = result.ok ? null : result.error;
            if (result.ok) await goto('/projects', { invalidateAll: true });
          }
        }}
        class="space-y-3"
      >
        <div class="space-y-1">
          <Label for="delete-confirm" class="text-xs text-muted-foreground">
            Type <span class="font-mono font-semibold">{page.data?.project?.name}</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            name="confirmName"
            type="text"
            bind:value={deleteConfirmName}
            autocomplete="off"
          />
        </div>
        {#if deleteError}
          <p class="text-sm text-destructive">{deleteError}</p>
        {/if}
        <Button
          type="submit"
          variant="destructive"
          disabled={deleteConfirmName !== page.data?.project?.name}
        >
          <Trash2 class="h-4 w-4" />
          Delete Project
        </Button>
      </form>
    </div>
  {/if}

  {#if page.data?.role !== 'commenter'}
    <details class="mt-8 rounded-lg border border-border bg-card p-4">
      <summary class="cursor-pointer text-lg font-semibold">Advanced</summary>
      <div class="mt-4 space-y-2">
        <p class="text-sm text-muted-foreground">
          DreamForge re-reads the project folder as you move between pages. If you edited files on
          disk and something still looks out of date, re-index from disk.
        </p>
        <Button onclick={reindex} disabled={reindexing} variant="outline">
          <RefreshCw class="h-4 w-4 {reindexing ? 'animate-spin' : ''}" />
          {reindexing ? 'Re-indexing…' : 'Re-index from disk'}
        </Button>
        {#if reindexMessage}<p role="status" class="text-sm text-muted-foreground">
            {reindexMessage}
          </p>{/if}
      </div>
    </details>
  {/if}
</div>
