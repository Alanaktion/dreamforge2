import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
  slugify,
  formatDate,
  isSafePathSegment,
  moveItem,
  safeNext
} from '../index';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    // The constant operands below are the point: this asserts how cn() treats a
    // falsy/truthy conditional class, same as a real `cond && 'class'` usage.
    // eslint-disable-next-line no-constant-binary-expression
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    // eslint-disable-next-line no-constant-binary-expression
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('handles undefined and null', () => {
    expect(cn('a', undefined, 'b', null)).toBe('a b');
  });

  it('merges tailwind classes (last wins)', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('returns a UUID format', () => {
    const uuid = generateId();
    expect(uuid).toMatch(/^[0-9a-f-]+$/);
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world foo')).toBe('hello-world-foo');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! World?')).toBe('hello-world');
  });

  it('handles multiple hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('trims whitespace', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });
});

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2026-06-19T12:00:00.000Z');
    expect(result).toContain('Jun');
    expect(result).toContain('19');
    expect(result).toContain('2026');
  });

  it('handles edge case dates', () => {
    const result = formatDate('2024-06-15T12:00:00.000Z');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });
});

describe('isSafePathSegment', () => {
  it('accepts ordinary ids', () => {
    expect(isSafePathSegment('92d98fa9-6991-4009-9041-83ea5f7d561e')).toBe(true);
    expect(isSafePathSegment('my-slug_1')).toBe(true);
  });

  it('rejects traversal and separators', () => {
    expect(isSafePathSegment('..')).toBe(false);
    expect(isSafePathSegment('.')).toBe(false);
    expect(isSafePathSegment('../../etc')).toBe(false);
    expect(isSafePathSegment('a/b')).toBe(false);
    expect(isSafePathSegment('a\\b')).toBe(false);
    expect(isSafePathSegment('a\0b')).toBe(false);
  });

  it('rejects empty and non-strings', () => {
    expect(isSafePathSegment('')).toBe(false);
    expect(isSafePathSegment(null)).toBe(false);
    expect(isSafePathSegment(undefined)).toBe(false);
    expect(isSafePathSegment(42)).toBe(false);
  });
});

describe('moveItem', () => {
  it('moves an item up or down by one', () => {
    expect(moveItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns null at the edges or for unknown items', () => {
    expect(moveItem(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveItem(['a', 'b'], 'b', 1)).toBeNull();
    expect(moveItem(['a', 'b'], 'z', 1)).toBeNull();
  });
});

describe('safeNext', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc');
    expect(safeNext('//evil.example')).toBe('/projects');
    expect(safeNext('/\t/evil.example')).toBe('/projects');
    expect(safeNext('/\n/evil.example')).toBe('/projects');
    expect(safeNext('/x\u007f')).toBe('/projects');
    expect(safeNext('https://evil.example')).toBe('/projects');
    expect(safeNext('/\\evil.example')).toBe('/projects');
    expect(safeNext(null)).toBe('/projects');
  });
});
