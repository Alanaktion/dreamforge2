<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { ArrowLeft, Save } from '@lucide/svelte';
  import { ApiError } from '$lib/api';
  import * as plots from '$lib/api/plots';
  import type { ChapterWithScenes } from '$lib/api/stories';
  import PlotTimeline from '$lib/components/PlotTimeline.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { countWords } from '$lib/utils/wordCount';

  let projectId = $derived(page.params.id ?? '');
  let plotlineId = $derived(page.params.plotlineId ?? '');
  let readOnly = $derived(page.data?.role === 'commenter');
  let error = $state<string | null>(null);
  let title = $state('');
  $effect.pre(() => {
    title = page.data?.plotline?.title ?? '';
  });

  let chapters = $derived((page.data?.chapters ?? []) as ChapterWithScenes[]);
  let scenes = $derived(
    chapters.flatMap((ch) =>
      (ch.scenes || []).map((s) => ({
        ...s,
        chapterTitle: ch.title,
        wordCount: countWords(s.body)
      }))
    )
  );

  let beats = $derived((page.data?.plotline?.beats ?? []) as plots.PlotBeat[]);
  let linkedBeats = $derived(beats.filter((b) => b.sceneId).length);
  let templateName = $derived(
    plots.PLOT_TEMPLATES[page.data?.plotline?.template as plots.PlotTemplate] ??
      page.data?.plotline?.template
  );

  function sceneHref(sceneId: string) {
    return `/projects/${projectId}/stories/${page.data?.plotline?.storyId}?scene=${sceneId}`;
  }

  /** Runs a change, then reloads the plotline, whether or not the change went through. */
  async function run(change: () => Promise<unknown>) {
    try {
      await change();
      error = null;
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
    }
    await invalidateAll().catch(() => {});
  }

  async function rename(event: SubmitEvent) {
    event.preventDefault();
    await run(() => plots.renamePlotline(projectId, plotlineId, title));
  }
</script>

<svelte:head>
  <title
    >{page.data?.plotline?.title || 'Plotline'} — {page.data?.projectName || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}/plots"
      class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to Plotlines
    </a>
  </div>

  <form onsubmit={rename} class="mb-6">
    <div class="flex items-center justify-between gap-2">
      <input
        type="text"
        name="title"
        aria-label="Plotline title"
        required
        readonly={readOnly}
        bind:value={title}
        class="min-w-0 flex-1 border-0 bg-transparent text-2xl font-bold outline-none"
      />
      <div class="flex items-center gap-2">
        {#if templateName}
          <Badge variant="secondary">{templateName}</Badge>
        {/if}
        {#if !readOnly}
          <Button type="submit">
            <Save class="h-4 w-4" />
            Save
          </Button>
        {/if}
      </div>
    </div>
  </form>

  {#if error}
    <p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
  {/if}
  {#if chapters.length === 0}
    <p class="mb-4 text-sm text-muted-foreground">
      This plotline's story has no scenes to link yet.
    </p>
  {/if}

  <div class="rounded-lg border border-border bg-card p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Beats</h2>
      {#if beats.length > 0}
        <span class="text-xs text-muted-foreground">
          {linkedBeats} of {beats.length} linked to a scene
        </span>
      {/if}
    </div>
    <fieldset disabled={readOnly}>
      <PlotTimeline
        {beats}
        {scenes}
        {sceneHref}
        onReorder={(ids) => run(() => plots.reorderBeats(projectId, plotlineId, ids))}
        onLinkScene={(beatId, sceneId) =>
          run(() => plots.updateBeat(projectId, plotlineId, beatId, { sceneId }))}
        onAddBeat={(beatTitle) => run(() => plots.addBeat(projectId, plotlineId, beatTitle))}
        onRenameBeat={(beatId, beatTitle) =>
          run(() => plots.updateBeat(projectId, plotlineId, beatId, { title: beatTitle }))}
        onDeleteBeat={(beatId) => run(() => plots.deleteBeat(projectId, plotlineId, beatId))}
      />
    </fieldset>
  </div>
</div>
