import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PINNED,
  filterSlashItems,
  formatKeys,
  parsePinned,
  togglePinned,
  toolTitle,
  TOOLS
} from '../editorTools';

describe('parsePinned', () => {
  it('falls back to the defaults for missing or malformed values', () => {
    expect(parsePinned(null)).toEqual(DEFAULT_PINNED);
    expect(parsePinned('not json')).toEqual(DEFAULT_PINNED);
    expect(parsePinned('{"a":1}')).toEqual(DEFAULT_PINNED);
  });

  it('keeps known tools in toolbar order and drops unknown ones', () => {
    expect(parsePinned('["table","bold","nope"]')).toEqual(['bold', 'table']);
    expect(parsePinned('[]')).toEqual([]);
  });
});

describe('togglePinned', () => {
  it('adds and removes tools while keeping toolbar order', () => {
    expect(togglePinned(['italic'], 'bold')).toEqual(['bold', 'italic']);
    expect(togglePinned(['bold', 'italic'], 'bold')).toEqual(['italic']);
  });
});

describe('shortcut hints', () => {
  it('formats modifier keys per platform', () => {
    expect(formatKeys('Mod+Shift+8', false)).toBe('Ctrl+Shift+8');
    expect(formatKeys('Mod+Alt+1', true)).toBe('⌘⌥1');
  });

  it('adds the shortcut to tool titles when one exists', () => {
    const bold = TOOLS.find((t) => t.id === 'bold')!;
    const link = TOOLS.find((t) => t.id === 'link')!;
    expect(toolTitle(bold, false)).toBe('Bold (Ctrl+B)');
    expect(toolTitle(link, false)).toBe('Link');
  });
});

describe('filterSlashItems', () => {
  it('matches labels case-insensitively', () => {
    expect(filterSlashItems('LIST').map((i) => i.id)).toEqual(['bullet', 'ordered']);
    expect(filterSlashItems('').length).toBeGreaterThan(5);
    expect(filterSlashItems('zzz')).toEqual([]);
  });
});
