<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import * as Command from '$lib/components/ui/command/index.js';
  import { fuzzyFilter } from '$lib/utils/fuzzy';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import { ENTITY_LABELS, ENTITY_PLURAL } from '$lib/entityFields';
  import { getTheme } from '$lib/stores/theme.svelte';
  import { getZenMode } from '$lib/stores/zenMode.svelte';
  import { getOverlays } from '$lib/stores/overlays.svelte';
  import type { EntityType } from '$lib/types';
  import {
    LayoutDashboard,
    BookOpenText,
    Clock,
    GitBranch,
    Search,
    Image as ImageIcon,
    Settings,
    Trash2,
    Sparkles,
    SunMoon,
    Scan,
    Download,
    Plus,
    FileText,
    Users,
    Building2,
    MapPin,
    Globe,
    Bug,
    Package,
    BookOpen
  } from '@lucide/svelte';

  interface PaletteEntity {
    id: string;
    type: EntityType;
    name: string;
    tags: string[];
  }

  interface PaletteScene {
    id: string;
    storyId: string;
    storyTitle: string;
    chapterTitle: string;
    title: string;
  }

  interface PaletteStory {
    id: string;
    title: string;
  }

  const theme = getTheme();
  const zen = getZenMode();
  const palette = getOverlays().palette;

  const ENTITY_ICONS: Record<EntityType, typeof Users> = {
    character: Users,
    organization: Building2,
    location: MapPin,
    culture: Globe,
    species: Bug,
    item: Package,
    note: FileText
  };

  let query = $state('');
  let entities = $state<PaletteEntity[]>([]);
  let scenes = $state<PaletteScene[]>([]);
  let stories = $state<PaletteStory[]>([]);
  let loadedFor = $state('');
  let loading = $state(false);

  let projectId = $derived(page.params?.id || page.data?.projectId || '');

  interface Action {
    id: string;
    label: string;
    group: 'Navigate' | 'Create' | 'View';
    icon: typeof Users;
    keywords: string[];
    run: () => void;
  }

  function nav(path: string) {
    return () => goto(path);
  }

  let actions = $derived.by<Action[]>(() => {
    if (!projectId) return [];
    const base = `/projects/${projectId}`;

    const navigate: Action[] = [
      { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, run: nav(base) },
      { id: 'nav-stories', label: 'Stories', icon: BookOpenText, run: nav(`${base}/stories`) },
      { id: 'nav-plots', label: 'Plots', icon: Sparkles, run: nav(`${base}/plots`) },
      { id: 'nav-timelines', label: 'Timelines', icon: Clock, run: nav(`${base}/timelines`) },
      { id: 'nav-relations', label: 'Relations', icon: GitBranch, run: nav(`${base}/relations`) },
      { id: 'nav-search', label: 'Search', icon: Search, run: nav(`${base}/search`) },
      { id: 'nav-images', label: 'Images', icon: ImageIcon, run: nav(`${base}/images`) },
      { id: 'nav-settings', label: 'Settings', icon: Settings, run: nav(`${base}/settings`) },
      { id: 'nav-trash', label: 'Trash', icon: Trash2, run: nav(`${base}/trash`) },
      { id: 'nav-projects', label: 'All Projects', icon: BookOpen, run: nav('/projects') }
    ].map((a) => ({ ...a, group: 'Navigate' as const, keywords: ['go to', a.label] }));

    for (const type of Object.keys(ENTITY_LABELS) as EntityType[]) {
      navigate.push({
        id: `nav-${type}`,
        label: ENTITY_PLURAL[type],
        group: 'Navigate',
        icon: ENTITY_ICONS[type],
        keywords: ['go to', ENTITY_PLURAL[type]],
        run: nav(`${base}/${entityTypeToRoute(type)}`)
      });
    }

    const create: Action[] = (Object.keys(ENTITY_LABELS) as EntityType[]).map((type) => ({
      id: `new-${type}`,
      label: `New ${ENTITY_LABELS[type]}`,
      group: 'Create',
      icon: Plus,
      keywords: ['create', 'add', ENTITY_LABELS[type]],
      run: nav(`${base}/${entityTypeToRoute(type)}?new=1`)
    }));

    create.push({
      id: 'new-story',
      label: 'New Story',
      group: 'Create',
      icon: Plus,
      keywords: ['create', 'add', 'story'],
      run: nav(`${base}/stories?new=1`)
    });

    const view: Action[] = [
      {
        id: 'view-theme',
        label: 'Toggle Light / Dark Theme',
        group: 'View',
        icon: SunMoon,
        keywords: ['dark mode', 'light mode', 'appearance'],
        run: () => theme.toggle()
      },
      {
        id: 'view-export',
        label: 'Export Project as ZIP',
        group: 'View',
        icon: Download,
        keywords: ['download', 'backup', 'archive'],
        run: () => (window.location.href = `${base}/export`)
      }
    ];

    if (page.params?.storyId)
      view.push({
        id: 'view-zen',
        label: zen.active ? 'Exit focus mode' : 'Enter focus mode',
        group: 'View',
        icon: Scan,
        keywords: ['zen', 'focus', 'distraction free', 'fullscreen'],
        run: () => zen.toggle()
      });

    return [...navigate, ...create, ...view];
  });

  let filteredActions = $derived(
    fuzzyFilter(actions, query, (a) => [a.label, ...a.keywords], query ? 8 : 6)
  );
  let filteredEntities = $derived(
    fuzzyFilter(entities, query, (e) => [e.name, ENTITY_LABELS[e.type], ...e.tags], 8)
  );
  let filteredScenes = $derived(
    fuzzyFilter(scenes, query, (s) => [s.title, s.chapterTitle, s.storyTitle], 6)
  );
  let filteredStories = $derived(fuzzyFilter(stories, query, (s) => [s.title], 4));

  let hasResults = $derived(
    filteredActions.length + filteredEntities.length + filteredScenes.length > 0
  );

  async function loadData() {
    if (!projectId || loadedFor === projectId || loading) return;
    loading = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/palette`);
      if (res.ok) {
        const data = await res.json();
        entities = data.entities || [];
        scenes = data.scenes || [];
        stories = data.stories || [];
        loadedFor = projectId;
      }
    } catch {
      // Palette content is best-effort; the static actions still work offline.
    } finally {
      loading = false;
    }
  }

  function run(action: () => void) {
    palette.open = false;
    query = '';
    action();
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.toggle();
    }
  }

  $effect(() => {
    if (palette.open) {
      query = '';
      loadData();
    }
  });

  // The palette caches per project, so switching projects must drop stale content.
  $effect(() => {
    if (projectId !== loadedFor) {
      entities = [];
      scenes = [];
      stories = [];
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog bind:open={palette.open} shouldFilter={false} loop title="Command Palette">
  <Command.Input placeholder="Search entities, scenes, and commands…" bind:value={query} />
  <Command.List>
    {#if !hasResults}
      <Command.Empty>
        {loading ? 'Loading…' : 'No matches.'}
      </Command.Empty>
    {/if}

    {#if filteredEntities.length > 0}
      <Command.Group heading="Entities">
        {#each filteredEntities as entity (entity.id)}
          {@const Icon = ENTITY_ICONS[entity.type]}
          <Command.Item
            value={`entity-${entity.id}`}
            onSelect={() =>
              run(() =>
                goto(`/projects/${projectId}/${entityTypeToRoute(entity.type)}/${entity.id}`)
              )}
          >
            <Icon class="h-4 w-4 text-muted-foreground" />
            <span class="truncate">{entity.name}</span>
            <span class="ml-auto text-xs text-muted-foreground">{ENTITY_LABELS[entity.type]}</span>
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    {#if filteredScenes.length > 0}
      <Command.Group heading="Scenes">
        {#each filteredScenes as scene (scene.id)}
          <Command.Item
            value={`scene-${scene.id}`}
            onSelect={() =>
              run(() => goto(`/projects/${projectId}/stories/${scene.storyId}?scene=${scene.id}`))}
          >
            <FileText class="h-4 w-4 text-muted-foreground" />
            <span class="truncate">{scene.title}</span>
            <span class="ml-auto truncate text-xs text-muted-foreground">
              {scene.storyTitle} › {scene.chapterTitle}
            </span>
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    {#if filteredStories.length > 0}
      <Command.Group heading="Stories">
        {#each filteredStories as story (story.id)}
          <Command.Item
            value={`story-${story.id}`}
            onSelect={() => run(() => goto(`/projects/${projectId}/stories/${story.id}`))}
          >
            <BookOpenText class="h-4 w-4 text-muted-foreground" />
            <span class="truncate">{story.title}</span>
          </Command.Item>
        {/each}
      </Command.Group>
    {/if}

    {#each ['Navigate', 'Create', 'View'] as const as group (group)}
      {@const groupActions = filteredActions.filter((a) => a.group === group)}
      {#if groupActions.length > 0}
        <Command.Group heading={group}>
          {#each groupActions as action (action.id)}
            <Command.Item value={action.id} onSelect={() => run(action.run)}>
              <action.icon class="h-4 w-4 text-muted-foreground" />
              <span>{action.label}</span>
            </Command.Item>
          {/each}
        </Command.Group>
      {/if}
    {/each}
  </Command.List>
</Command.Dialog>
