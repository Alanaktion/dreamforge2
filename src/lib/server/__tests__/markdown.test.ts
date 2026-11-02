import { describe, it, expect } from 'vitest';
import { parseMarkdown, serializeMarkdown, readMarkdownFile } from '../markdown';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('parseMarkdown', () => {
  it('parses frontmatter and body', () => {
    const content = `---
id: test-1
name: Test Entity
type: character
tags: [hero, mage]
status: draft
---
Body content here`;

    const result = parseMarkdown(content);
    expect(result.frontmatter.id).toBe('test-1');
    expect(result.frontmatter.name).toBe('Test Entity');
    expect(result.frontmatter.type).toBe('character');
    expect(result.frontmatter.tags).toEqual(['hero', 'mage']);
    expect(result.frontmatter.status).toBe('draft');
    expect(result.body.trim()).toBe('Body content here');
  });

  it('handles content without frontmatter', () => {
    const content = 'Just body text without frontmatter';
    const result = parseMarkdown(content);
    expect(result.frontmatter.id).toBe('');
    expect(result.frontmatter.name).toBe('');
    expect(result.body).toBe(content);
  });

  it('handles empty body', () => {
    const content = `---
id: empty
name: Empty Entity
type: note
---
`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.id).toBe('empty');
    expect(result.body.trim()).toBe('');
  });

  it('parses multiline body', () => {
    const content = `---
id: multi
name: Multi Line
type: note
---
Line 1

Line 2

Line 3`;

    const result = parseMarkdown(content);
    expect(result.body.trim()).toBe('Line 1\n\nLine 2\n\nLine 3');
  });

  it('parses boolean values', () => {
    const content = `---
active: true
visible: false
---
body`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.active).toBe(true);
    expect(result.frontmatter.visible).toBe(false);
  });

  it('parses numeric values', () => {
    const content = `---
count: 42
score: 3.14
---
body`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.score).toBe(3.14);
  });
});

describe('serializeMarkdown', () => {
  it('serializes frontmatter and body', () => {
    const result = serializeMarkdown(
      { id: 'test-1', name: 'Test', type: 'character' },
      'Body text'
    );
    expect(result).toContain('---');
    expect(result).toContain('id: test-1');
    expect(result).toContain('name: Test');
    expect(result).toContain('Body text');
  });

  it('preserves null and omits undefined values', () => {
    const result = serializeMarkdown(
      { id: 'test', name: 'Test', empty: null, undef: undefined },
      'body'
    );
    expect(parseMarkdown(result).frontmatter.empty).toBeNull();
    expect(result).not.toContain('undef');
  });

  it('serializes arrays as JSON', () => {
    const result = serializeMarkdown({ id: 'test', tags: ['a', 'b', 'c'] }, 'body');
    expect(parseMarkdown(result).frontmatter.tags).toEqual(['a', 'b', 'c']);
  });

  it('round-trips correctly', () => {
    const original = `---
id: roundtrip
name: Round Trip
type: location
tags: [forest, ancient]
status: wip
---
Some body content`;
    const parsed = parseMarkdown(original);
    const serialized = serializeMarkdown(parsed.frontmatter, parsed.body);
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.frontmatter.id).toBe('roundtrip');
    expect(reparsed.frontmatter.name).toBe('Round Trip');
    expect(reparsed.frontmatter.tags).toEqual(['forest', 'ancient']);
    expect(reparsed.body.trim()).toBe('Some body content');
  });

  it('round-trips multiline string values correctly', () => {
    const frontmatter = {
      id: 'multi',
      name: 'Multi',
      backstory: 'Line one\nLine two\nLine three'
    };
    const serialized = serializeMarkdown(frontmatter, 'body');
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.frontmatter.backstory).toBe('Line one\nLine two\nLine three');
  });

  it('round-trips multiline strings with special characters', () => {
    const frontmatter = {
      id: 'special',
      name: 'Special',
      notes: 'First: intro\nSecond: "quoted"\nThird: [list]'
    };
    const serialized = serializeMarkdown(frontmatter, 'body');
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.frontmatter.notes).toBe('First: intro\nSecond: "quoted"\nThird: [list]');
  });
});

describe('parseMarkdown - block scalar backward compat', () => {
  it('parses legacy block scalar (|) multiline values', () => {
    const content = `---
id: legacy
name: Legacy
type: character
backstory: |
  Once upon a time
  in a land far away
---
body`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.backstory).toBe('Once upon a time\nin a land far away\n');
  });

  it('continues parsing after a block scalar', () => {
    const content = `---
id: test
backstory: |
  line one
  line two
status: wip
---
body`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.backstory).toBe('line one\nline two\n');
    expect(result.frontmatter.status).toBe('wip');
  });
});

describe('readMarkdownFile', () => {
  it('reads and parses a file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-test-'));
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(
      filePath,
      `---
id: file-test
name: File Test
type: note
---
File body`
    );

    const result = readMarkdownFile(filePath);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.id).toBe('file-test');
    expect(result!.body.trim()).toBe('File body');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null for non-existent file', () => {
    const result = readMarkdownFile('/nonexistent/file.md');
    expect(result).toBeNull();
  });
});
