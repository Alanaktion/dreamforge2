<script lang="ts">
  import {
    GripVertical,
    Link2,
    Pencil,
    Trash2,
    Plus,
    Check,
    X,
    ArrowUp,
    ArrowDown
  } from '@lucide/svelte';
  import { moveItem } from '$lib/utils';

  interface Beat {
    id: string;
    title: string;
    sceneId: string | null;
    sortOrder: number;
  }

  interface SceneInfo {
    id: string;
    title: string | null;
    chapterTitle?: string;
    status?: string;
    wordCount?: number;
  }

  const STATUS_DOTS: Record<string, string> = {
    draft: 'bg-muted-foreground',
    revised: 'bg-amber-500',
    final: 'bg-emerald-500'
  };

  let {
    beats = [],
    scenes = [],
    sceneHref,
    onReorder,
    onLinkScene,
    onAddBeat,
    onRenameBeat,
    onDeleteBeat
  }: {
    beats: Beat[];
    scenes: SceneInfo[];
    sceneHref?: (sceneId: string) => string;
    onReorder?: (beatIds: string[]) => void;
    onLinkScene?: (beatId: string, sceneId: string | null) => void;
    onAddBeat?: (title: string) => void;
    onRenameBeat?: (beatId: string, title: string) => void;
    onDeleteBeat?: (beatId: string) => void;
  } = $props();

  let dragBeat = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let editingTitle = $state('');
  let newBeatTitle = $state('');

  function handleDragStart(e: DragEvent, id: string) {
    dragBeat = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragBeat || dragBeat === targetId) return;
    const ids = beats.map((b) => b.id);
    const fromIdx = ids.indexOf(dragBeat);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragBeat);
    onReorder?.(ids);
    dragBeat = null;
  }

  function moveBeat(id: string, delta: number) {
    const ids = moveItem(
      beats.map((b) => b.id),
      id,
      delta
    );
    if (ids) onReorder?.(ids);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function getScene(sceneId: string | null): SceneInfo | undefined {
    return sceneId ? scenes.find((s) => s.id === sceneId) : undefined;
  }

  function getSceneLabel(sceneId: string | null): string {
    const scene = getScene(sceneId);
    if (!scene) return 'Missing scene';
    return scene.title || 'Untitled Scene';
  }

  function startEditing(beat: Beat) {
    editingId = beat.id;
    editingTitle = beat.title;
  }

  function cancelEditing() {
    editingId = null;
    editingTitle = '';
  }

  function saveEditing() {
    const title = editingTitle.trim();
    if (editingId && title) {
      onRenameBeat?.(editingId, title);
    }
    cancelEditing();
  }

  function addBeat() {
    const title = newBeatTitle.trim();
    if (!title) return;
    onAddBeat?.(title);
    newBeatTitle = '';
  }
</script>

<div class="space-y-1">
  <ol class="space-y-1" aria-label="Plot beats">
    {#each beats as beat, i (beat.id)}
      <li
        class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        draggable="true"
        ondragstart={(e) => handleDragStart(e, beat.id)}
        ondragover={handleDragOver}
        ondrop={(e) => handleDrop(e, beat.id)}
      >
        <GripVertical
          class="h-4 w-4 cursor-grab text-muted-foreground opacity-40"
          aria-hidden="true"
        />
        <span
          aria-hidden="true"
          class="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground"
          >{i + 1}</span
        >
        {#if editingId === beat.id}
          <input
            type="text"
            aria-label="Beat title"
            class="flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm"
            bind:value={editingTitle}
            onkeydown={(e) => {
              if (e.key === 'Enter') saveEditing();
              if (e.key === 'Escape') cancelEditing();
            }}
          />
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Save beat title"
            onclick={saveEditing}
          >
            <Check class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Cancel editing"
            onclick={cancelEditing}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        {:else}
          <span class="min-w-0 flex-1 text-sm">{beat.title}</span>
          {#if beat.sceneId}
            {@const scene = getScene(beat.sceneId)}
            {@const href = sceneHref && scene ? sceneHref(beat.sceneId) : null}
            <svelte:element
              this={href ? 'a' : 'span'}
              {href}
              class="flex items-center gap-1 rounded bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link2 class="h-3 w-3" />
              {getSceneLabel(beat.sceneId)}
              {#if scene}
                <span
                  class="h-1.5 w-1.5 rounded-full {STATUS_DOTS[scene.status || 'draft']}"
                  aria-hidden="true"
                ></span>
                <span class="sr-only">({scene.status || 'draft'})</span>
                {#if scene.wordCount !== undefined}
                  <span>{scene.wordCount}w</span>
                {/if}
              {/if}
            </svelte:element>
          {/if}
          <select
            aria-label="Linked scene for {beat.title}"
            class="max-w-40 rounded border border-input bg-background px-1 py-0.5 text-xs"
            value={beat.sceneId || ''}
            onchange={(e) => onLinkScene?.(beat.id, (e.target as HTMLSelectElement).value || null)}
          >
            <option value="">No scene</option>
            {#each scenes as scene (scene.id)}
              <option value={scene.id}
                >{scene.chapterTitle ? `${scene.chapterTitle} / ` : ''}{scene.title ||
                  'Untitled'}</option
              >
            {/each}
          </select>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
            aria-label="Move {beat.title} up"
            title="Move up"
            disabled={i === 0}
            onclick={() => moveBeat(beat.id, -1)}
          >
            <ArrowUp class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
            aria-label="Move {beat.title} down"
            title="Move down"
            disabled={i === beats.length - 1}
            onclick={() => moveBeat(beat.id, 1)}
          >
            <ArrowDown class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Rename {beat.title}"
            onclick={() => startEditing(beat)}
          >
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
            aria-label="Delete {beat.title}"
            onclick={() => onDeleteBeat?.(beat.id)}
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
    <Plus class="h-4 w-4 text-muted-foreground" />
    <input
      type="text"
      aria-label="New beat title"
      placeholder="Add a beat…"
      class="flex-1 rounded border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
      bind:value={newBeatTitle}
      onkeydown={(e) => {
        if (e.key === 'Enter') addBeat();
      }}
    />
    <button
      class="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
      onclick={addBeat}
    >
      Add
    </button>
  </div>
</div>
