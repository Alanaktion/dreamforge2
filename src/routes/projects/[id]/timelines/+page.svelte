<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { ApiError } from '$lib/api';
  import * as api from '$lib/api/timeline';
  import { Plus, Clock, Trash2, Edit, X, Filter, Search, Save, Calendar } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Combobox } from '$lib/components/ui/combobox';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';
  import type { TimelineEvent, CalendarConfig, EventFields } from '$lib/api/timeline';

  let showCreate = $state(false);
  let showCalendarSettings = $state(false);
  let editingEventId = $state<string | null>(null);

  let filterEntity = $state('');
  let filterSignificance = $state('');
  let filterEra = $state('');
  let searchQuery = $state('');

  let newYear = $state(new Date().getFullYear());
  let newMonth = $state('');
  let newDay = $state('');
  let newEra = $state('CE');
  let newTitle = $state('');
  let newDescription = $state('');
  let newSignificance = $state<'major' | 'minor' | 'trivial'>('minor');
  let newEntityIds = $state<string[]>([]);

  let editYear = $state(0);
  let editMonth = $state('');
  let editDay = $state('');
  let editEra = $state('');
  let editTitle = $state('');
  let editDescription = $state('');
  let editSignificance = $state<'major' | 'minor' | 'trivial'>('minor');
  let editEntityIds = $state<string[]>([]);

  let timelineEl = $state<HTMLDivElement | undefined>(undefined);
  let error = $state<string | null>(null);
  let calendarName = $state('');
  let calendarMonths = $state('');

  const projectId = $derived(page.params.id ?? '');
  const readOnly = $derived(page.data?.role === 'commenter');

  /** Runs a change and reloads the timeline. Returns whether the change went through. */
  async function run(change: () => Promise<unknown>): Promise<boolean> {
    let ok = false;
    try {
      await change();
      error = null;
      ok = true;
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
    }
    await invalidateAll().catch(() => {});
    return ok;
  }

  function optionalNumber(value: string | number | null | undefined): number | null {
    const text = value == null ? '' : String(value).trim();
    return text === '' ? null : Number(text);
  }

  async function saveCalendar(event: SubmitEvent) {
    event.preventDefault();
    const months = calendarMonths
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (await run(() => api.updateCalendar(projectId, calendarName, months)))
      showCalendarSettings = false;
  }

  async function createEvent(event: SubmitEvent) {
    event.preventDefault();
    const fields: EventFields = {
      year: Number(newYear),
      month: optionalNumber(newMonth),
      day: optionalNumber(newDay),
      era: newEra,
      title: newTitle,
      description: newDescription,
      significance: newSignificance,
      entityIds: newEntityIds
    };
    if (await run(() => api.createEvent(projectId, fields))) {
      showCreate = false;
      resetCreateForm();
    }
  }

  async function saveEvent(event: SubmitEvent, eventId: string) {
    event.preventDefault();
    const changes: EventFields = {
      year: Number(editYear),
      month: optionalNumber(editMonth),
      day: optionalNumber(editDay),
      era: editEra,
      title: editTitle,
      description: editDescription,
      significance: editSignificance,
      entityIds: editEntityIds
    };
    if (await run(() => api.updateEvent(projectId, eventId, changes))) closeEdit();
  }

  async function removeEvent(eventId: string) {
    if (!confirm('Delete this event?')) return;
    if (await run(() => api.deleteEvent(projectId, eventId))) closeEdit();
  }

  const timeline = $derived(
    page.data?.timeline as { calendar: CalendarConfig; events: TimelineEvent[] } | undefined
  );
  const events = $derived(timeline?.events || []);
  const calendar = $derived(timeline?.calendar || { name: 'Gregorian', months: [], epoch: 0 });
  const entities = $derived<Array<{ id: string; name: string; type: string }>>(
    page.data?.entities || []
  );

  const entityMap = $derived(new Map(entities.map((e) => [e.id, e])));

  function formatDateStr(event: TimelineEvent, cal: CalendarConfig): string {
    const parts: string[] = [];
    if (event.month && cal.months[event.month - 1]) {
      if (event.day) {
        parts.push(`${cal.months[event.month - 1]} ${event.day},`);
      } else {
        parts.push(`${cal.months[event.month - 1]},`);
      }
    }
    const yearStr =
      event.year < 0
        ? `${Math.abs(event.year)} ${event.era || 'BCE'}`
        : `${event.year} ${event.era || 'CE'}`;
    parts.push(yearStr.trim());
    return parts.join(' ');
  }

  const filteredEvents = $derived(
    events.filter((e) => {
      if (
        searchQuery &&
        !e.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !e.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      if (filterSignificance && e.significance !== filterSignificance) return false;
      if (filterEra && e.era !== filterEra) return false;
      if (filterEntity && !e.entityIds.includes(filterEntity)) return false;
      return true;
    })
  );

  const eras = $derived([...new Set(events.map((e) => e.era))].sort());

  const minYear = $derived(
    filteredEvents.length > 0 ? Math.min(...filteredEvents.map((e) => e.year)) : 0
  );
  const maxYear = $derived(
    filteredEvents.length > 0 ? Math.max(...filteredEvents.map((e) => e.year)) : 100
  );
  const yearSpan = $derived(Math.max(maxYear - minYear, 1));

  const YEAR_PADDING = 50;
  const SVG_HEIGHT = 300;
  const AXIS_Y = SVG_HEIGHT - 50;

  const pxPerYear = $derived(
    yearSpan <= 50
      ? 16
      : yearSpan <= 200
        ? 6
        : yearSpan <= 1000
          ? 2.5
          : yearSpan <= 5000
            ? 0.8
            : 0.3
  );

  const svgWidth = $derived(yearSpan * pxPerYear + YEAR_PADDING * 2);

  const TICK_INTERVAL = $derived(
    yearSpan <= 50
      ? 10
      : yearSpan <= 200
        ? 25
        : yearSpan <= 1000
          ? 100
          : yearSpan <= 5000
            ? 500
            : 1000
  );

  const tickYears = $derived(() => {
    const ticks: number[] = [];
    const start = Math.floor(minYear / TICK_INTERVAL) * TICK_INTERVAL;
    const end = Math.ceil(maxYear / TICK_INTERVAL) * TICK_INTERVAL;
    for (let y = start; y <= end; y += TICK_INTERVAL) {
      ticks.push(y);
    }
    return ticks;
  });

  function yearToX(year: number): number {
    return YEAR_PADDING + (year - minYear) * pxPerYear;
  }

  const eventPositions = $derived(() => {
    const positioned: Array<{
      event: TimelineEvent;
      x: number;
      y: number;
      label: 'above' | 'below';
    }> = [];
    const yearCounts = new Map<number, number>();

    for (const event of filteredEvents) {
      const x = yearToX(event.year);
      const count = yearCounts.get(event.year) || 0;
      yearCounts.set(event.year, count + 1);
      const yOffset = count * 35;
      const y = Math.min(AXIS_Y - 20 - yOffset, 40);
      const label = count % 2 === 0 ? 'above' : 'below';
      positioned.push({ event, x, y, label });
    }
    return positioned;
  });

  function resetCreateForm() {
    newYear = new Date().getFullYear();
    newMonth = '';
    newDay = '';
    newEra = 'CE';
    newTitle = '';
    newDescription = '';
    newSignificance = 'minor';
    newEntityIds = [];
  }

  function openEdit(event: TimelineEvent) {
    editingEventId = event.id;
    editYear = event.year;
    editMonth = event.month != null ? String(event.month) : '';
    editDay = event.day != null ? String(event.day) : '';
    editEra = event.era;
    editTitle = event.title;
    editDescription = event.description;
    editSignificance = event.significance;
    editEntityIds = [...event.entityIds];
  }

  function closeEdit() {
    editingEventId = null;
  }

  function significanceColor(sig: string): string {
    switch (sig) {
      case 'major':
        return '#f59e0b';
      case 'minor':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  }
</script>

<svelte:head>
  <title>Timelines — {page.data?.projectName || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-6">
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold">Timelines</h1>
      <p class="text-sm text-muted-foreground">{page.data?.projectName || 'Project'}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if !readOnly}
        <Button
          variant="outline"
          onclick={() => {
            calendarName = calendar.name;
            calendarMonths = calendar.months.join(', ');
            showCalendarSettings = !showCalendarSettings;
          }}
        >
          <Calendar class="h-4 w-4" />
          Calendar
        </Button>
        <Button onclick={() => (showCreate = !showCreate)}>
          <Plus class="h-4 w-4" />
          Add Event
        </Button>
      {/if}
    </div>
  </div>

  {#if error}
    <p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if showCalendarSettings}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">Calendar Settings</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onclick={() => (showCalendarSettings = false)}
          aria-label="Close calendar settings"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
      <form onsubmit={saveCalendar} class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <Label for="calendarName" class="text-xs text-muted-foreground">Calendar Name</Label>
            <Input id="calendarName" type="text" bind:value={calendarName} />
          </div>
          <div class="space-y-1">
            <Label for="months" class="text-xs text-muted-foreground"
              >Month Names (comma-separated)</Label
            >
            <Input id="months" type="text" bind:value={calendarMonths} class="font-mono" />
          </div>
        </div>
        <Button type="submit">
          <Save class="h-4 w-4" />
          Save Calendar
        </Button>
      </form>
    </div>
  {/if}

  {#if showCreate}
    <div class="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 class="mb-4 text-sm font-semibold">Add Event</h2>
      <form onsubmit={createEvent} class="space-y-3">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="space-y-1">
            <Label for="new-year" class="text-xs text-muted-foreground">Year</Label>
            <Input id="new-year" name="year" type="number" required bind:value={newYear} />
          </div>
          <div class="space-y-1">
            <Label for="new-month" class="text-xs text-muted-foreground">Month</Label>
            <Select type="single" bind:value={newMonth}>
              <SelectTrigger id="new-month" class="w-full">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {#each calendar.months as month, i}
                  <SelectItem value={String(i + 1)}>{month}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <Label for="new-day" class="text-xs text-muted-foreground">Day</Label>
            <Input id="new-day" name="day" type="number" min="1" max="31" bind:value={newDay} />
          </div>
          <div class="space-y-1">
            <Label for="new-era" class="text-xs text-muted-foreground">Era</Label>
            <Input id="new-era" name="era" type="text" bind:value={newEra} />
          </div>
        </div>
        <div class="space-y-1">
          <Label for="new-title" class="text-xs text-muted-foreground">Title</Label>
          <Input
            id="new-title"
            name="title"
            type="text"
            required
            bind:value={newTitle}
            placeholder="Event title..."
          />
        </div>
        <div class="space-y-1">
          <Label for="new-description" class="text-xs text-muted-foreground">Description</Label>
          <Textarea
            id="new-description"
            name="description"
            bind:value={newDescription}
            placeholder="Event description..."
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label for="new-significance" class="text-xs text-muted-foreground">Significance</Label>
            <Select type="single" bind:value={newSignificance}>
              <SelectTrigger id="new-significance" class="w-full">
                <SelectValue placeholder="Significance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="trivial">Trivial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <Label for="new-entities" class="text-xs text-muted-foreground">Linked Entities</Label>
            <Combobox
              options={entities
                .filter((e) => !newEntityIds.includes(e.id))
                .map((e) => ({ value: e.id, label: `${e.name} (${e.type})` }))}
              placeholder="Add entity..."
              onSelect={(val) => {
                if (val && !newEntityIds.includes(val)) newEntityIds = [...newEntityIds, val];
              }}
            />
            {#if newEntityIds.length > 0}
              <div class="mt-1 flex flex-wrap gap-1">
                {#each newEntityIds as eid}
                  {@const entity = entityMap.get(eid)}
                  {#if entity}
                    <Badge variant="secondary" class="gap-1">
                      {entity.name}
                      <button
                        type="button"
                        class="hover:text-destructive"
                        onclick={() => (newEntityIds = newEntityIds.filter((id) => id !== eid))}
                        aria-label="Remove {entity.name}"
                      >
                        <X class="h-3 w-3" />
                      </button>
                    </Badge>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="flex gap-2">
          <Button type="submit">Add Event</Button>
          <Button
            type="button"
            variant="outline"
            onclick={() => {
              showCreate = false;
              resetCreateForm();
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  {/if}

  {#if showCalendarSettings || showCreate || events.length > 0}
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="relative flex-1 min-w-[200px] max-w-xs">
        <Search
          class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          placeholder="Search events..."
          bind:value={searchQuery}
          class="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm"
        />
      </div>
      <Select type="single" bind:value={filterSignificance}>
        <SelectTrigger class="text-sm">
          <SelectValue placeholder="All significance" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All significance</SelectItem>
          <SelectItem value="major">Major</SelectItem>
          <SelectItem value="minor">Minor</SelectItem>
          <SelectItem value="trivial">Trivial</SelectItem>
        </SelectContent>
      </Select>
      <Select type="single" bind:value={filterEra}>
        <SelectTrigger class="text-sm">
          <SelectValue placeholder="All eras" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All eras</SelectItem>
          {#each eras as era}
            <SelectItem value={era}>{era}</SelectItem>
          {/each}
        </SelectContent>
      </Select>
      <Combobox
        bind:value={filterEntity}
        options={[
          { value: '', label: 'All entities' },
          ...entities.map((e) => ({ value: e.id, label: e.name }))
        ]}
        placeholder="All entities"
        class="w-40"
      />
    </div>
  {/if}

  {#if events.length === 0}
    <div class="flex flex-col items-center gap-3 py-16 text-muted-foreground">
      <Clock class="h-12 w-12 opacity-30" />
      <p class="text-sm">
        No timeline events yet. A timeline keeps your world's history straight, so you always know
        what happened before a scene. Add the first event to start a chronology.
      </p>
    </div>
  {:else if filteredEvents.length === 0}
    <div class="flex flex-col items-center gap-3 py-16 text-muted-foreground">
      <Filter class="h-12 w-12 opacity-30" />
      <p class="text-sm">No events match your filters.</p>
    </div>
  {:else}
    <div
      bind:this={timelineEl}
      class="mb-6 overflow-x-auto rounded-lg border border-border bg-card"
    >
      <svg width={svgWidth} height={SVG_HEIGHT} class="min-w-full">
        <line
          x1="0"
          y1={AXIS_Y}
          x2={svgWidth}
          y2={AXIS_Y}
          stroke="var(--border)"
          stroke-width="2"
        />

        {#each tickYears() as year}
          <g>
            <line
              x1={yearToX(year)}
              y1={AXIS_Y - 6}
              x2={yearToX(year)}
              y2={AXIS_Y + 6}
              stroke="var(--muted-foreground)"
              stroke-width="1"
            />
            <text
              x={yearToX(year)}
              y={AXIS_Y + 20}
              text-anchor="middle"
              fill="var(--muted-foreground)"
              font-size="11"
            >
              {year}
            </text>
          </g>
        {/each}

        {#each eventPositions() as { event, x, y, label }}
          <g
            class="cursor-pointer"
            onclick={() => openEdit(event)}
            role="button"
            tabindex="0"
            onkeypress={(e) => {
              if (e.key === 'Enter') openEdit(event);
            }}
          >
            <circle
              cx={x}
              cy={y}
              r={event.significance === 'major' ? 6 : event.significance === 'minor' ? 4.5 : 3}
              fill={significanceColor(event.significance)}
              stroke="var(--card)"
              stroke-width="2"
            />
            {#if label === 'above'}
              <line
                x1={x}
                y1={y +
                  (event.significance === 'major' ? 6 : event.significance === 'minor' ? 4.5 : 3)}
                x2={x}
                y2={y - 18}
                stroke="var(--border)"
                stroke-width="1"
              />
              <text
                {x}
                y={y - 22}
                text-anchor="middle"
                fill="var(--foreground)"
                font-size="11"
                font-weight="500"
              >
                {event.title.length > 30 ? event.title.slice(0, 30) + '...' : event.title}
              </text>
              <text
                {x}
                y={y - 10}
                text-anchor="middle"
                fill="var(--muted-foreground)"
                font-size="9"
              >
                {formatDateStr(event, calendar)}
              </text>
            {:else}
              <line
                x1={x}
                y1={y +
                  (event.significance === 'major' ? 6 : event.significance === 'minor' ? 4.5 : 3)}
                x2={x}
                y2={AXIS_Y - 14}
                stroke="var(--border)"
                stroke-width="1"
              />
              <text
                {x}
                y={AXIS_Y - 18}
                text-anchor="middle"
                fill="var(--foreground)"
                font-size="11"
                font-weight="500"
              >
                {event.title.length > 30 ? event.title.slice(0, 30) + '...' : event.title}
              </text>
            {/if}
          </g>
        {/each}
      </svg>
    </div>

    <div class="space-y-2">
      {#each filteredEvents as event}
        <div class="rounded-lg border border-border bg-card px-4 py-3">
          {#if editingEventId === event.id}
            <form onsubmit={(e) => saveEvent(e, event.id)} class="space-y-3">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="space-y-1">
                  <Label for="edit-year" class="text-xs text-muted-foreground">Year</Label>
                  <Input id="edit-year" name="year" type="number" required bind:value={editYear} />
                </div>
                <div class="space-y-1">
                  <Label for="edit-month" class="text-xs text-muted-foreground">Month</Label>
                  <Select type="single" bind:value={editMonth}>
                    <SelectTrigger id="edit-month" class="w-full">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {#each calendar.months as month, i}
                        <SelectItem value={String(i + 1)}>{month}</SelectItem>
                      {/each}
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-1">
                  <Label for="edit-day" class="text-xs text-muted-foreground">Day</Label>
                  <Input
                    id="edit-day"
                    name="day"
                    type="number"
                    min="1"
                    max="31"
                    bind:value={editDay}
                  />
                </div>
                <div class="space-y-1">
                  <Label for="edit-era" class="text-xs text-muted-foreground">Era</Label>
                  <Input id="edit-era" name="era" type="text" bind:value={editEra} />
                </div>
              </div>
              <div class="space-y-1">
                <Label for="edit-title" class="text-xs text-muted-foreground">Title</Label>
                <Input id="edit-title" name="title" type="text" required bind:value={editTitle} />
              </div>
              <div class="space-y-1">
                <Label for="edit-description" class="text-xs text-muted-foreground"
                  >Description</Label
                >
                <Textarea id="edit-description" name="description" bind:value={editDescription} />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <Label for="edit-significance" class="text-xs text-muted-foreground"
                    >Significance</Label
                  >
                  <Select type="single" bind:value={editSignificance}>
                    <SelectTrigger id="edit-significance" class="w-full">
                      <SelectValue placeholder="Significance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="trivial">Trivial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-1">
                  <Label for="edit-entities" class="text-xs text-muted-foreground"
                    >Linked Entities</Label
                  >
                  <Combobox
                    options={entities
                      .filter((e) => !editEntityIds.includes(e.id))
                      .map((e) => ({ value: e.id, label: `${e.name} (${e.type})` }))}
                    placeholder="Add entity..."
                    onSelect={(val) => {
                      if (val && !editEntityIds.includes(val))
                        editEntityIds = [...editEntityIds, val];
                    }}
                  />
                  {#if editEntityIds.length > 0}
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each editEntityIds as eid}
                        {@const entity = entityMap.get(eid)}
                        {#if entity}
                          <Badge variant="secondary" class="gap-1">
                            {entity.name}
                            <button
                              type="button"
                              class="hover:text-destructive"
                              onclick={() =>
                                (editEntityIds = editEntityIds.filter((id) => id !== eid))}
                              aria-label="Remove {entity.name}"
                            >
                              <X class="h-3 w-3" />
                            </button>
                          </Badge>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
              <div class="flex gap-2">
                <Button type="submit">
                  <Save class="h-4 w-4" />
                  Save
                </Button>
                <Button type="button" variant="outline" onclick={closeEdit}>Cancel</Button>
                <Button
                  type="button"
                  onclick={() => removeEvent(event.id)}
                  variant="destructive"
                  class="ml-auto"
                >
                  <Trash2 class="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </form>
          {:else}
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style="background-color: {significanceColor(event.significance)}"
                  ></span>
                  {#if readOnly}
                    <span class="truncate font-medium">{event.title}</span>
                  {:else}
                    <button
                      class="truncate text-left font-medium hover:underline"
                      onclick={() => openEdit(event)}
                    >
                      {event.title}
                    </button>
                  {/if}
                  <span
                    class={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                      event.significance === 'major' &&
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                      event.significance === 'minor' &&
                        'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                      event.significance === 'trivial' && 'bg-gray-500/10 text-gray-500'
                    )}
                  >
                    {event.significance}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {formatDateStr(event, calendar)}
                </p>
                {#if event.description}
                  <p class="mt-1 text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                {/if}
                {#if event.entityIds.length > 0}
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each event.entityIds as eid}
                      {@const entity = entityMap.get(eid)}
                      {#if entity}
                        <Badge variant="secondary">{entity.name}</Badge>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="flex shrink-0 items-center gap-1 ml-3">
                {#if !readOnly}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onclick={() => openEdit(event)}
                    aria-label="Edit event {event.title}"
                  >
                    <Edit class="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onclick={() => removeEvent(event.id)}
                    aria-label="Delete event {event.title}"
                  >
                    <Trash2 class="h-4 w-4 text-destructive" />
                  </Button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
