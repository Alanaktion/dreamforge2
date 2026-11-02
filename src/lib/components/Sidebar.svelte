<script lang="ts">
  import { page } from '$app/state';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import { ENTITY_PLURAL, ENTITY_LABELS } from '$lib/entityFields';
  import type { EntityType } from '$lib/types';
  import { getTheme } from '$lib/stores/theme.svelte';
  import { getZenMode } from '$lib/stores/zenMode.svelte';
  import { getOverlays } from '$lib/stores/overlays.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import {
    House,
    BookMarked,
    SunMoon,
    LogOut,
    Download,
    Search,
    Clock,
    LayoutDashboard,
    BookOpenText,
    GitBranch,
    Scan,
    Sparkles,
    Command,
    Keyboard,
    Users,
    Building2,
    MapPin,
    Globe,
    Bug,
    Package,
    FileText,
    Plus,
    ChevronRight
  } from '@lucide/svelte';

  const theme = getTheme();
  const zen = getZenMode();
  const overlays = getOverlays();

  const ENTITY_ICONS: Record<EntityType, typeof Users> = {
    character: Users,
    organization: Building2,
    location: MapPin,
    culture: Globe,
    species: Bug,
    item: Package,
    note: FileText
  };

  const ENTITY_TYPES = Object.keys(ENTITY_PLURAL) as EntityType[];

  let showMore = $state(false);

  let base = $derived(`/projects/${page.params?.id}`);
  let counts = $derived((page.data?.entityCounts || {}) as Record<string, number>);

  function inSection(section: string) {
    let path = `${base}/${section}`;
    return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
  }

  let onEntityRoute = $derived(
    ENTITY_TYPES.filter((t) => inSection(entityTypeToRoute(t)))[0] as EntityType | undefined
  );
  let primaryTypes = $derived(
    ENTITY_TYPES.filter((t) => t === 'character' || (counts[t] ?? 0) > 0 || t === onEntityRoute)
  );
  let moreTypes = $derived(ENTITY_TYPES.filter((t) => !primaryTypes.includes(t)));
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <div class="flex items-center gap-2 [&>span:last-child]:truncate">
      <Sidebar.Trigger />
      <span class="font-semibold">DreamForge</span>
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>General</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              onclick={() => overlays.palette.toggle()}
              tooltipContent="Command Palette"
            >
              <Command class="h-4 w-4" />
              <span>Quick Open</span>
              <kbd
                class="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground"
                >⌘K</kbd
              >
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.url.pathname === '/projects'}
              tooltipContent="Projects"
            >
              {#snippet child({ props })}
                <a href="/projects" {...props}>
                  <House class="h-4 w-4" />
                  <span>Projects</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if page.params?.id}
      <Sidebar.Group>
        <Sidebar.GroupLabel>Current Project</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={page.url.pathname === `/projects/${page.params.id}`}
                tooltipContent="Dashboard"
              >
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}`} {...props}>
                    <LayoutDashboard class="h-4 w-4" />
                    <span>Dashboard</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inSection('stories')} tooltipContent="Stories">
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}/stories`} {...props}>
                    <BookOpenText class="h-4 w-4" />
                    <span>Stories</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inSection('plots')} tooltipContent="Plots">
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}/plots`} {...props}>
                    <Sparkles class="h-4 w-4" />
                    <span>Plots</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inSection('timelines')} tooltipContent="Timelines">
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}/timelines`} {...props}>
                    <Clock class="h-4 w-4" />
                    <span>Timelines</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inSection('relations')} tooltipContent="Relations">
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}/relations`} {...props}>
                    <GitBranch class="h-4 w-4" />
                    <span>Relations</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={inSection('search')} tooltipContent="Search">
                {#snippet child({ props })}
                  <a href={`/projects/${page.params.id}/search`} {...props}>
                    <Search class="h-4 w-4" />
                    <span>Search</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      <Sidebar.Group>
        <Sidebar.GroupLabel>World</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each showMore ? ENTITY_TYPES : primaryTypes as type (type)}
              {@const Icon = ENTITY_ICONS[type]}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={inSection(entityTypeToRoute(type))}
                  tooltipContent={ENTITY_PLURAL[type]}
                >
                  {#snippet child({ props })}
                    <a href={`${base}/${entityTypeToRoute(type)}`} {...props}>
                      <Icon class="h-4 w-4" />
                      <span>{ENTITY_PLURAL[type]}</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
                {#if (counts[type] ?? 0) > 0}
                  <Sidebar.MenuBadge class="group-hover/menu-item:opacity-0">
                    {counts[type]}
                  </Sidebar.MenuBadge>
                {/if}
                <Sidebar.MenuAction showOnHover>
                  {#snippet child({ props })}
                    <a
                      href={`${base}/${entityTypeToRoute(type)}?new=1`}
                      aria-label="New {ENTITY_LABELS[type].toLowerCase()}"
                      title="New {ENTITY_LABELS[type].toLowerCase()}"
                      {...props}
                    >
                      <Plus />
                    </a>
                  {/snippet}
                </Sidebar.MenuAction>
              </Sidebar.MenuItem>
            {/each}

            {#if moreTypes.length > 0}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  onclick={() => (showMore = !showMore)}
                  tooltipContent={showMore ? 'Show fewer' : 'More types'}
                  class="text-muted-foreground"
                >
                  <ChevronRight
                    class="h-4 w-4 transition-transform {showMore ? 'rotate-90' : ''}"
                  />
                  <span>{showMore ? 'Fewer' : `More (${moreTypes.length})`}</span>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/if}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      {#if page.data?.bookmarks?.length > 0}
        <Sidebar.Group>
          <Sidebar.GroupLabel>
            <div class="flex items-center gap-2">
              <BookMarked class="h-3 w-3" />
              Bookmarks
            </div>
          </Sidebar.GroupLabel>
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each page.data.bookmarks as bm (bm.entityId)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton tooltipContent={bm.entityName || bm.entityId}>
                    {#snippet child({ props })}
                      <a
                        href={`/projects/${page.params.id}/${entityTypeToRoute(bm.entityType)}/${bm.entityId}`}
                        {...props}
                      >
                        <span class="truncate">{bm.entityName || bm.entityId}</span>
                      </a>
                    {/snippet}
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      {/if}
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      {#if page.params?.id}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton tooltipContent="Export Project">
            {#snippet child({ props }: { props: Record<string, unknown> })}
              <a href="/projects/{page.params.id}/export" {...props} target="_blank">
                <Download class="h-4 w-4" />
                <span>Export Project</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/if}
      <Sidebar.MenuItem>
        <Sidebar.MenuButton onclick={() => theme.toggle()} tooltipContent="Toggle Theme">
          <SunMoon class="h-4 w-4" />
          <span>Toggle Theme</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          onclick={() => zen.toggle()}
          tooltipContent={zen.active ? 'Exit Zen Mode' : 'Zen Mode'}
        >
          <Scan class="h-4 w-4" />
          <span>{zen.active ? 'Exit Zen Mode' : 'Zen Mode'}</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          onclick={() => overlays.shortcuts.toggle()}
          tooltipContent="Keyboard Shortcuts"
        >
          <Keyboard class="h-4 w-4" />
          <span>Shortcuts</span>
          <kbd class="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground">
            ?
          </kbd>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton tooltipContent="Account">
          {#snippet child({ props })}<a href="/account" {...props}
              ><Users class="h-4 w-4" /><span>Account</span></a
            >{/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton tooltipContent="Log Out">
          {#snippet child({ props })}
            <a href="/logout" {...props}>
              <LogOut class="h-4 w-4" />
              <span>Log Out</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

  <Sidebar.Rail />
</Sidebar.Root>
