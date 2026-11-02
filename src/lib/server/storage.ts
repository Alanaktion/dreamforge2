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
      fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : 0o600
    );
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, filePath);
    const directory = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
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
