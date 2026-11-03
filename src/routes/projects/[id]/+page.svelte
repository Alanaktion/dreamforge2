<script lang="ts">
  import { page } from '$app/state';
  import {
    BookOpen,
    Users,
    Building2,
    MapPin,
    Globe,
    Bug,
    Package,
    FileText,
    Clock,
    PenLine,
    Target,
    Flame
  } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { formatWordCount, readingMinutes } from '$lib/utils/wordCount';
  import { formatDate } from '$lib/utils';
  import { ENTITY_PLURAL } from '$lib/entityFields';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import type { EntityType, ProjectStats, WritingProgress } from '$lib/types';

  let stats = $derived((page.data?.stats || null) as ProjectStats | null);
  let progress = $derived((page.data?.progress || null) as WritingProgress | null);
  let projectId = $derived(page.params.id);

  let goalPercent = $derived(
    progress && progress.dailyGoal > 0
      ? Math.min(100, Math.round((progress.todayWords / progress.dailyGoal) * 100))
      : 0
  );
  let peakDay = $derived(progress ? Math.max(1, ...progress.recent.map((d) => d.words)) : 1);

  const ENTITY_ICONS: Record<EntityType, typeof Users> = {
    character: Users,
    organization: Building2,
    location: MapPin,
    culture: Globe,
    species: Bug,
    item: Package,
    note: FileText
  };

  let entityTypes = $derived(Object.keys(ENTITY_PLURAL) as EntityType[]);
</script>

<svelte:head>
  <title>{page.data?.project?.name || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-5xl p-6">
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">{page.data?.project?.name || 'Project'}</h1>
      {#if page.data?.project?.description}
        <p class="mt-1 text-muted-foreground">{page.data.project.description}</p>
      {/if}
    </div>
  </div>

  {#if stats}
    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-2xl font-semibold">{formatWordCount(stats.wordCount)}</div>
        <div class="text-xs text-muted-foreground">
          words · ~{readingMinutes(stats.wordCount)} min read
        </div>
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-2xl font-semibold">{stats.sceneCount}</div>
        <div class="text-xs text-muted-foreground">
          scenes in {stats.chapterCount}
          {stats.chapterCount === 1 ? 'chapter' : 'chapters'}
        </div>
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-2xl font-semibold">{stats.storyCount}</div>
        <div class="text-xs text-muted-foreground">
          {stats.storyCount === 1 ? 'story' : 'stories'}
        </div>
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-2xl font-semibold">{stats.totalEntities}</div>
        <div class="text-xs text-muted-foreground">world entries</div>
      </div>
    </div>

    {#if progress}
      <div class="mb-6 rounded-lg border border-border bg-card p-4">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="flex items-center gap-2 text-sm font-semibold">
            <Target class="h-4 w-4 text-primary" />
            Today
          </h2>
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            {#if progress.streak > 0}
              <span class="flex items-center gap-1 text-primary">
                <Flame class="h-3.5 w-3.5" />
                {progress.streak}-day streak
              </span>
            {/if}
            <span>{formatWordCount(progress.total30)} words in 30 days</span>
            <a class="hover:text-foreground" href="/projects/{projectId}/settings">Edit goal</a>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <div class="min-w-48 flex-1">
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="font-medium">
                {formatWordCount(progress.todayWords)}
                {#if progress.dailyGoal > 0}
                  <span class="text-muted-foreground">
                    / {formatWordCount(progress.dailyGoal)} words</span
                  >
                {:else}
                  <span class="text-muted-foreground"> words written</span>
                {/if}
              </span>
              {#if progress.dailyGoal > 0}
                <span class="text-xs text-muted-foreground">{goalPercent}%</span>
              {/if}
            </div>
            {#if progress.dailyGoal > 0}
              <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  class="h-full rounded-full transition-all"
                  class:bg-primary={goalPercent < 100}
                  class:bg-emerald-500={goalPercent >= 100}
                  style="width: {goalPercent}%"
                ></div>
              </div>
            {/if}
          </div>

          <div class="flex h-12 items-end gap-1" title="Words per day, last 14 days">
            {#each progress.recent as day (day.date)}
              <div
                class="w-2 rounded-sm bg-primary/70"
                class:bg-secondary={day.words === 0}
                style="height: {Math.max(2, Math.round((day.words / peakDay) * 48))}px"
                title="{day.date}: {formatWordCount(day.words)} words"
              ></div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <div class="mb-6 grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-border bg-card p-4">
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
          <PenLine class="h-4 w-4 text-primary" />
          Continue Writing
        </h2>
        {#if stats.lastScene}
          <a
            class="block rounded-md border border-border p-3 hover:bg-secondary"
            href="/projects/{projectId}/stories/{stats.lastScene.storyId}?scene={stats.lastScene
              .sceneId}"
          >
            <div class="font-medium">{stats.lastScene.title}</div>
            <div class="text-xs text-muted-foreground">{stats.lastScene.storyTitle}</div>
          </a>
        {:else}
          <p class="mb-3 text-sm text-muted-foreground">
            No scenes yet. Start a story and the last scene you touched shows up here.
          </p>
          <Button href="/projects/{projectId}/stories?new=1" size="sm">
            <BookOpen class="h-4 w-4" />
            Start a Story
          </Button>
        {/if}

        {#if stats.stories.length > 0}
          <div class="mt-4 space-y-2">
            {#each stats.stories as story (story.id)}
              {@const target = progress?.storyTargets?.[story.id] || 0}
              <a
                class="block rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
                href="/projects/{projectId}/stories/{story.id}"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate">{story.title}</span>
                  <span class="whitespace-nowrap text-xs text-muted-foreground">
                    {formatWordCount(story.wordCount)}
                    {#if target > 0}/ {formatWordCount(target)}{/if} words · {story.sceneCount} scenes
                  </span>
                </div>
                {#if target > 0}
                  <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      class="h-full rounded-full bg-primary"
                      style="width: {Math.min(100, Math.round((story.wordCount / target) * 100))}%"
                    ></div>
                  </div>
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Clock class="h-4 w-4 text-primary" />
          Recently Edited
        </h2>
        {#if stats.recent.length === 0}
          <p class="text-sm text-muted-foreground">Nothing edited yet.</p>
        {:else}
          <div class="space-y-1">
            {#each stats.recent as item (item.kind + item.id)}
              <a
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
                href={item.href}
              >
                {#if item.kind === 'scene'}
                  <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {:else}
                  {@const Icon = ENTITY_ICONS[item.context as EntityType] || FileText}
                  <Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {/if}
                <span class="truncate">{item.name}</span>
                <span class="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(item.modifiedAt)}
                </span>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <h2 class="mb-3 text-sm font-semibold text-muted-foreground">World</h2>
    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {#each entityTypes as type (type)}
        {@const Icon = ENTITY_ICONS[type]}
        <a
          href="/projects/{projectId}/{entityTypeToRoute(type)}"
          class="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center hover:bg-secondary"
        >
          <Icon class="h-6 w-6 text-primary" />
          <span class="text-xs font-medium">{ENTITY_PLURAL[type]}</span>
          <span class="text-xs text-muted-foreground">{stats.entityCounts[type] ?? 0}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>
