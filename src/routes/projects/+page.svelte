<script lang="ts">
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import {
    Plus,
    Pin,
    PinOff,
    ExternalLink,
    FolderOpen,
    BookOpen,
    Users,
    Map
  } from '@lucide/svelte';
  import { cn, formatDate } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { formatWordCount } from '$lib/utils/wordCount';

  let showCreate = $state(false);
  let name = $state('');
  let description = $state('');
  let creating = $state(false);
</script>

{#snippet summaryLine(project: {
  modifiedAt: string;
  summary: { entityCount: number; storyCount: number; wordCount: number } | null;
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
        method="POST"
        action="?/create"
        use:enhance={() => {
          creating = true;
          return async ({ update }) => {
            creating = false;
            await update();
          };
        }}
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
        <div class="flex gap-2">
          <Button type="submit" disabled={creating}>Create</Button>
          <Button type="button" variant="outline" onclick={() => (showCreate = false)}
            >Cancel</Button
          >
        </div>
      </form>
    </div>
  {/if}

  <form
    method="POST"
    action="?/import"
    enctype="multipart/form-data"
    use:enhance
    class="mb-6 space-y-2"
  >
    <Label for="archive">Import project from ZIP (up to 20 MB)</Label>
    <input id="archive" name="archive" type="file" accept=".zip" required />
    <Button type="submit" variant="outline">Import project</Button>
  </form>
  {#if page.form?.error}<p role="alert" class="text-destructive">{page.form.error}</p>{/if}
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
        <Button onclick={() => (showCreate = true)} size="lg">
          <Plus class="h-4 w-4" />
          Create Your First Project
        </Button>
      </div>
    {/if}

    {#each page.data?.projects || [] as project (project.id)}
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
          <form method="POST" action="?/togglePin">
            <input type="hidden" name="projectId" value={project.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label={project.pinned ? 'Unpin project' : 'Pin project'}
            >
              {#if project.pinned}
                <PinOff class="h-4 w-4" />
              {:else}
                <Pin class="h-4 w-4" />
              {/if}
            </Button>
          </form>
          <Button
            href="/projects/{project.id}"
            variant="ghost"
            size="icon-sm"
            aria-label="Open project"
          >
            <ExternalLink class="h-4 w-4" />
          </Button>
        </div>
      </div>
    {/each}

    {#if (page.data?.sharedProjects?.length ?? 0) > 0}
      <div class="mt-6">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Shared with me</h2>
        {#each page.data.sharedProjects as project (project.id)}
          <div
            class="flex items-center justify-between rounded-lg border border-border bg-card p-4 mb-2"
          >
            <div class="flex-1">
              <a href="/projects/{project.id}" class="font-semibold hover:underline">
                {project.name}
              </a>
              {#if project.description}
                <p class="mt-1 text-sm text-muted-foreground">{project.description}</p>
              {/if}
              {@render summaryLine(project)}
            </div>
            <Button
              href="/projects/{project.id}"
              variant="ghost"
              size="icon-sm"
              aria-label="Open project"
            >
              <ExternalLink class="h-4 w-4" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
