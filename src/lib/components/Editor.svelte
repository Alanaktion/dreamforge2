<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor, type Range } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
  import ImageExt from '@tiptap/extension-image';
  import BubbleMenu from '@tiptap/extension-bubble-menu';
  import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
  import { Markdown } from '@tiptap/markdown';
  import { HighlightMarkdown } from './highlight';
  import { MentionWithMarkdown } from './mentionMarkdown';
  import { SlashCommands } from './slashCommands';
  import {
    TOOLS,
    PINNED_STORAGE_KEY,
    parsePinned,
    togglePinned,
    toolTitle,
    formatKeys,
    type ToolId
  } from './editorTools';
  import * as Popover from '$lib/components/ui/popover';
  import { cn } from '$lib/utils';
  import {
    Bold,
    Italic,
    Strikethrough,
    Highlighter,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    SquareCode,
    Minus,
    Link as LinkIcon,
    Image as ImageIcon,
    Table as TableIcon,
    Ellipsis,
    SpellCheck,
    BetweenHorizontalStart,
    BetweenHorizontalEnd,
    BetweenVerticalStart,
    BetweenVerticalEnd,
    Trash2
  } from '@lucide/svelte';

  let {
    content = '',
    placeholder = 'Start writing... Type / for blocks, @ to mention.',
    entities = [],
    images = [],
    projectId = '',
    onUpdate,
    class: className = ''
  }: {
    content?: string;
    placeholder?: string;
    entities?: { id: string; type: string; name: string; status?: string }[];
    images?: { id: string; filename: string; originalName: string; altText?: string | null }[];
    projectId?: string;
    onUpdate?: (md: string) => void;
    class?: string;
  } = $props();

  const ICONS: Record<ToolId, typeof Bold> = {
    bold: Bold,
    italic: Italic,
    strike: Strikethrough,
    highlight: Highlighter,
    h1: Heading1,
    h2: Heading2,
    h3: Heading3,
    bullet: List,
    ordered: ListOrdered,
    blockquote: Quote,
    codeBlock: SquareCode,
    divider: Minus,
    link: LinkIcon,
    image: ImageIcon,
    table: TableIcon
  };

  const LANGUAGES = [
    ['en', 'English'],
    ['de', 'Deutsch'],
    ['es', 'español'],
    ['fr', 'français'],
    ['it', 'italiano'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['ms', 'Bahasa Melayu'],
    ['nl', 'Nederlands'],
    ['pt', 'Português'],
    ['ru', 'Русский язык'],
    ['zh', '中文']
  ];

  const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);

  let showImagePicker = $state(false);
  let overflowOpen = $state(false);
  let pinned = $state<ToolId[]>(parsePinned(localStorage.getItem(PINNED_STORAGE_KEY)));
  let pinnedTools = $derived(TOOLS.filter((t) => pinned.includes(t.id)));
  let overflowTools = $derived(TOOLS.filter((t) => !pinned.includes(t.id)));
  let revision = $state(0);

  function imageSrc(filename: string): string {
    return `/api/projects/${projectId}/images/${filename}`;
  }

  function insertImage(src: string, alt = '') {
    editor.chain().focus().setImage({ src, alt }).run();
    showImagePicker = false;
  }

  let editorEl: HTMLDivElement;
  let textBubbleEl: HTMLDivElement;
  let tableBubbleEl: HTMLDivElement;
  let editor: Editor;
  let mounted = $state(false);

  let spellcheckEnabled = $state(localStorage.getItem('editor:spellcheck') !== 'false');
  let editorLang = $state(localStorage.getItem('editor:lang') || 'en');
  let hoverMention = $state<{
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);

  function toggleSpellcheck() {
    spellcheckEnabled = !spellcheckEnabled;
    localStorage.setItem('editor:spellcheck', String(spellcheckEnabled));
  }

  function setLang(lang: string) {
    editorLang = lang;
    localStorage.setItem('editor:lang', lang);
  }

  function togglePin(id: ToolId) {
    pinned = togglePinned(pinned, id);
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinned));
  }

  function isActive(id: ToolId): boolean {
    void revision;
    if (!editor) return false;
    switch (id) {
      case 'h1':
        return editor.isActive('heading', { level: 1 });
      case 'h2':
        return editor.isActive('heading', { level: 2 });
      case 'h3':
        return editor.isActive('heading', { level: 3 });
      case 'bullet':
        return editor.isActive('bulletList');
      case 'ordered':
        return editor.isActive('orderedList');
      case 'divider':
      case 'image':
      case 'table':
        return false;
      default:
        return editor.isActive(id);
    }
  }

  function setupMentionHover() {
    const view = editor.view;
    if (!view) return;
    view.dom.addEventListener('mouseover', (e: MouseEvent) => {
      // Mention's own renderHTML uses data-type="mention" as its node-type
      // discriminator (for when a doc mixes multiple mention flavors), so the
      // entity's actual type lives in data-mention-type instead — see
      // mentionMarkdown.ts. The old code targeted `[data-mention]`, which nothing
      // ever rendered, so the hover card never fired.
      const target = (e.target as HTMLElement).closest('[data-type="mention"]');
      if (target instanceof HTMLElement) {
        hoverMention = {
          id: target.dataset.id || '',
          type: target.dataset.mentionType || '',
          label: target.textContent?.replace(/^@/, '') || '',
          x: e.clientX,
          y: e.clientY
        };
      } else {
        hoverMention = null;
      }
    });
    view.dom.addEventListener('mouseleave', () => {
      hoverMention = null;
    });
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMentionItems(props: any) {
    return props.items
      .map(
        (item: any, i: number) =>
          `<button class="${i === props.selectedIndex ? 'bg-accent' : ''} flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent" data-index="${i}">${escapeHtml(item.label)}<span class="ml-auto text-xs text-muted-foreground">${escapeHtml(item.type)}</span></button>`
      )
      .join('');
  }

  function bindMentionItems(dom: HTMLElement, props: any) {
    dom.innerHTML = renderMentionItems(props);
    dom.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.index || '0', 10);
        props.command({
          id: props.items[idx].id,
          type: props.items[idx].type,
          label: props.items[idx].label
        });
      });
    });
  }

  function positionDropdown(dom: HTMLElement, rect: DOMRect) {
    dom.style.position = 'fixed';
    dom.style.left = `${rect.left}px`;
    dom.style.top = `${rect.bottom + 4}px`;
    dom.style.zIndex = '100';
  }

  function runTool(id: ToolId, range?: Range) {
    const chain = editor.chain().focus();
    if (range) chain.deleteRange(range);
    switch (id) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'highlight':
        chain.toggleHighlight().run();
        break;
      case 'h1':
        chain.toggleHeading({ level: 1 }).run();
        break;
      case 'h2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'h3':
        chain.toggleHeading({ level: 3 }).run();
        break;
      case 'bullet':
        chain.toggleBulletList().run();
        break;
      case 'ordered':
        chain.toggleOrderedList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
      case 'divider':
        chain.setHorizontalRule().run();
        break;
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'link':
        chain.run();
        setLink();
        break;
      case 'image': {
        chain.run();
        if (projectId && images.length > 0) {
          showImagePicker = !showImagePicker;
          break;
        }
        const url = prompt('Enter image URL:');
        if (url) insertImage(url);
        break;
      }
    }
    overflowOpen = false;
  }

  onMount(() => {
    const mentionExt = MentionWithMarkdown.configure({
      HTMLAttributes: { class: 'mention-node' },
      suggestion: {
        items: ({ query }: { query: string }) => {
          return entities
            .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8)
            .map((e) => ({ id: e.id, type: e.type, label: e.name }));
        },
        render: () => {
          let dom: HTMLDivElement;
          return {
            onStart: (props: any) => {
              dom = document.createElement('div');
              dom.className = 'mention-dropdown';
              document.body.appendChild(dom);
              if (props.clientRect) positionDropdown(dom, props.clientRect());
              bindMentionItems(dom, props);
            },
            onUpdate: (props: any) => {
              if (props.clientRect) positionDropdown(dom, props.clientRect());
              bindMentionItems(dom, props);
            },
            onExit: () => {
              if (dom) dom.remove();
            }
          };
        }
      }
    });

    editor = new Editor({
      element: editorEl,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          link: false
        }),
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder }),
        ImageExt,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        HighlightMarkdown,
        Markdown.configure({
          indentation: { style: 'space', size: 2 }
        }),
        mentionExt,
        SlashCommands.configure({ run: (_editor, range, item) => runTool(item.id, range) }),
        BubbleMenu.configure({
          pluginKey: 'textBubble',
          element: textBubbleEl,
          appendTo: () => document.body,
          shouldShow: ({ editor: ed, from, to }) =>
            from !== to && !ed.isActive('codeBlock') && !ed.isActive('image')
        }),
        BubbleMenu.configure({
          pluginKey: 'tableBubble',
          element: tableBubbleEl,
          appendTo: () => document.body,
          options: { placement: 'top-start' },
          shouldShow: ({ editor: ed, from, to }) => from === to && ed.isActive('table')
        })
      ],
      content,
      contentType: 'markdown',
      onUpdate: ({ editor: ed }) => {
        onUpdate?.(ed.getMarkdown());
      },
      onTransaction: () => {
        revision++;
      }
    });

    mounted = true;
    setupMentionHover();

    return () => {
      editor.destroy();
    };
  });

  function tableCommand(command: string) {
    const chain = editor.chain().focus();
    if (command === 'rowBefore') chain.addRowBefore().run();
    if (command === 'rowAfter') chain.addRowAfter().run();
    if (command === 'rowDelete') chain.deleteRow().run();
    if (command === 'colBefore') chain.addColumnBefore().run();
    if (command === 'colAfter') chain.addColumnAfter().run();
    if (command === 'colDelete') chain.deleteColumn().run();
    if (command === 'tableDelete') chain.deleteTable().run();
  }

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = prompt('Enter URL:', previousUrl || '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }
</script>

{#snippet toolButton(id: ToolId, compact = false)}
  {@const tool = TOOLS.find((t) => t.id === id)!}
  {@const Icon = ICONS[id]}
  <button
    type="button"
    class="editor-tool"
    class:is-active={isActive(id)}
    aria-pressed={['divider', 'image', 'table', 'link'].includes(id) ? undefined : isActive(id)}
    aria-label={tool.label}
    title={toolTitle(tool, mac)}
    onmousedown={(e) => e.preventDefault()}
    onclick={() => runTool(id)}
  >
    <Icon class="h-4 w-4" />
    {#if !compact}<span class="sr-only">{tool.label}</span>{/if}
  </button>
{/snippet}

<div
  class={cn(
    'editor-wrapper flex min-h-0 flex-col rounded-lg border border-border bg-background',
    className
  )}
>
  {#if mounted}
    <div
      role="toolbar"
      aria-label="Formatting"
      class="flex items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/50 px-1.5 py-1"
    >
      {#each pinnedTools as tool (tool.id)}
        {@render toolButton(tool.id)}
      {/each}
      <span class="flex-1"></span>
      <button
        type="button"
        class="editor-tool"
        class:opacity-40={!spellcheckEnabled}
        aria-pressed={spellcheckEnabled}
        aria-label="Spellcheck"
        title={spellcheckEnabled ? 'Spellcheck on' : 'Spellcheck off'}
        onclick={toggleSpellcheck}
      >
        <SpellCheck class="h-4 w-4" />
      </button>
      <Popover.Root bind:open={overflowOpen}>
        <Popover.Trigger class="editor-tool" aria-label="More tools" title="More tools">
          <Ellipsis class="h-4 w-4" />
        </Popover.Trigger>
        <Popover.Content align="end" class="w-64 space-y-3 p-3">
          {#if overflowTools.length > 0}
            <div>
              <p class="mb-1 text-xs font-medium text-muted-foreground">More tools</p>
              <div class="grid grid-cols-1">
                {#each overflowTools as tool (tool.id)}
                  {@const Icon = ICONS[tool.id]}
                  <button
                    type="button"
                    class="flex items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-secondary"
                    onclick={() => runTool(tool.id)}
                  >
                    <Icon class="h-4 w-4" />
                    <span>{tool.label}</span>
                    {#if tool.keys}<span class="ml-auto text-xs text-muted-foreground"
                        >{formatKeys(tool.keys, mac)}</span
                      >{/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          <label class="flex items-center justify-between gap-2 text-sm">
            <span>Spellcheck language</span>
            <select
              class="rounded border border-border bg-background px-1 py-0.5 text-xs"
              value={editorLang}
              onchange={(e) => setLang((e.target as HTMLSelectElement).value)}
            >
              {#each LANGUAGES as [code, name] (code)}
                <option value={code}>{name}</option>
              {/each}
            </select>
          </label>
          <details>
            <summary class="cursor-pointer text-xs font-medium text-muted-foreground"
              >Customize toolbar</summary
            >
            <fieldset class="mt-2 grid grid-cols-2 gap-1">
              <legend class="sr-only">Pinned tools</legend>
              {#each TOOLS as tool (tool.id)}
                <label class="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={pinned.includes(tool.id)}
                    onchange={() => togglePin(tool.id)}
                  />
                  {tool.label}
                </label>
              {/each}
            </fieldset>
          </details>
        </Popover.Content>
      </Popover.Root>
    </div>
  {/if}

  <div
    bind:this={textBubbleEl}
    class="editor-bubble"
    style="visibility: hidden; position: absolute"
    role="toolbar"
    aria-label="Text formatting"
  >
    {#each ['bold', 'italic', 'strike', 'highlight', 'link'] as const as id (id)}
      {@render toolButton(id, true)}
    {/each}
  </div>

  <div
    bind:this={tableBubbleEl}
    class="editor-bubble"
    style="visibility: hidden; position: absolute"
    role="toolbar"
    aria-label="Table"
  >
    {#each [['rowBefore', 'Insert row above', BetweenHorizontalStart], ['rowAfter', 'Insert row below', BetweenHorizontalEnd], ['colBefore', 'Insert column left', BetweenVerticalStart], ['colAfter', 'Insert column right', BetweenVerticalEnd], ['rowDelete', 'Delete row', Trash2], ['colDelete', 'Delete column', Trash2], ['tableDelete', 'Delete table', Trash2]] as const as [command, label, Icon] (command)}
      <button
        type="button"
        class="editor-tool"
        aria-label={label}
        title={label}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => tableCommand(command)}
      >
        <Icon class="h-4 w-4" />
        {#if command !== 'rowBefore' && command !== 'rowAfter' && command !== 'colBefore' && command !== 'colAfter'}<span
            class="text-[10px]">{label.replace('Delete ', '')}</span
          >{/if}
      </button>
    {/each}
  </div>

  {#if showImagePicker}
    <div class="border-b border-border bg-card p-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-muted-foreground">Insert an image</span>
        <div class="flex items-center gap-2">
          <button
            class="rounded px-2 py-1 text-xs hover:bg-secondary"
            onclick={() => {
              const url = prompt('Enter image URL:');
              if (url) insertImage(url);
            }}
          >
            From URL…
          </button>
          <button
            class="rounded px-2 py-1 text-xs hover:bg-secondary"
            onclick={() => (showImagePicker = false)}
          >
            Close
          </button>
        </div>
      </div>
      <div class="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {#each images as image (image.id)}
          <button
            class="overflow-hidden rounded border border-border hover:border-primary"
            title={image.originalName}
            onclick={() =>
              insertImage(imageSrc(image.filename), image.altText || image.originalName)}
          >
            <img
              src={imageSrc(image.filename)}
              alt={image.altText || image.originalName}
              class="h-16 w-16 object-cover"
            />
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div
    bind:this={editorEl}
    data-editor-body
    spellcheck={spellcheckEnabled}
    lang={editorLang}
    class="prose prose-sm dark:prose-invert max-w-none min-h-0 flex-1 overflow-y-auto px-4 py-3 min-h-[200px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:leading-relaxed [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p]:my-1"
  ></div>
</div>

{#if hoverMention}
  <div
    class="fixed z-50 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg"
    style="left: {hoverMention.x}px; top: {hoverMention.y - 10}px; transform: translateY(-100%);"
  >
    <div class="text-sm font-medium">{hoverMention.label}</div>
    <div class="text-xs text-muted-foreground capitalize">{hoverMention.type}</div>
  </div>
{/if}

<style>
  .editor-wrapper :global(.ProseMirror) {
    outline: none;
    min-height: 200px;
  }
  .editor-wrapper :global(.ProseMirror p.is-editor-empty:first-child::before) {
    color: var(--muted-foreground);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  .editor-wrapper :global(.ProseMirror table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
  }
  .editor-wrapper :global(.ProseMirror th),
  .editor-wrapper :global(.ProseMirror td) {
    border: 1px solid var(--border);
    padding: 0.5em;
    min-width: 80px;
  }
  .editor-wrapper :global(.ProseMirror th) {
    background: var(--muted);
    font-weight: 600;
  }
  .editor-wrapper :global(.ProseMirror blockquote) {
    border-left: 3px solid var(--primary);
    padding-left: 1em;
    color: var(--muted-foreground);
  }
  .editor-wrapper :global(.ProseMirror code) {
    background: var(--muted);
    border-radius: 0.25em;
    padding: 0.125em 0.25em;
    font-size: 0.9em;
  }
  .editor-wrapper :global(.ProseMirror pre) {
    background: var(--muted);
    border-radius: 0.5em;
    padding: 1em;
    overflow-x: auto;
  }
  .editor-wrapper :global(.ProseMirror img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5em;
  }
  .editor-wrapper :global(.ProseMirror a) {
    color: var(--primary);
    text-decoration: underline;
    cursor: pointer;
  }
  .editor-wrapper :global([data-type='mention']) {
    background: var(--accent);
    border-radius: 0.25em;
    padding: 0.125em 0.25em;
    color: var(--accent-foreground);
    cursor: pointer;
  }
  :global(.mention-dropdown) {
    min-width: 12rem;
    max-height: 12rem;
    overflow-y: auto;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--popover);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .editor-wrapper :global(.editor-tool) {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    border-radius: 0.25rem;
    padding: 0.375rem;
    color: var(--muted-foreground);
  }
  .editor-wrapper :global(.editor-tool:hover) {
    background: var(--secondary);
    color: var(--foreground);
  }
  .editor-wrapper :global(.editor-tool:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  .editor-wrapper :global(.editor-tool.is-active) {
    background: var(--secondary);
    color: var(--foreground);
  }
  .editor-bubble {
    z-index: 50;
    display: flex;
    gap: 0.125rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--popover);
    padding: 0.125rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .editor-bubble :global(.editor-tool) {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: 0.25rem;
    padding: 0.375rem;
    color: var(--muted-foreground);
  }
  .editor-bubble :global(.editor-tool:hover),
  .editor-bubble :global(.editor-tool.is-active) {
    background: var(--secondary);
    color: var(--foreground);
  }
</style>
