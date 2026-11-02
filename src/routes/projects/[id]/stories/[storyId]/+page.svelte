<script lang="ts">
  import { page } from '$app/state';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll, beforeNavigate, goto } from '$app/navigation';
  import {
    ArrowLeft,
    Plus,
    Trash2,
    GripVertical,
    ChevronDown,
    ChevronRight,
    BookOpen,
    Save,
    Image,
    LayoutList,
    SwitchCamera,
    Download,
    Check,
    CloudOff,
    Loader2,
    Scan
  } from '@lucide/svelte';
  import { getZenMode } from '$lib/stores/zenMode.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { countWords, formatWordCount } from '$lib/utils/wordCount';
  import type { EntityType, SceneStatus } from '$lib/types';

  const zen = getZenMode();

  const AUTOSAVE_DELAY = 1500;

  const STATUS_ORDER: SceneStatus[] = ['draft', 'revised', 'final'];
  const STATUS_LABELS: Record<SceneStatus, string> = {
    draft: 'Draft',
    revised: 'Revised',
    final: 'Final'
  };
  const STATUS_DOTS: Record<SceneStatus, string> = {
    draft: 'bg-muted-foreground/40',
    revised: 'bg-amber-500',
    final: 'bg-emerald-500'
  };

  interface SceneRow {
    revision?: string;
    id: string;
    title: string | null;
    status: SceneStatus;
    narrator: string | null;
    time: string | null;
    place: string | null;
    participants: string[];
    backgroundImage: string | null;
    body: string;
    [key: string]: unknown;
  }

  interface ChapterRow {
    id: string;
    title: string;
    scenes: SceneRow[];
  }

  let showCreateChapter = $state(false);
  let editingStoryTitle = $state(false);
  let showExport = $state(false);
  let exportAuthor = $state('');
  let exportDelimiter = $state('* * *');
  let exportTitlePage = $state(true);
  let exportToc = $state(true);
  let exportSceneTitles = $state(true);
  let exportSceneMeta = $state(true);
  let exportNumberedChapters = $state(false);

  let exportUrl = $derived.by(() => {
    const params: string[] = [];
    const add = (key: string, value: string) => params.push(`${key}=${encodeURIComponent(value)}`);

    if (exportAuthor) add('author', exportAuthor);
    if (exportDelimiter !== '* * *') add('delimiter', exportDelimiter);
    if (!exportTitlePage) add('titlePage', 'false');
    if (!exportToc) add('toc', 'false');
    if (!exportSceneTitles) add('sceneTitles', 'false');
    if (!exportSceneMeta) add('sceneMeta', 'false');
    if (exportNumberedChapters) add('titleFormat', 'number');

    const query = params.join('&');
    return `/projects/${page.params.id}/stories/${page.params.storyId}/export${query ? `?${query}` : ''}`;
  });
  let renamingChapterId = $state<string | null>(null);
  let chapterTitle = $state('');
  let expandedChapters = $state<Set<string>>(new Set());
  let activeSceneId = $state<string | null>(null);
  let sceneBody = $state('');
  let sceneTitle = $state('');
  let sceneStatus = $state<SceneStatus>('draft');
  let sceneNarrator = $state('');
  let sceneTime = $state('');
  let scenePlace = $state('');
  let sceneParticipants = $state<string[]>([]);
  let sceneBackgroundImage = $state('');
  let activeChapterId = $state('');

  let savedSnapshot = $state('');
  let saving = $state(false);
  let saveError = $state('');
  let revision = $state('');
  let conflict = $state(false);
  let lastSavedAt = $state<Date | null>(null);
  let sessionStartWords = $state<number | null>(null);

  let dragChapterId = $state<string | null>(null);
  let dragSceneId = $state<string | null>(null);

  let initialSceneId = $state<string | null>(null);
  let initialSceneHandled = $state(false);

  // Writable derived: reloads follow the server, and saveScene() can patch a scene
  // locally so word counts update without a round trip.
  let chapters = $derived((page.data?.chapters || []) as ChapterRow[]);
  let role = $derived(page.data?.role || 'owner');
  let canEdit = $derived(role !== 'commenter');
  let pickerEntities = $derived(
    (page.data?.entities || []) as Array<{ id: string; name: string; type: EntityType }>
  );

  let storyWords = $derived(
    chapters.reduce(
      (total, ch) => total + ch.scenes.reduce((sum, s) => sum + countWords(s.body), 0),
      0
    )
  );

  $effect(() => {
    if (sessionStartWords === null && chapters.length > 0) sessionStartWords = storyWords;
  });

  let sessionWords = $derived(sessionStartWords === null ? 0 : storyWords - sessionStartWords);

  let statusCounts = $derived.by(() => {
    const counts: Record<SceneStatus, number> = { draft: 0, revised: 0, final: 0 };
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) counts[scene.status || 'draft']++;
    }
    return counts;
  });
  let sceneWords = $derived(countWords(sceneBody));

  function chapterWords(chapter: ChapterRow): number {
    return chapter.scenes.reduce((sum, s) => sum + countWords(s.body), 0);
  }

  $effect(() => {
    const sceneParam = page.url.searchParams.get('scene');
    if (sceneParam && !initialSceneId) {
      initialSceneId = sceneParam;
    }
  });

  $effect(() => {
    const sceneId = initialSceneId;
    if (!sceneId || chapters.length === 0 || initialSceneHandled) return;

    for (const ch of chapters) {
      const scene = (ch.scenes || []).find((s) => s.id === sceneId);
      if (scene) {
        expandedChapters = new Set([...expandedChapters, ch.id]);
        loadScene(scene, ch.id);
        initialSceneHandled = true;
        break;
      }
    }
  });

  function currentValues() {
    return {
      title: sceneTitle,
      status: sceneStatus,
      narrator: sceneNarrator,
      time: sceneTime,
      place: scenePlace,
      participants: sceneParticipants.join(', '),
      backgroundImage: sceneBackgroundImage,
      body: sceneBody
    };
  }

  let dirty = $derived(activeSceneId !== null && JSON.stringify(currentValues()) !== savedSnapshot);

  function loadScene(scene: SceneRow, chapterId: string) {
    activeSceneId = scene.id;
    revision = scene.revision ?? '';
    conflict = false;
    activeChapterId = chapterId;
    sceneTitle = scene.title || '';
    sceneStatus = scene.status || 'draft';
    sceneBody = scene.body || '';
    sceneNarrator = scene.narrator || '';
    sceneTime = scene.time || '';
    scenePlace = scene.place || '';
    sceneParticipants = [...(scene.participants || [])];
    sceneBackgroundImage = scene.backgroundImage || '';
    savedSnapshot = JSON.stringify(currentValues());
    saveError = '';
    zen.backgroundImage = scene.backgroundImage || null;
  }

  /** Never switch away from unsaved edits — flush them first. */
  async function openScene(scene: SceneRow, chapterId: string) {
    if (scene.id === activeSceneId) return;
    if (dirty && !(await saveScene())) return;
    loadScene(scene, chapterId);
  }

  async function closeScene() {
    if (dirty && !(await saveScene())) return;
    zen.backgroundImage = null;
    if (zen.active) zen.active = false;
    activeSceneId = null;
    activeChapterId = '';
    sceneTitle = '';
    sceneStatus = 'draft';
    sceneBody = '';
    sceneNarrator = '';
    sceneTime = '';
    scenePlace = '';
    sceneParticipants = [];
    sceneBackgroundImage = '';
    savedSnapshot = '';
  }

  async function saveScene(overwrite = false): Promise<boolean> {
    if (!activeSceneId || !canEdit || saving || (conflict && !overwrite)) return false;

    const sceneId = activeSceneId;
    const chapterId = activeChapterId;
    const values = currentValues();
    const snapshot = JSON.stringify(values);

    saving = true;
    saveError = '';

    try {
      const form = new FormData();
      form.set('revision', revision);
      if (overwrite) form.set('overwrite', 'true');
      form.set('chapterId', chapterId);
      form.set('sceneId', sceneId);
      for (const [key, value] of Object.entries(values)) form.set(key, value);

      const res = await fetch('?/updateScene', { method: 'POST', body: form });
      const result = deserialize(await res.text());
      if (result.type !== 'success') {
        conflict = result.type === 'failure' && result.status === 409;
        throw new Error(
          conflict
            ? 'This changed elsewhere. Reload latest or overwrite with your edits.'
            : 'Save failed'
        );
      }
      revision = (result.data as { revision?: string })?.revision ?? revision;
      conflict = false;
      saveError = (result.data as { warning?: string })?.warning ?? '';

      savedSnapshot = snapshot;
      lastSavedAt = new Date();

      // Patch the local tree so word counts track the edit without a full reload.
      chapters = chapters.map((ch) =>
        ch.id !== chapterId
          ? ch
          : {
              ...ch,
              scenes: ch.scenes.map((s) =>
                s.id !== sceneId
                  ? s
                  : {
                      ...s,
                      revision,
                      title: values.title || null,
                      status: values.status,
                      narrator: values.narrator || null,
                      time: values.time || null,
                      place: values.place || null,
                      participants: values.participants
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean),
                      backgroundImage: values.backgroundImage || null,
                      body: values.body
                    }
              )
            }
      );
      return true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Save failed';
      return false;
    } finally {
      saving = false;
    }
  }

  // Debounced autosave: the cleanup cancels the pending timer on every keystroke,
  // so the write only happens once typing pauses.
  $effect(() => {
    if (!dirty || !canEdit || saving || conflict) return;
    const timer = setTimeout(() => void saveScene(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  });

  beforeNavigate((navigation) => {
    if (!canEdit || !dirty) return;
    navigation.cancel();
    if (navigation.willUnload) return;
    const target = navigation.to?.url;
    void saveScene().then((saved) => {
      if (saved && target) void goto(target);
    });
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (activeSceneId) void saveScene();
    }
  }

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }

  function toggleChapter(id: string) {
    const next = new Set(expandedChapters);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedChapters = next;
  }

  function handleChapterDragStart(e: DragEvent, id: string) {
    dragChapterId = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleChapterDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragChapterId || dragChapterId === targetId) return;
    const ids = chapters.map((c) => c.id);
    const fromIdx = ids.indexOf(dragChapterId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragChapterId);
    submitChapterReorder(ids);
    dragChapterId = null;
  }

  function handleSceneDragStart(e: DragEvent, sceneId: string) {
    dragSceneId = sceneId;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleSceneDrop(e: DragEvent, chapterId: string, targetId: string) {
    e.preventDefault();
    if (!dragSceneId || dragSceneId === targetId) return;
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const ids = chapter.scenes.map((s) => s.id);
    const fromIdx = ids.indexOf(dragSceneId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragSceneId);
    submitSceneReorder(chapterId, ids);
    dragSceneId = null;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  async function submitChapterReorder(ids: string[]) {
    const form = new FormData();
    form.set('chapterIds', JSON.stringify(ids));
    await fetch('?/reorderChapters', { method: 'POST', body: form });
    await invalidateAll();
  }

  async function submitSceneReorder(chapterId: string, ids: string[]) {
    const form = new FormData();
    form.set('chapterId', chapterId);
    form.set('sceneIds', JSON.stringify(ids));
    await fetch('?/reorderScenes', { method: 'POST', body: form });
    await invalidateAll();
  }

  /** Open a scene created by the server action as soon as it appears in the tree. */
  function openSceneById(sceneId: string) {
    for (const ch of chapters) {
      const scene = ch.scenes.find((s) => s.id === sceneId);
      if (scene) {
        expandedChapters = new Set([...expandedChapters, ch.id]);
        loadScene(scene, ch.id);
        return;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onbeforeunload={handleBeforeUnload} />

<Dialog.Root bind:open={showExport}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Export Manuscript</Dialog.Title>
      <Dialog.Description>
        Opens a print-ready page — use your browser's Print dialog to save it as PDF.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 text-sm">
      <div class="space-y-1">
        <Label for="export-author">Author name</Label>
        <Input id="export-author" bind:value={exportAuthor} placeholder="Shown on the title page" />
      </div>

      <div class="space-y-1">
        <Label for="export-delimiter">Scene delimiter</Label>
        <Input id="export-delimiter" bind:value={exportDelimiter} placeholder="* * *" />
      </div>

      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={exportTitlePage} class="rounded border-input" />
        Title page
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={exportToc} class="rounded border-input" />
        Table of contents
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={exportSceneTitles} class="rounded border-input" />
        Scene titles
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={exportSceneMeta} class="rounded border-input" />
        Scene narrator / time / place
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={exportNumberedChapters} class="rounded border-input" />
        Number chapters instead of titling them
      </label>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showExport = false)}>Cancel</Button>
      <Button
        onclick={() => {
          showExport = false;
          window.open(exportUrl, '_blank');
        }}
      >
        <Download class="h-4 w-4" />
        Open
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<svelte:head>
  <title
    >{page.data?.story?.title || 'Story'} — {page.data?.projectName || 'Project'} — DreamForge</title
  >
</svelte:head>

<div class="flex h-[calc(100vh-4rem)]">
  <!-- Left panel: chapter/scene tree — hidden while writing in Zen mode -->
  <div
    class="w-72 flex-shrink-0 overflow-y-auto border-r border-border bg-card p-4 sm:w-80"
    class:hidden={zen.active}
  >
    <div class="mb-4">
      <a
        href="/projects/{page.params.id}/stories"
        class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="h-4 w-4" />
        Back
      </a>
      <div class="mt-2 flex items-center justify-between">
        {#if editingStoryTitle}
          <form
            method="POST"
            action="?/updateStory"
            class="flex flex-1 items-center gap-1"
            use:enhance={() => {
              return async ({ result, update }) => {
                if (result.type === 'success') editingStoryTitle = false;
                await update({ reset: false });
              };
            }}
          >
            <Input name="title" value={page.data?.story?.title || ''} class="h-7" required />
            <input type="hidden" name="description" value={page.data?.story?.description || ''} />
            <Button type="submit" size="xs">Save</Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onclick={() => (editingStoryTitle = false)}
            >
              Cancel
            </Button>
          </form>
        {:else}
          <button
            type="button"
            class="truncate text-left text-lg font-semibold hover:underline"
            title="Rename story"
            onclick={() => (editingStoryTitle = true)}
            disabled={!canEdit}
          >
            {page.data?.story?.title || 'Story'}
          </button>
        {/if}
        <div class="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="xs" onclick={() => (showExport = true)}>
            <Download class="h-3 w-3" />
            Export
          </Button>
          <Button
            href="/projects/{page.params.id}/stories/{page.params.storyId}/summaries"
            variant="outline"
            size="xs"
          >
            <LayoutList class="h-3 w-3" />
            Summaries
          </Button>
        </div>
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        {formatWordCount(storyWords)} words
        {#if sessionWords > 0}
          <span class="text-primary">· +{formatWordCount(sessionWords)} this session</span>
        {/if}
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {#each STATUS_ORDER as option (option)}
          {#if statusCounts[option] > 0}
            <span class="flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full {STATUS_DOTS[option]}"></span>
              {statusCounts[option]}
              {STATUS_LABELS[option].toLowerCase()}
            </span>
          {/if}
        {/each}
      </p>
    </div>

    <Button
      variant="outline"
      class="mb-4 w-full border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
      onclick={() => (showCreateChapter = !showCreateChapter)}
    >
      <Plus class="h-4 w-4" />
      Add Chapter
    </Button>

    {#if showCreateChapter}
      <div class="mb-4 rounded-lg border border-border bg-background p-3">
        <form
          method="POST"
          action="?/createChapter"
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === 'success') {
                showCreateChapter = false;
                chapterTitle = '';
                await update();
              }
            };
          }}
        >
          <Input
            name="title"
            type="text"
            required
            bind:value={chapterTitle}
            class="mb-2"
            placeholder="Chapter title"
          />
          <div class="flex gap-1">
            <Button type="submit" size="xs">Create</Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onclick={() => (showCreateChapter = false)}>Cancel</Button
            >
          </div>
        </form>
      </div>
    {/if}

    <div class="space-y-2">
      {#each chapters as chapter, i (chapter.id)}
        <div
          class="rounded-lg border border-border"
          draggable="true"
          role="listitem"
          ondragstart={(e) => handleChapterDragStart(e, chapter.id)}
          ondragover={handleDragOver}
          ondrop={(e) => handleChapterDrop(e, chapter.id)}
        >
          <div
            class="group flex cursor-pointer items-center gap-1 px-3 py-2 hover:bg-secondary/50"
            onclick={() => toggleChapter(chapter.id)}
            role="button"
            tabindex="0"
            onkeypress={(e) => {
              if (e.key === 'Enter') toggleChapter(chapter.id);
            }}
          >
            <GripVertical class="h-3 w-3 cursor-grab text-muted-foreground opacity-40" />
            <span class="text-xs text-muted-foreground">{i + 1}</span>
            {#if renamingChapterId === chapter.id}
              <form
                method="POST"
                action="?/renameChapter"
                class="flex flex-1 items-center gap-1"
                onclick={(e) => e.stopPropagation()}
                use:enhance={() => {
                  return async ({ result, update }) => {
                    if (result.type === 'success') renamingChapterId = null;
                    await update({ reset: false });
                  };
                }}
              >
                <input type="hidden" name="chapterId" value={chapter.id} />
                <Input name="title" value={chapter.title} class="h-6 text-sm" required autofocus />
                <Button type="submit" size="xs">Save</Button>
              </form>
            {:else}
              <span
                class="flex-1 truncate text-sm font-medium"
                title="Double-click to rename"
                ondblclick={(e) => {
                  e.stopPropagation();
                  if (canEdit) renamingChapterId = chapter.id;
                }}
                role="presentation"
              >
                {chapter.title}
              </span>
            {/if}
            <span class="text-xs text-muted-foreground">
              {formatWordCount(chapterWords(chapter))}w
            </span>
            <div
              class="opacity-0 group-hover:opacity-100"
              onclick={(e) => e.stopPropagation()}
              onkeypress={(e) => {
                if (e.key === 'Enter') e.stopPropagation();
              }}
              role="button"
              tabindex="-1"
            >
              <form method="POST" action="?/deleteChapter">
                <input type="hidden" name="chapterId" value={chapter.id} />
                <Button type="submit" variant="ghost" size="icon-xs" aria-label="Delete chapter">
                  <Trash2 class="h-3 w-3 text-destructive" />
                </Button>
              </form>
            </div>
            {#if expandedChapters.has(chapter.id)}
              <ChevronDown class="h-3 w-3 text-muted-foreground" />
            {:else}
              <ChevronRight class="h-3 w-3 text-muted-foreground" />
            {/if}
          </div>

          {#if expandedChapters.has(chapter.id)}
            <div class="border-t border-border pb-2">
              {#each chapter.scenes as scene, j (scene.id)}
                <div
                  class="group flex cursor-pointer items-center gap-1 px-3 py-1.5 pl-6 text-sm"
                  class:bg-secondary={activeSceneId === scene.id}
                  draggable="true"
                  role="button"
                  tabindex="0"
                  ondragstart={(e) => handleSceneDragStart(e, scene.id)}
                  ondragover={handleDragOver}
                  ondrop={(e) => handleSceneDrop(e, chapter.id, scene.id)}
                  onclick={() => openScene(scene, chapter.id)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') openScene(scene, chapter.id);
                  }}
                >
                  <GripVertical
                    class="h-3 w-3 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100"
                  />
                  <span
                    class="h-1.5 w-1.5 shrink-0 rounded-full {STATUS_DOTS[scene.status || 'draft']}"
                    title={STATUS_LABELS[scene.status || 'draft']}
                  ></span>
                  <span class="flex-1 truncate">{scene.title || `Scene ${j + 1}`}</span>
                  <span class="text-xs text-muted-foreground group-hover:hidden">
                    {formatWordCount(countWords(scene.body))}
                  </span>
                  <div
                    class="hidden group-hover:block"
                    onclick={(e) => e.stopPropagation()}
                    onkeypress={(e) => {
                      if (e.key === 'Enter') e.stopPropagation();
                    }}
                    role="button"
                    tabindex="-1"
                  >
                    <form method="POST" action="?/deleteScene">
                      <input type="hidden" name="chapterId" value={chapter.id} />
                      <input type="hidden" name="sceneId" value={scene.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Delete scene"
                      >
                        <Trash2 class="h-3 w-3 text-destructive" />
                      </Button>
                    </form>
                  </div>
                </div>
              {/each}
              <form
                method="POST"
                action="?/createScene"
                class="px-3 pt-1"
                use:enhance={() => {
                  return async ({ result, update }) => {
                    if (result.type === 'success') {
                      const created = (result.data as { sceneId?: string })?.sceneId;
                      await update();
                      if (created) openSceneById(created);
                    }
                  };
                }}
              >
                <input type="hidden" name="chapterId" value={chapter.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="xs"
                  class="text-muted-foreground hover:text-foreground"
                >
                  <Plus class="h-3 w-3" /> Add Scene
                </Button>
              </form>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Right panel: scene editor -->
  <div class="flex-1 overflow-y-auto">
    {#if activeSceneId}
      <div class="p-6">
        <div class="mb-4 flex items-center justify-between gap-3">
          <input
            type="text"
            bind:value={sceneTitle}
            class="min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold outline-none"
            placeholder="Scene title..."
          />
          <div class="flex items-center gap-2" class:hidden={zen.active}>
            <div class="flex items-center gap-1 rounded-full border border-border p-0.5">
              {#each STATUS_ORDER as option (option)}
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  class:bg-secondary={sceneStatus === option}
                  class:text-muted-foreground={sceneStatus !== option}
                  disabled={!canEdit}
                  onclick={() => (sceneStatus = option)}
                >
                  <span class="h-1.5 w-1.5 rounded-full {STATUS_DOTS[option]}"></span>
                  {STATUS_LABELS[option]}
                </button>
              {/each}
            </div>
            <span class="whitespace-nowrap text-xs text-muted-foreground">
              {formatWordCount(sceneWords)} words
            </span>
            <span
              class="flex items-center gap-1 whitespace-nowrap text-xs"
              class:text-destructive={saveError}
              class:text-muted-foreground={!saveError}
            >
              {#if saveError}
                <CloudOff class="h-3 w-3" />
                {saveError}
                {#if conflict}
                  <button type="button" onclick={() => window.location.reload()}
                    >Reload latest</button
                  >
                  <button
                    type="button"
                    onclick={() => {
                      if (window.confirm('Overwrite the changes made elsewhere?'))
                        void saveScene(true);
                    }}>Overwrite with my edits</button
                  >
                {/if}
              {:else if saving}
                <Loader2 class="h-3 w-3 animate-spin" />
                Saving…
              {:else if dirty}
                Unsaved changes
              {:else if lastSavedAt}
                <Check class="h-3 w-3" />
                Saved
              {/if}
            </span>
            <Button onclick={() => saveScene()} disabled={saving || !dirty || !canEdit}>
              <Save class="h-4 w-4" />
              Save
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={zen.active ? 'Exit focus mode' : 'Focus mode (F11)'}
              aria-label={zen.active ? 'Exit focus mode' : 'Focus mode'}
              onclick={() => zen.toggle()}
            >
              <Scan class="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title="Convert to Note"
              aria-label="Convert to Note"
              onclick={async () => {
                const f = new FormData();
                f.set('chapterId', activeChapterId);
                f.set('sceneId', activeSceneId || '');
                await fetch('?/convertToNote', { method: 'POST', body: f });
                savedSnapshot = JSON.stringify(currentValues());
                await invalidateAll();
                await closeScene();
              }}
            >
              <SwitchCamera class="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" onclick={closeScene}>Close</Button>
          </div>
        </div>

        <div class="mb-4 flex flex-wrap gap-4 text-sm" class:hidden={zen.active}>
          <div class="flex items-center gap-2">
            <label for="scene-narrator" class="text-muted-foreground">Narrator:</label>
            <Input
              id="scene-narrator"
              type="text"
              list="scene-characters"
              bind:value={sceneNarrator}
              class="h-7 w-auto"
              placeholder="Who narrates?"
            />
          </div>
          <div class="flex items-center gap-2">
            <label for="scene-time" class="text-muted-foreground">Time:</label>
            <Input
              id="scene-time"
              type="text"
              bind:value={sceneTime}
              class="h-7 w-auto"
              placeholder="When?"
            />
          </div>
          <div class="flex items-center gap-2">
            <label for="scene-place" class="text-muted-foreground">Place:</label>
            <Input
              id="scene-place"
              type="text"
              list="scene-locations"
              bind:value={scenePlace}
              class="h-7 w-auto"
              placeholder="Where?"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">Participants:</span>
            <EntityPicker
              entities={pickerEntities}
              bind:value={sceneParticipants}
              types={['character', 'organization', 'species']}
              placeholder="Add character"
              searchPlaceholder="Search characters…"
              disabled={!canEdit}
            />
          </div>
          <div class="flex items-center gap-2">
            <Image class="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              bind:value={sceneBackgroundImage}
              class="h-7 w-auto"
              placeholder="Background image URL for Zen Mode"
            />
          </div>
        </div>

        <datalist id="scene-characters">
          {#each pickerEntities.filter((e) => e.type === 'character') as entity (entity.id)}
            <option value={entity.name}></option>
          {/each}
        </datalist>
        <datalist id="scene-locations">
          {#each pickerEntities.filter((e) => e.type === 'location') as entity (entity.id)}
            <option value={entity.name}></option>
          {/each}
        </datalist>

        {#if zen.active}
          <div
            class="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-full border border-border bg-card/90 px-4 py-2 text-xs shadow-lg backdrop-blur"
          >
            <span>{formatWordCount(sceneWords)} words</span>
            {#if sessionWords > 0}
              <span class="text-primary">+{formatWordCount(sessionWords)} this session</span>
            {/if}
            <span class="text-muted-foreground">
              {#if saveError}
                {saveError}
              {:else if saving}
                Saving…
              {:else if dirty}
                Unsaved
              {:else}
                Saved
              {/if}
            </span>
            <Button variant="ghost" size="xs" onclick={() => zen.toggle()}>Exit</Button>
          </div>
        {/if}

        {#key activeSceneId}
          <Editor
            content={sceneBody}
            entities={page.data?.entities || []}
            images={page.data?.images || []}
            projectId={page.params.id || ''}
            onUpdate={(md) => (sceneBody = md)}
          />
        {/key}
      </div>
    {:else}
      <div class="flex h-full items-center justify-center text-muted-foreground">
        <div class="text-center">
          <BookOpen class="mx-auto h-12 w-12 opacity-20" />
          <p class="mt-2">Select a scene to start writing</p>
        </div>
      </div>
    {/if}
  </div>
</div>
