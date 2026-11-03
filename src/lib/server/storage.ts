import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export class StorageError extends Error {
  constructor(
    public filePath: string,
    cause: unknown
  ) {
    super(`Cannot read ${filePath}. Repair the file before saving.`, { cause });
  }
}

export class ConflictError extends Error {
  constructor() {
    super(
      'This changed elsewhere. Your edits are still here. Reload to load the latest version, or explicitly overwrite it.'
    );
  }
}

export function fileRevision(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function assertRevision(filePath: string, expected?: string): void {
  if (expected !== undefined && expected !== fileRevision(filePath)) throw new ConflictError();
}

/**
 * The revision a save form expects to replace. `overwrite=true` skips the check (the user
 * chose to overwrite after a conflict). A missing or empty revision still gets checked, so a
 * client that never loaded the file cannot silently overwrite it.
 */
export function expectedRevision(form: FormData): string | undefined {
  if (form.get('overwrite') === 'true') return undefined;
  return String(form.get('revision') ?? '');
}

// Concurrency note: every read-modify-write of a project file (relations, timeline, plots,
// writing log, Markdown frontmatter) is synchronous from read to write, so Node's event loop
// already serializes them within the one server process that owns the data directory. Keep
// it that way: an `await` between reading and writing a shared file would need a lock.

export function writeFileAtomic(filePath: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      temporary,
      'wx',
      // Keep an existing file's mode; new files get the usual 0666 & ~umask, like writeFileSync.
      fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : 0o666
    );
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, filePath);
    syncDirectory(path.dirname(filePath));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/**
 * Flush a rename to disk. Best effort: the rename has already happened, and some platforms
 * and filesystems (Windows, some network and FUSE mounts) cannot open or fsync a directory.
 */
function syncDirectory(directory: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } catch {
    // The data is written; only the durability of the directory entry is uncertain.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Move a file to a new name in the same directory, then replace its content. A crash part
 * way leaves either the old file or the moved file, never two copies with the same id.
 */
export function moveAndWriteAtomic(from: string, to: string, content: string | Buffer): void {
  if (fs.existsSync(to)) throw new Error(`Cannot rename: ${to} already exists`);
  fs.renameSync(from, to);
  writeFileAtomic(to, content);
}

export function readJson<T>(
  filePath: string,
  fallback: T,
  validate: (value: unknown) => boolean = () => true
): T {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback);
    throw new StorageError(filePath, cause);
  }
  try {
    const value = JSON.parse(content);
    if (!validate(value)) throw new Error('Invalid data structure');
    return value as T;
  } catch (cause) {
    const backup = `${filePath}.corrupt-${createHash('sha256').update(content).digest('hex').slice(0, 12)}`;
    if (!fs.existsSync(backup)) fs.copyFileSync(filePath, backup, fs.constants.COPYFILE_EXCL);
    throw new StorageError(filePath, cause);
  }
}

export function writeJson(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) readJson(filePath, null);
  writeFileAtomic(filePath, JSON.stringify(value, null, 2) + '\n');
}
