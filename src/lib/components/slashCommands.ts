import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { filterSlashItems, type SlashItem } from './editorTools';

export interface SlashOptions {
  run: (editor: Editor, range: Range, item: SlashItem) => void;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',

  addOptions() {
    return { run: () => {} };
  },

  addProseMirrorPlugins() {
    const run = this.options.run;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        pluginKey: new PluginKey('slashCommands'),
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === 'paragraph';
        },
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => run(editor, range, props),
        render: () => {
          let dom: HTMLDivElement | null = null;
          let current: SuggestionProps<SlashItem> | null = null;
          let selected = 0;

          const draw = () => {
            if (!dom || !current) return;
            const rect = current.clientRect?.();
            if (rect) {
              dom.style.left = `${rect.left}px`;
              dom.style.top = `${rect.bottom + 4}px`;
            }
            if (current.items.length === 0) {
              dom.innerHTML =
                '<div class="px-3 py-1.5 text-sm text-muted-foreground">No matching blocks</div>';
              return;
            }
            dom.innerHTML = current.items
              .map(
                (item, i) =>
                  `<button type="button" role="option" aria-selected="${i === selected}" class="${i === selected ? 'bg-accent ' : ''}flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent" data-index="${i}"><span>${escapeHtml(item.label)}</span><span class="text-xs text-muted-foreground">${escapeHtml(item.hint)}</span></button>`
              )
              .join('');
            dom.querySelectorAll('button').forEach((btn) => {
              btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const item = current?.items[Number(btn.dataset.index)];
                if (item) current?.command(item);
              });
            });
          };

          return {
            onStart: (props) => {
              current = props;
              selected = 0;
              dom = document.createElement('div');
              dom.className = 'mention-dropdown';
              dom.setAttribute('role', 'listbox');
              dom.setAttribute('aria-label', 'Insert block');
              dom.style.position = 'fixed';
              dom.style.zIndex = '100';
              document.body.appendChild(dom);
              draw();
            },
            onUpdate: (props) => {
              current = props;
              selected = Math.min(selected, Math.max(0, props.items.length - 1));
              draw();
            },
            onKeyDown: ({ event }) => {
              if (!current || current.items.length === 0) return false;
              if (event.key === 'ArrowDown') {
                selected = (selected + 1) % current.items.length;
                draw();
                return true;
              }
              if (event.key === 'ArrowUp') {
                selected = (selected - 1 + current.items.length) % current.items.length;
                draw();
                return true;
              }
              if (event.key === 'Enter') {
                current.command(current.items[selected]);
                return true;
              }
              return false;
            },
            onExit: () => {
              dom?.remove();
              dom = null;
              current = null;
            }
          };
        }
      })
    ];
  }
});
