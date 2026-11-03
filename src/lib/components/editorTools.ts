export type ToolId =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'highlight'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'blockquote'
  | 'codeBlock'
  | 'divider'
  | 'link'
  | 'image'
  | 'table';

export interface ToolDef {
  id: ToolId;
  label: string;
  keys?: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'bold', label: 'Bold', keys: 'Mod+B' },
  { id: 'italic', label: 'Italic', keys: 'Mod+I' },
  { id: 'strike', label: 'Strikethrough', keys: 'Mod+Shift+S' },
  { id: 'highlight', label: 'Highlight', keys: 'Mod+Shift+H' },
  { id: 'h1', label: 'Heading 1', keys: 'Mod+Alt+1' },
  { id: 'h2', label: 'Heading 2', keys: 'Mod+Alt+2' },
  { id: 'h3', label: 'Heading 3', keys: 'Mod+Alt+3' },
  { id: 'bullet', label: 'Bulleted list', keys: 'Mod+Shift+8' },
  { id: 'ordered', label: 'Numbered list', keys: 'Mod+Shift+7' },
  { id: 'blockquote', label: 'Quote', keys: 'Mod+Shift+B' },
  { id: 'codeBlock', label: 'Code block', keys: 'Mod+Alt+C' },
  { id: 'divider', label: 'Divider' },
  { id: 'link', label: 'Link' },
  { id: 'image', label: 'Image' },
  { id: 'table', label: 'Table' }
];

export const DEFAULT_PINNED: ToolId[] = [
  'bold',
  'italic',
  'h2',
  'h3',
  'bullet',
  'ordered',
  'blockquote',
  'link',
  'image'
];

export const PINNED_STORAGE_KEY = 'editor:pinned';

export function parsePinned(stored: string | null): ToolId[] {
  if (!stored) return [...DEFAULT_PINNED];
  try {
    const value = JSON.parse(stored);
    if (!Array.isArray(value)) return [...DEFAULT_PINNED];
    const known = new Set(TOOLS.map((t) => t.id));
    return TOOLS.map((t) => t.id).filter((id) => value.includes(id) && known.has(id));
  } catch {
    return [...DEFAULT_PINNED];
  }
}

export function togglePinned(pinned: ToolId[], id: ToolId): ToolId[] {
  const next = new Set(pinned);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return TOOLS.map((t) => t.id).filter((t) => next.has(t));
}

export function formatKeys(keys: string, mac: boolean): string {
  return keys
    .split('+')
    .map((k) => {
      if (k === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (k === 'Alt') return mac ? '⌥' : 'Alt';
      if (k === 'Shift') return mac ? '⇧' : 'Shift';
      return k;
    })
    .join(mac ? '' : '+');
}

export function toolTitle(tool: ToolDef, mac: boolean): string {
  return tool.keys ? `${tool.label} (${formatKeys(tool.keys, mac)})` : tool.label;
}

export interface SlashItem {
  id: ToolId;
  label: string;
  hint: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'h1', label: 'Heading 1', hint: 'Large section title' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium section title' },
  { id: 'h3', label: 'Heading 3', hint: 'Small section title' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple list' },
  { id: 'ordered', label: 'Numbered list', hint: 'List with numbers' },
  { id: 'blockquote', label: 'Quote', hint: 'Indented quotation' },
  { id: 'codeBlock', label: 'Code block', hint: 'Monospaced block' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule' },
  { id: 'table', label: 'Table', hint: '3 × 3 table' },
  { id: 'image', label: 'Image', hint: 'From the image library or a URL' }
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
  );
}
