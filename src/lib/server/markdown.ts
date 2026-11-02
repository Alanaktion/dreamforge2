import { isSafePathSegment } from '$lib/utils';
import { reportFileProblem } from './diagnostics';
import fs from 'node:fs';
import { parse, stringify } from 'yaml';
import { writeFileAtomic } from './storage';

export interface Frontmatter {
  id: string;
  name: string;
  type: string;
  tags?: string[];
  status?: string;
  imagePath?: string | null;
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface MarkdownFile {
  frontmatter: Frontmatter;
  body: string;
}

export function parseMarkdown(content: string): MarkdownFile {
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) {
    if (content.startsWith('---\n')) throw new Error('Unclosed frontmatter');
    return { frontmatter: { id: '', name: '', type: 'note' }, body: content };
  }
  const frontmatter = parse(match[1], { maxAliasCount: 50 });
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('Frontmatter must be a mapping');
  }
  return { frontmatter: frontmatter as Frontmatter, body: match[2].replace(/^\n/, '') };
}

export function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const values = Object.fromEntries(
    Object.entries(frontmatter).filter(([key, value]) => key !== 'body' && value !== undefined)
  );
  return `---\n${stringify(values, { lineWidth: 0 })}---\n\n${body}`;
}

export function readMarkdownFile(filePath: string): MarkdownFile | null {
  try {
    const md = parseMarkdown(fs.readFileSync(filePath, 'utf8'));
    if (!isSafePathSegment(md.frontmatter.id)) throw new Error('Missing or invalid id');
    reportFileProblem(filePath);
    return md;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
      reportFileProblem(filePath, cause instanceof Error ? cause.message : 'Invalid Markdown');
      console.error(`Cannot read Markdown: ${filePath}`, cause);
    }
    return null;
  }
}

export function writeMarkdownFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  writeFileAtomic(filePath, serializeMarkdown(frontmatter, body));
}
