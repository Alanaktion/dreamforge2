<script lang="ts">
  import { page } from '$app/state';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { ArrowLeft } from '@lucide/svelte';
  import SummariesView from '$lib/components/SummariesView.svelte';

  let plotlines = $derived(
    (page.data?.plotlines || []).map((pl: any) => ({
      title: pl.title,
      beats: pl.beats || []
    }))
  );

  async function handleReorder(chapterId: string, sceneIds: string[]) {
    const form = new FormData();
    form.set('chapterId', chapterId);
    form.set('sceneIds', JSON.stringify(sceneIds));
    await fetch(`/projects/${page.params.id}/stories/${page.params.storyId}?/reorderScenes`, {
      method: 'POST',
      body: form
    });
    await invalidateAll();
  }

  let saveError = $state('');

  function sceneRevision(sceneId: string): string {
    for (const chapter of page.data?.chapters || []) {
      const scene = chapter.scenes.find((s: { id: string }) => s.id === sceneId);
      if (scene) return scene.revision ?? '';
    }
    return '';
  }

  async function handleUpdateSummary(
    chapterId: string,
    sceneId: string,
    field: string,
    value: string
  ) {
    const form = new FormData();
    form.set('chapterId', chapterId);
    form.set('sceneId', sceneId);
    form.set('field', field);
    form.set('value', value);
    form.set('revision', sceneRevision(sceneId));
    saveError = '';
    const res = await fetch('?/updateSceneSummary', { method: 'POST', body: form });
    const result = deserialize(await res.text());
    if (result.type === 'success') {
      await invalidateAll();
      return;
    }
    saveError =
      result.type === 'failure' && result.status === 409
        ? 'This scene changed elsewhere, so the synopsis was not saved. Copy it, then reload.'
        : 'Could not save the synopsis.';
  }
</script>

<svelte:head>
  <title
    >Summaries — {page.data?.story?.title || 'Story'} — {page.data?.projectName || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="mx-auto max-w-4xl p-6">
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}/stories/{page.params.storyId}"
      class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.story?.title || 'Story'}
    </a>
    <h1 class="mt-2 text-2xl font-bold">Summaries</h1>
    <p class="text-sm text-muted-foreground">
      {page.data?.projectName || 'Project'} &middot; {page.data?.story?.title || ''}
    </p>
  </div>

  {#if saveError}
    <p class="mb-4 text-sm text-destructive" role="alert">
      {saveError}
      <button type="button" class="underline" onclick={() => window.location.reload()}
        >Reload</button
      >
    </p>
  {/if}

  <SummariesView
    chapters={page.data?.chapters || []}
    {plotlines}
    onReorder={handleReorder}
    onUpdateSummary={handleUpdateSummary}
  />
</div>
