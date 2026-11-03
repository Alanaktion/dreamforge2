<script lang="ts">
  import {
    GripVertical,
    FileText,
    Circle,
    CircleCheckBig,
    Clock,
    ArrowUp,
    ArrowDown
  } from '@lucide/svelte';
  import { moveItem } from '$lib/utils';

  const STATUS_DOTS: Record<string, string> = {
    draft: 'bg-muted-foreground',
    revised: 'bg-amber-500',
    final: 'bg-emerald-500'
  };

  interface SceneSummary {
    id: string;
    title: string | null;
    status?: string;
    summary: string | null;
    plotThreads: { thread: string; type: string }[];
    sortOrder: number;
  }

  interface ChapterSummary {
    id: string;
    title: string;
    sortOrder: number;
    scenes: SceneSummary[];
  }

  let {
    chapters = [],
    plotlines = [],
    onReorder,
    onUpdateSummary
  }: {
    chapters: ChapterSummary[];
    plotlines?: { title: string; beats: { title: string; sceneId: string | null }[] }[];
    onReorder?: (chapterId: string, sceneIds: string[]) => void;
    onUpdateSummary?: (chapterId: string, sceneId: string, field: string, value: string) => void;
  } = $props();

  let draggedScene = $state<{ sceneId: string; chapterId: string } | null>(null);

  function handleDragStart(e: DragEvent, sceneId: string, chapterId: string) {
    draggedScene = { sceneId, chapterId };
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleSceneDrop(e: DragEvent, chapterId: string, targetId: string) {
    e.preventDefault();
    if (!draggedScene || draggedScene.sceneId === targetId) return;
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const ids = chapter.scenes.map((s) => s.id);
    const fromIdx = ids.indexOf(draggedScene.sceneId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedScene.sceneId);
    onReorder?.(chapterId, ids);
    draggedScene = null;
  }

  function moveScene(chapter: ChapterSummary, sceneId: string, delta: number) {
    const ids = moveItem(
      chapter.scenes.map((s) => s.id),
      sceneId,
      delta
    );
    if (ids) onReorder?.(chapter.id, ids);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function getScenePlotThreads(sceneId: string) {
    return plotlines.flatMap((pl) =>
      pl.beats
        .filter((b) => b.sceneId === sceneId)
        .map((b) => ({ thread: pl.title, beat: b.title }))
    );
  }
</script>

<div class="space-y-6">
  {#each chapters as chapter}
    <div class="rounded-lg border border-border bg-card">
      <div class="border-b border-border px-4 py-2">
        <h3 class="font-medium">{chapter.title}</h3>
      </div>
      <ol class="divide-y divide-border" aria-label="Scenes in {chapter.title}">
        {#each chapter.scenes as scene, j (scene.id)}
          <li
            class="flex items-start gap-3 px-4 py-3"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, scene.id, chapter.id)}
            ondragover={handleDragOver}
            ondrop={(e) => handleSceneDrop(e, chapter.id, scene.id)}
          >
            <GripVertical
              class="mt-1 h-4 w-4 cursor-grab text-muted-foreground opacity-40"
              aria-hidden="true"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <FileText class="h-4 w-4 text-muted-foreground" />
                <span class="text-sm font-medium">{scene.title || 'Untitled Scene'}</span>
                <span
                  class="h-1.5 w-1.5 rounded-full {STATUS_DOTS[scene.status || 'draft']}"
                  title={scene.status || 'draft'}
                  aria-hidden="true"
                ></span>
                <span class="sr-only">({scene.status || 'draft'})</span>
                {#if onReorder}
                  <span class="ml-auto flex items-center">
                    <button
                      type="button"
                      class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                      aria-label="Move {scene.title || 'Untitled Scene'} up"
                      title="Move up"
                      disabled={j === 0}
                      onclick={() => moveScene(chapter, scene.id, -1)}
                    >
                      <ArrowUp class="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                      aria-label="Move {scene.title || 'Untitled Scene'} down"
                      title="Move down"
                      disabled={j === chapter.scenes.length - 1}
                      onclick={() => moveScene(chapter, scene.id, 1)}
                    >
                      <ArrowDown class="h-3.5 w-3.5" />
                    </button>
                  </span>
                {/if}
              </div>
              {#if scene.summary}
                <p class="mt-1 text-xs text-muted-foreground">{scene.summary}</p>
              {:else}
                <textarea
                  aria-label="Synopsis for {scene.title || 'Untitled Scene'}"
                  class="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs"
                  rows="2"
                  placeholder="Add a synopsis..."
                  value=""
                  onchange={(e) =>
                    onUpdateSummary?.(
                      chapter.id,
                      scene.id,
                      'summary',
                      (e.target as HTMLTextAreaElement).value
                    )}></textarea>
              {/if}
              {#if scene.plotThreads.length > 0}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each scene.plotThreads as pt}
                    <span
                      class="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {#if pt.type === 'setup'}
                        <Circle class="h-2.5 w-2.5" />
                      {:else if pt.type === 'payoff'}
                        <CircleCheckBig class="h-2.5 w-2.5" />
                      {:else}
                        <Clock class="h-2.5 w-2.5" />
                      {/if}
                      {pt.thread}
                    </span>
                  {/each}
                </div>
              {/if}
              {#if scene.id}
                {@const plotRefs = getScenePlotThreads(scene.id)}
                {#if plotRefs.length > 0}
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each plotRefs as ref}
                      <span class="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        {ref.thread}: {ref.beat}
                      </span>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </div>
  {/each}
</div>
