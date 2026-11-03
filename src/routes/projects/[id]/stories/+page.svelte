<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { ApiError } from '$lib/api';
  import { createStory, deleteStory, setStoryTarget } from '$lib/api/stories';
  import { Plus, BookOpen, Trash2, Target } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { formatWordCount } from '$lib/utils/wordCount';

  let showCreate = $state(false);
  let title = $state('');
  let description = $state('');
  let editingTarget = $state<string | null>(null);
  let error = $state('');

  function message(cause: unknown) {
    return cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
  }

  async function submitCreate(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      const created = await createStory(page.params.id!, title, description);
      await goto(`/projects/${page.params.id}/stories/${created.storyId}?scene=${created.sceneId}`);
    } catch (cause) {
      error = message(cause);
    }
  }

  async function submitTarget(event: SubmitEvent, storyId: string) {
    event.preventDefault();
    const raw = new FormData(event.currentTarget as HTMLFormElement).get('target');
    error = '';
    try {
      await setStoryTarget(page.params.id!, storyId, Number(raw || 0));
      editingTarget = null;
      await invalidateAll();
    } catch (cause) {
      error = message(cause);
    }
  }

  async function remove(storyId: string) {
    error = '';
    try {
      await deleteStory(page.params.id!, storyId);
      await invalidateAll();
    } catch (cause) {
      error = message(cause);
    }
  }

  let targets = $derived((page.data?.storyTargets || {}) as Record<string, number>);

  function targetPercent(words: number, target: number): number {
    if (target <= 0) return 0;
    return Math.min(100, Math.round((words / target) * 100));
  }

  // The command palette links here with ?new=1 to jump straight into creation.
  $effect(() => {
    if (page.url.searchParams.get('new')) showCreate = true;
  });
</script>

<svelte:head>
  <title>Stories — {page.data?.projectName || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Stories</h1>
      <p class="text-sm text-muted-foreground">{page.data?.projectName || 'Project'}</p>
    </div>
    <Button onclick={() => (showCreate = !showCreate)}>
      <Plus class="h-4 w-4" />
      New Story
    </Button>
  </div>

  {#if error}
    <p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if showCreate}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <form onsubmit={submitCreate} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="title">Title</Label>
          <Input id="title" name="title" type="text" required bind:value={title} />
        </div>
        <div class="space-y-1.5">
          <Label for="description">Description</Label>
          <Textarea id="description" name="description" bind:value={description} />
        </div>
        <div class="flex gap-2">
          <Button type="submit" disabled={!title.trim()}>Create</Button>
          <Button type="button" variant="outline" onclick={() => (showCreate = false)}
            >Cancel</Button
          >
        </div>
      </form>
    </div>
  {/if}

  <div class="space-y-3">
    {#if (page.data?.stories || []).length === 0}
      <p class="mx-auto max-w-md py-12 text-center text-muted-foreground">
        No stories yet. A story holds your chapters and scenes. Start one to begin drafting, and
        mention characters with @ as you write.
      </p>
    {/if}

    {#each page.data?.stories || [] as story (story.id)}
      {@const target = targets[story.id] || 0}
      <div class="group relative rounded-lg border border-border bg-card">
        <a
          href="/projects/{page.params.id}/stories/{story.id}"
          class="flex items-start gap-4 px-4 py-3"
        >
          <BookOpen class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <span class="font-medium">{story.title}</span>
            {#if story.description}
              <p class="text-xs text-muted-foreground">{story.description}</p>
            {/if}
            <p class="mt-1 text-xs text-muted-foreground">
              {formatWordCount(story.wordCount)}
              {#if target > 0}
                / {formatWordCount(target)}
              {/if}
              words · {story.chapterCount}
              {story.chapterCount === 1 ? 'chapter' : 'chapters'} · {story.sceneCount}
              {story.sceneCount === 1 ? 'scene' : 'scenes'}
            </p>
            {#if target > 0}
              <div class="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-secondary">
                <div
                  class="h-full rounded-full transition-all"
                  class:bg-primary={targetPercent(story.wordCount, target) < 100}
                  class:bg-emerald-500={targetPercent(story.wordCount, target) >= 100}
                  style="width: {targetPercent(story.wordCount, target)}%"
                ></div>
              </div>
            {/if}
          </div>
        </a>
        <div
          class="absolute right-2 top-2 flex items-center gap-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            title="Set word target"
            aria-label="Set word target"
            onclick={() => (editingTarget = editingTarget === story.id ? null : story.id)}
          >
            <Target class="h-4 w-4" />
          </Button>
          {#if page.data?.role !== 'commenter'}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete story"
              title="Move to trash"
              onclick={() => remove(story.id)}
            >
              <Trash2 class="h-4 w-4 text-destructive" />
            </Button>
          {/if}
        </div>

        {#if editingTarget === story.id}
          <form
            onsubmit={(event) => submitTarget(event, story.id)}
            class="flex items-end gap-2 border-t border-border px-4 py-3"
          >
            <div class="space-y-1">
              <Label for="target-{story.id}" class="text-xs text-muted-foreground">
                Word target (0 to clear)
              </Label>
              <Input
                id="target-{story.id}"
                name="target"
                type="number"
                min="0"
                step="1000"
                class="w-40"
                value={target}
              />
            </div>
            <Button type="submit" size="sm">Save</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => (editingTarget = null)}
            >
              Cancel
            </Button>
          </form>
        {/if}
      </div>
    {/each}
  </div>
</div>
