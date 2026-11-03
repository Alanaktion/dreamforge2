<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { api, apiForm, ApiError } from '$lib/api';
  import type { Preset } from '$lib/api/types';
  import {
    Plus,
    Pin,
    PinOff,
    ExternalLink,
    FolderOpen,
    BookOpen,
    Users,
    Map,
    Sparkles
  } from '@lucide/svelte';
  import { cn, formatDate } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { formatWordCount } from '$lib/utils/wordCount';
  import { importProjectZip } from '$lib/api/transfer';

  let showCreate = $state(false);
  let name = $state('');
  let description = $state('');
  let creating = $state(false);
  let presetChoice = $state('blank');
  let error = $state('');
  let busy = $state(false);

  function message(cause: unknown) {
    return cause instanceof ApiError ? cause.message : 'Could not reach the server.';
  }

  async function createSample() {
    error = '';
    busy = true;
    try {
      const { id } = await api<{ id: string }>('/api/projects/sample', { method: 'POST' });
      await goto(`/projects/${id}`);
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = false;
    }
  }

  async function importZip(event: SubmitEvent) {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).elements.namedItem(
      'archive'
    ) as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    error = '';
    if (file.size > 20 * 1024 * 1024) {
      error = 'Choose a ZIP file up to 20 MB';
      return;
    }
    busy = true;
    try {
      await goto(`/projects/${await importProjectZip(file)}`);
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = false;
    }
  }

  async function togglePin(projectId: string) {
    error = '';
    try {
      await api(`/api/projects/${projectId}/pin`, { method: 'POST' });
      await invalidateAll();
    } catch (cause) {
      error = message(cause);
    }
  }
</script>

