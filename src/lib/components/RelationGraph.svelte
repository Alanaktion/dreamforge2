<script lang="ts">
  import { onDestroy } from 'svelte';
  import cytoscape from 'cytoscape';
  import fcose from 'cytoscape-fcose';
  import avsdf from 'cytoscape-avsdf';
  import { goto } from '$app/navigation';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '$lib/components/ui/select';

  cytoscape.use(fcose);
  cytoscape.use(avsdf);

  let {
    entities = [],
    relations = [],
    projectId = '',
    class: className = '',
    ...restProps
  }: {
    entities: { id: string; name: string; type: string }[];
    relations: {
      sourceId: string;
      targetId: string;
      label?: string;
      relationType: string;
      id: string;
    }[];
    projectId: string;
    class?: string;
  } = $props();

  let container: HTMLDivElement;
  let cy: cytoscape.Core | null = null;
  let layout: cytoscape.Layouts | null = null;
  let layoutName = $state('fcose');
  let renderError = $state(false);

  interface GraphData {
    nodes: cytoscape.ElementDefinition[];
    edges: cytoscape.ElementDefinition[];
  }

  // Derived (not set from buildGraph) so the empty state is already correct during
  // SSR, where cytoscape never runs.
  let graph: GraphData = $derived.by(() => {
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    const edges: cytoscape.ElementDefinition[] = relations
      .filter((r) => entityMap.has(r.sourceId) && entityMap.has(r.targetId))
      .map((r) => ({
        data: {
          id: r.id,
          source: r.sourceId,
          target: r.targetId,
          label: r.label || r.relationType.replace(/_/g, ' '),
          relationType: r.relationType
        }
      }));

    const relatedIds = new Set<string>();
    for (const e of edges) {
      relatedIds.add(e.data.source as string);
      relatedIds.add(e.data.target as string);
    }

    const nodes: cytoscape.ElementDefinition[] = entities
      .filter((e) => relatedIds.has(e.id))
      .map((e) => ({ data: { id: e.id, name: e.name, type: e.type } }));

    return { nodes, edges };
  });

  const entityColors: Record<string, string> = {
    character: '#6366f1',
    organization: '#f59e0b',
    location: '#10b981',
    culture: '#ec4899',
    species: '#8b5cf6',
    item: '#14b8a6',
    note: '#6b7280'
  };

  const relationColors: Record<string, string> = {
    related_to: '#aeb3ba',
    member_of: '#3b82f6',
    leader_of: '#2563eb',
    owns: '#7c3aed',
    home: '#059669',
    enemy: '#dc2626',
    ally: '#0d9488',
    parent: '#8b5cf6',
    child: '#a78bfa',
    sibling: '#c084fc',
    mentor: '#06b6d4',
    student: '#22d3ee',
    friend: '#14b8a6',
    lover: '#e11d48',
    rival: '#f97316',
    located_in: '#10b981',
    part_of: '#34d399',
    created_by: '#d97706',
    used_by: '#f59e0b'
  };

  const relationDash: Record<string, string> = {
    mentor: '6 3',
    student: '6 3',
    parent: '4 2',
    child: '4 2',
    sibling: '4 2',
    enemy: '2 2',
    rival: '2 2'
  };

  function stopLayout() {
    try {
      layout?.stop();
    } catch {
      // layout already finished
    }
    layout = null;
  }

  // fcose/avsdf keep ticking asynchronously after stop()/destroy() and reach back
  // into the cytoscape core; destroying synchronously races that and throws
  // "can't access property ... T is null" from inside their own promise chain.
  // Deferring the destroy past the current task lets any in-flight tick finish
  // against a still-live core first.
  function destroyCy() {
    stopLayout();
    const instance = cy;
    cy = null;
    if (!instance) return;
    setTimeout(() => {
      try {
        instance.destroy();
      } catch {
        // already torn down
      }
    }, 0);
  }

  function buildGraph({ nodes, edges }: GraphData, currentLayout: string) {
    destroyCy();
    renderError = false;

    if (!container) return;

    // fcose throws from its internals when asked to lay out an empty graph, which
    // happens whenever entities exist but none of them are related to each other.
    if (nodes.length === 0) return;

    try {
      buildCytoscape(nodes, edges, currentLayout);
    } catch (err) {
      console.error('RelationGraph: failed to render graph', err);
      destroyCy();
      renderError = true;
    }
  }

  function buildCytoscape(
    nodes: cytoscape.ElementDefinition[],
    edges: cytoscape.ElementDefinition[],
    currentLayout: string
  ) {
    cy = cytoscape({
      container,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => entityColors[ele.data('type')] || '#6b7280',
            label: 'data(name)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-weight': 500,
            width: 140,
            'padding-left': 12,
            'padding-right': 12,
            height: 20,
            shape: 'round-rectangle',
            'border-width': 2,
            'border-color': (ele: any) => {
              return entityColors[ele.data('type')] || '#6b7280';
            },
            'border-opacity': 0.5
          }
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': (ele: any) => relationColors[ele.data('relationType')] || '#94a3b8',
            'target-arrow-color': (ele: any) =>
              relationColors[ele.data('relationType')] || '#94a3b8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': '10px',
            'text-margin-y': -6,
            color: '#94a3b8',
            'line-style': (ele: any) =>
              relationDash[ele.data('relationType')] ? 'dashed' : 'solid',
            'line-dash-pattern': (ele: any) => {
              const d = relationDash[ele.data('relationType')];
              // line-dash-pattern is typed as t.numbers, which rejects an empty
              // string ('' splits to [''], an unparseable "number"); [1, 0] is a
              // solid line with no visible gap.
              return d ? d.split(' ').map(Number) : [1, 0];
            }
          }
        }
      ] as any,
      elements: [...nodes, ...edges]
    });

    // Run the layout explicitly rather than via the constructor so it can be
    // stopped on teardown instead of settling against a destroyed instance.
    layout = cy.layout(buildLayoutOptions(currentLayout));
    layout.promiseOn('layoutstop').catch((err: unknown) => {
      console.error('RelationGraph: layout failed', err);
    });
    layout.run();

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      goto(`/projects/${projectId}/${node.data('type')}/${node.data('id')}`);
    });
  }

  function buildLayoutOptions(name: string): cytoscape.LayoutOptions {
    const base: Record<string, unknown> = { name, animate: false };
    if (name === 'avsdf') {
      base.nodeSeparation = 140;
      base.padding = 20;
    }
    return base as unknown as cytoscape.LayoutOptions;
  }

  function updateLayout(name: string) {
    layoutName = name;
  }

  $effect(() => {
    // Passed as arguments rather than read inside buildGraph so the effect always
    // registers both dependencies, even on a run that bails early.
    buildGraph(graph, layoutName);
  });

  // Not an $effect teardown: that also fires between re-runs, and tapping a node
  // calls goto(), so the unmount would destroy cytoscape from inside its own event
  // dispatch and throw. onDestroy only fires on unmount, and the destroy is deferred
  // past the current task so no cytoscape internals are still on the stack.
  onDestroy(destroyCy);
</script>

<div class="space-y-2 {className}" {...restProps}>
  <div class="flex items-center gap-2">
    <span class="text-xs text-muted-foreground">Layout:</span>
    <Select type="single" value={layoutName} onValueChange={(v: string) => updateLayout(v)}>
      <SelectTrigger class="h-7 w-32 text-xs">
        <SelectValue placeholder="Select layout..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fcose">fcose</SelectItem>
        <SelectItem value="concentric">Concentric</SelectItem>
        <SelectItem value="avsdf">Circle (AVSDF)</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <div class="relative overflow-hidden rounded-lg border border-border bg-card">
    <div
      bind:this={container}
      role="img"
      aria-label="Relation graph with {graph.nodes.length} entries and {graph.edges
        .length} relations. The same relations are listed below the graph."
      style="width: 100%; height: min(450px, 60vh);"
    ></div>
    {#if renderError}
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
      >
        Couldn't render the relationship graph.
      </div>
    {:else if graph.nodes.length === 0}
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground"
      >
        {#if entities.length === 0}
          No entities yet — create some to start mapping relationships.
        {:else}
          No relationships yet. Add one below to see the graph.
        {/if}
      </div>
    {/if}
  </div>
</div>
