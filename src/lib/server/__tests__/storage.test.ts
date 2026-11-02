import { validImageSignature } from '../imageSignature';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic, readJson, fileRevision, assertRevision, ConflictError } from '../storage';
import { parseMarkdown, serializeMarkdown } from '../markdown';
import { loadRelations, addRelation } from '../relations';
import { loadTimeline } from '../timelines';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'df-safe-'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

it.each([
  '[Untitled]',
  'true',
  'false',
  'null',
  '42',
  '007',
  'a: b',
  '# hash',
  '  spaced  ',
  '"Never"',
  '\nline\n',
  '😀'
])('preserves arbitrary strings: %j', (name) => {
  const data = {
    id: 'test',
    name,
    tags: ['a, b', name],
    stats: { power: 9, code: '007' },
    items: [{ label: name }],
    empty: null
  };
  expect(parseMarkdown(serializeMarkdown(data, '  body\n\n')).frontmatter).toEqual(data);
  expect(parseMarkdown(serializeMarkdown(data, '  body\n\n')).body).toBe('  body\n\n');
});

it('supports BOM, CRLF, standard lists, and nested metadata', () => {
  const md = parseMarkdown(
    '\uFEFF---\r\nid: test\r\nname: "007"\r\ntags:\r\n  - a, b\r\n  - c\r\nstats:\r\n  power: 9\r\n---\r\ntext'
  );
  expect(md.frontmatter).toEqual({
    id: 'test',
    name: '007',
    tags: ['a, b', 'c'],
    stats: { power: 9 }
  });
});

it('replaces complete files and detects external edits even without a modified timestamp', () => {
  const file = path.join(directory, 'entity.md');
  writeFileAtomic(file, 'first');
  const revision = fileRevision(file);
  writeFileAtomic(file, 'second');
  expect(() => assertRevision(file, revision)).toThrow(ConflictError);
  expect(fs.readdirSync(directory)).toEqual(['entity.md']);
  expect(fs.readFileSync(file, 'utf8')).toBe('second');
});

it('preserves the original if atomic rename fails', () => {
  const file = path.join(directory, 'file');
  writeFileAtomic(file, 'original');
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('disk failure');
  });
  expect(() => writeFileAtomic(file, 'replacement')).toThrow('disk failure');
  rename.mockRestore();
  expect(fs.readFileSync(file, 'utf8')).toBe('original');
  expect(fs.readdirSync(directory)).toEqual(['file']);
});

it.each(['relations.json', 'timeline.json', 'writing-log.json'])(
  'backs up corrupt %s and refuses to reset it',
  (name) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, '{invalid');
    expect(() => readJson(file, [])).toThrow('Repair the file');
    expect(fs.readdirSync(directory).some((entry) => entry.startsWith(`${name}.corrupt-`))).toBe(
      true
    );
    expect(fs.readFileSync(file, 'utf8')).toBe('{invalid');
  }
);

it('refuses to add relations over corrupt data', () => {
  fs.writeFileSync(path.join(directory, 'relations.json'), '{bad');
  expect(() => loadRelations(directory)).toThrow();
  expect(() =>
    addRelation(directory, { sourceId: 'a', targetId: 'b', relationType: 'friend', label: null })
  ).toThrow();
});

it('refuses structurally invalid timeline data', () => {
  fs.writeFileSync(path.join(directory, 'timeline.json'), '{"events":null}');
  expect(() => loadTimeline(directory)).toThrow();
});

it('serializes synchronous read-modify-write updates without losing a relation', async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      Promise.resolve().then(() =>
        addRelation(directory, {
          sourceId: String(i),
          targetId: 'b',
          relationType: 'friend',
          label: null
        })
      )
    )
  );
  expect(loadRelations(directory)).toHaveLength(20);
});

it('rejects an executable disguised as an image and oversized dimensions', () => {
  expect(validImageSignature('.png', Buffer.from('not an image'))).toBe(false);
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(40000, 16);
  png.writeUInt32BE(1, 20);
  expect(validImageSignature('.png', png)).toBe(false);
});