{#snippet summaryLine(project: {
  modifiedAt: string;
  summary?: { entityCount: number; storyCount: number; wordCount: number } | null;
})}
  <p class="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
    {#if project.summary}
      <span>{formatWordCount(project.summary.wordCount)} words</span>
      <span
        >{project.summary.storyCount}
        {project.summary.storyCount === 1 ? 'story' : 'stories'}</span
      >
      <span
        >{project.summary.entityCount} world
        {project.summary.entityCount === 1 ? 'entry' : 'entries'}</span
      >
    {/if}
    <span>Last activity {formatDate(project.modifiedAt)}</span>
  </p>
{/snippet}

{#snippet projectCard(project: {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  isOwner: boolean;
  modifiedAt: string;
  summary?: { entityCount: number; storyCount: number; wordCount: number } | null;
})}
  <div
    class={cn(
      'flex items-center justify-between rounded-lg border border-border bg-card p-4',
      project.pinned && 'border-primary/50'
    )}
  >
    <div class="flex-1">
      <div class="flex items-center gap-2">
        {#if project.pinned}
          <Pin class="h-3 w-3 text-primary" />
        {/if}
        <a href="/projects/{project.id}" class="font-semibold hover:underline">
          {project.name}
        </a>
      </div>
      {#if project.description}
        <p class="mt-1 text-sm text-muted-foreground">{project.description}</p>
      {/if}
      {@render summaryLine(project)}
    </div>
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
        title={project.pinned ? 'Unpin' : 'Pin to top'}
        onclick={() => togglePin(project.id)}
      >
        {#if project.pinned}
          <PinOff class="h-4 w-4" />
        {:else}
          <Pin class="h-4 w-4" />
        {/if}
      </Button>
      <Button
        href="/projects/{project.id}"
        variant="ghost"
        size="icon-sm"
        aria-label="Open {project.name}"
      >
        <ExternalLink class="h-4 w-4" />
      </Button>
    </div>
  </div>
{/snippet}

<svelte:head>
  <title>Projects — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-bold">Projects</h1>
    <Button onclick={() => (showCreate = !showCreate)}>
      <Plus class="h-4 w-4" />
      New Project
    </Button>
  </div>

  {#if showCreate}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 text-lg font-semibold">Create Project</h2>
      <form
        use:apiForm={{
          path: '/api/projects',
          onresult: async (result) => {
            creating = false;
            if (result.ok) await goto(`/projects/${(result.data as { id: string }).id}`);
            else error = result.error;
          }
        }}
        onsubmit={() => (creating = true)}
        class="space-y-4"
      >
        <div class="space-y-1.5">
          <Label for="name">Project Name</Label>
          <Input id="name" name="name" type="text" required bind:value={name} />
        </div>
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" bind:value={description} />
        </div>
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium">Start from</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each Object.entries((page.data?.presets ?? {}) as Record<string, Preset>) as [value, preset] (value)}
              <label
                class="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary"
              >
                <input type="radio" name="preset" {value} bind:group={presetChoice} class="mt-1" />
                <span>
                  <span class="block font-medium">{preset.label}</span>
                  <span class="block text-xs text-muted-foreground">{preset.description}</span>
                </span>
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="flex gap-2">
          <Button type="submit" disabled={creating}>Create</Button>
          <Button type="button" variant="outline" onclick={() => (showCreate = false)}
            >Cancel</Button
          >
        </div>
      </form>
      <div class="mt-3 border-t border-border pt-3">
        <Button variant="link" size="sm" class="px-0" disabled={busy} onclick={createSample}>
          <Sparkles class="h-4 w-4" />
          Or explore a sample world first
        </Button>
      </div>
    </div>
  {/if}

  {#if error}<p role="alert" class="text-destructive">{error}</p>{/if}
  <div class="space-y-3">
    {#if (page.data?.projects?.length ?? 0) === 0 && (page.data?.sharedProjects?.length ?? 0) === 0}
      <div class="flex flex-col items-center py-16 text-center">
        <FolderOpen class="mb-4 h-16 w-16 text-muted-foreground/40" />
        <h2 class="mb-2 text-xl font-semibold">Welcome to DreamForge</h2>
        <p class="mb-6 max-w-md text-muted-foreground">
          Projects are where you build your world. Each project is a self-contained universe with
          its own characters, locations, stories, and more.
        </p>
        <div class="mb-8 grid gap-4 sm:grid-cols-2">
          <div class="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left">
            <BookOpen class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p class="text-sm font-medium">Organized &amp; Self-Contained</p>
              <p class="text-xs text-muted-foreground">
                Every project keeps its entities, notes, and images together on disk as Markdown
                files.
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left">
            <Users class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p class="text-sm font-medium">Collaborate with Others</p>
              <p class="text-xs text-muted-foreground">
                Share projects with other writers and build your world together.
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left">
            <Map class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p class="text-sm font-medium">Rich Entity Types</p>
              <p class="text-xs text-muted-foreground">
                Characters, locations, organizations, cultures, species, items, and notes — all with
                structured fields.
              </p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left">
            <Plus class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p class="text-sm font-medium">Start Simple, Grow Big</p>
              <p class="text-xs text-muted-foreground">
                Begin with a single idea and expand as your world takes shape.
              </p>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <Button onclick={() => (showCreate = true)} size="lg">
            <Plus class="h-4 w-4" />
            Create Your First Project
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onclick={createSample}>
            <Sparkles class="h-4 w-4" />
            Explore a sample world
          </Button>
        </div>
        <p class="mt-3 max-w-md text-xs text-muted-foreground">
          The sample is a normal project with a few characters, places, a two-chapter story,
          relations, and a timeline. Delete it from its Settings page whenever you like.
        </p>
      </div>
    {/if}

    {#each page.data?.projects || [] as project (project.id)}
      {@render projectCard(project)}
    {/each}

    {#if (page.data?.sharedProjects?.length ?? 0) > 0}
      <div class="mt-6">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Shared with me</h2>
        <div class="space-y-3">
          {#each page.data.sharedProjects as project (project.id)}
            {@render projectCard(project)}
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <details class="mt-8 rounded-lg border border-border p-4 text-sm">
    <summary class="cursor-pointer font-medium">Import a project</summary>
    <form onsubmit={importZip} class="mt-3 space-y-2">
      <Label for="archive">Import project from ZIP (up to 20 MB)</Label>
      <input id="archive" name="archive" type="file" accept=".zip" required />
      <Button type="submit" variant="outline" disabled={busy}>Import project</Button>
    </form>
  </details>
</div>
