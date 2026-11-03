<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { page } from '$app/state';
  import { entityTypeToRoute } from '$lib/utils/entityTypes';
  import { ENTITY_PLURAL, ENTITY_LABELS } from '$lib/entityFields';
  import type { EntityType } from '$lib/types';
  import { getTheme } from '$lib/stores/theme.svelte';
  import { getOverlays } from '$lib/stores/overlays.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { useSidebar } from '$lib/components/ui/sidebar/index.js';
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
    Image as ImageIcon,
    Settings,
    Trash2,
    CircleUser,
    ShieldCheck
  } from '@lucide/svelte';

  const theme = getTheme();
  const overlays = getOverlays();
  const sidebar = useSidebar();

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

  let base = $derived(`/projects/${page.params?.id}`);
  let counts = $derived((page.data?.entityCounts || {}) as Record<string, number>);

  let writeLinks = $derived([
    { label: 'Stories', icon: BookOpenText, section: 'stories' },
    { label: 'Plots', icon: Sparkles, section: 'plots' }
  ]);
  let worldLinks = $derived([
    { label: 'Relations', icon: GitBranch, section: 'relations' },
    { label: 'Timelines', icon: Clock, section: 'timelines' },
    { label: 'Images', icon: ImageIcon, section: 'images' }
  ]);
  let projectLinks = $derived([
    { label: 'Search', icon: Search, section: 'search' },
    { label: 'Settings', icon: Settings, section: 'settings' },
    { label: 'Trash', icon: Trash2, section: 'trash' }
  ]);

  function inSection(section: string) {
    let path = `${base}/${section}`;
    return page.url.pathname === path || page.url.pathname.startsWith(`${path}/`);
  }

  afterNavigate(() => {
    if (sidebar?.isMobile) sidebar.setOpenMobile(false);
  });

  async function logOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    await goto('/', { invalidateAll: true });
  }
</script>

{#snippet navLink(label: string, Icon: typeof Users, href: string, active: boolean)}
  <Sidebar.MenuItem>
    <Sidebar.MenuButton isActive={active} tooltipContent={label}>
      {#snippet child({ props })}
        <a {href} aria-current={active ? 'page' : undefined} {...props}>
          <Icon class="h-4 w-4" />
          <span>{label}</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
{/snippet}

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <div class="flex items-center gap-2 [&>span:last-child]:truncate">
      <Sidebar.Trigger class="max-md:hidden" />
      <span class="font-semibold">DreamForge</span>
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              onclick={() => {
                if (sidebar?.isMobile) sidebar.setOpenMobile(false);
                overlays.palette.toggle();
              }}
              tooltipContent="Quick Open"
            >
              <Command class="h-4 w-4" />
              <span>Quick Open</span>
              <kbd
                class="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground"
                >⌘K</kbd
              >
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          {@render navLink('Projects', House, '/projects', page.url.pathname === '/projects')}
          {#if page.params?.id}
            {@render navLink(
              page.data?.projectName || 'Dashboard',
              LayoutDashboard,
              base,
              page.url.pathname === base
            )}
          {/if}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if page.params?.id}
      <Sidebar.Group>
        <Sidebar.GroupLabel>Write</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each writeLinks as link (link.section)}
              {@render navLink(
                link.label,
                link.icon,
                `${base}/${link.section}`,
                inSection(link.section)
              )}
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      <Sidebar.Group>
        <Sidebar.GroupLabel>World</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each ENTITY_TYPES as type (type)}
              {@const Icon = ENTITY_ICONS[type]}
              {@const active = inSection(entityTypeToRoute(type))}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton isActive={active} tooltipContent={ENTITY_PLURAL[type]}>
                  {#snippet child({ props })}
                    <a
                      href={`${base}/${entityTypeToRoute(type)}`}
                      aria-current={active ? 'page' : undefined}
                      {...props}
                    >
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
            {#each worldLinks as link (link.section)}
              {@render navLink(
                link.label,
                link.icon,
                `${base}/${link.section}`,
                inSection(link.section)
              )}
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>

      <Sidebar.Group>
        <Sidebar.GroupLabel>Project</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each projectLinks as link (link.section)}
              {@render navLink(
                link.label,
                link.icon,
                `${base}/${link.section}`,
                inSection(link.section)
              )}
            {/each}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton tooltipContent="Export">
                {#snippet child({ props })}
                  <a href="{base}/export" download {...props}>
                    <Download class="h-4 w-4" />
                    <span>Export</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
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
                        href={`${base}/${entityTypeToRoute(bm.entityType)}/${bm.entityId}`}
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
      <Sidebar.MenuItem>
        <Sidebar.MenuButton onclick={() => theme.toggle()} tooltipContent="Toggle theme">
          <SunMoon class="h-4 w-4" />
          <span>Toggle theme</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          onclick={() => overlays.shortcuts.toggle()}
          tooltipContent="Keyboard shortcuts"
        >
          <Keyboard class="h-4 w-4" />
          <span>Shortcuts</span>
          <kbd class="ml-auto rounded border border-border px-1 text-[10px] text-muted-foreground">
            ?
          </kbd>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      {@render navLink('Account', CircleUser, '/account', page.url.pathname === '/account')}
      {#if page.data?.user?.isAdmin}
        {@render navLink(
          'Instance admin',
          ShieldCheck,
          '/admin',
          page.url.pathname.startsWith('/admin')
        )}
      {/if}
      <Sidebar.MenuItem>
        <!-- A button, not a link: link preloading or a cross-site link must not sign you out. -->
        <Sidebar.MenuButton onclick={logOut} tooltipContent="Log out">
          <LogOut class="h-4 w-4" />
          <span>Log out</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

  <Sidebar.Rail />
</Sidebar.Root>
