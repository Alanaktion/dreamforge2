import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import db from './db';
import { projects } from './schema';
import { generateId, isSafePathSegment } from '$lib/utils';
import { getDataDir } from './paths';
import { persistProjectMetadata, syncProjectMetadata } from './projectMetadata';
import { writeJson, readJson } from './storage';
import { scanProject } from './watcher';

const index = drizzle(db);
const active = new Set<string>();
export function backupDirectory(projectId: string): string {
  if (!isSafePathSegment(projectId)) throw new Error('Invalid project ID');
  return path.join(process.env.BACKUP_DIR || path.join(getDataDir(), '..', 'backups'), projectId);
}

export function backupSettings(projectPath: string): { enabled: boolean } {
  return readJson(
    path.join(projectPath, 'backup-settings.json'),
    { enabled: true },
    (value) => !!value && typeof (value as { enabled: unknown }).enabled === 'boolean'
  );
}

export function listBackups(
  projectId: string
): Array<{ name: string; size: number; createdAt: string }> {
  const directory = backupDirectory(projectId);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => /^backup-.*\.zip$/.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(directory, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function projectArchive(projectId: string, projectPath: string): ZipArchive {
  syncProjectMetadata(projectId);
  persistProjectMetadata(projectId);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.glob('**/*', { cwd: projectPath, dot: true, ignore: ['**/*.tmp', '**/*.corrupt-*'] });
  return archive;
}

export async function createBackup(projectId: string, projectPath: string): Promise<string> {
  if (active.has(projectId)) throw new Error('A backup is already running for this project');
  const directory = backupDirectory(projectId);
  if (
    path.resolve(directory) === path.resolve(projectPath) ||
    path.resolve(directory).startsWith(path.resolve(projectPath) + path.sep)
  ) {
    throw new Error('BACKUP_DIR must be outside the project folder');
  }
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${generateId()}.zip`;
  const temporary = path.join(directory, `.${name}.tmp`);
  active.add(projectId);
  try {
    fs.mkdirSync(directory, { recursive: true });
    const archive = projectArchive(projectId, projectPath);
    const output = pipeline(archive, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    await Promise.all([output, archive.finalize()]);
    const fd = fs.openSync(temporary, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, path.join(directory, name));
    const retention = Math.max(1, Number(process.env.BACKUP_RETENTION) || 10);
    for (const old of listBackups(projectId).slice(retention))
      fs.unlinkSync(path.join(directory, old.name));
    return name;
  } finally {
    active.delete(projectId);
    fs.rmSync(temporary, { force: true });
  }
}

export function startBackups(): ReturnType<typeof setInterval> {
  const interval = Math.max(60, Number(process.env.BACKUP_INTERVAL) || 86400) * 1000;
  const tick = async () => {
    for (const project of index.select().from(projects).all()) {
      try {
        if (!backupSettings(project.dataPath).enabled || active.has(project.id)) continue;
        const last = listBackups(project.id)[0];
        if (!last || Date.now() - Date.parse(last.createdAt) >= interval)
          await createBackup(project.id, project.dataPath);
      } catch (cause) {
        console.error(`Backup failed for project ${project.id}`, cause);
      }
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), Math.min(interval, 60000));
  timer.unref();
  return timer;
}

export async function extractProjectZip(zipPath: string, destination: string): Promise<void> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (cause, file) =>
      cause ? reject(cause) : resolve(file!)
    )
  );
  let total = 0;
  let count = 0;
  const seen = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const fail = (cause: unknown) => {
      zip.close();
      reject(cause);
    };
    zip.on('error', fail);
    zip.on('end', resolve);
    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        const name = entry.fileName;
        const parts = name.replace(/\/$/, '').split('/');
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (
          parts.some(
            (part) => !isSafePathSegment(part) || (part.startsWith('.') && part !== '.trash')
          ) ||
          name.includes('\\') ||
          mode === 0o120000 ||
          seen.has(name)
        )
          throw new Error('Unsafe or duplicate ZIP entry');
        seen.add(name);
        total += entry.uncompressedSize;
        if (++count > 20000 || total > 512 * 1024 * 1024)
          throw new Error('ZIP exceeds restore limits (20,000 files / 512 MB)');
        const target = path.join(destination, ...parts);
        if (name.endsWith('/')) fs.mkdirSync(target, { recursive: true });
        else {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const input = await new Promise<import('node:stream').Readable>((resolve, reject) =>
            zip.openReadStream(entry, (cause, stream) => (cause ? reject(cause) : resolve(stream!)))
          );
          await pipeline(input, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }));
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

export async function restoreProject(zipPath: string, userId: string): Promise<string> {
  const id = generateId();
  const directory = path.join(getDataDir(), id);
  fs.mkdirSync(directory, { recursive: true });
  try {
    await extractProjectZip(zipPath, directory);
    const meta = readJson<Record<string, unknown>>(
      path.join(directory, 'project.json'),
      {},
      (value) => !!value && typeof (value as { name: unknown }).name === 'string'
    );
    if (typeof meta.name !== 'string' || !meta.name)
      throw new Error('ZIP must contain project.json at its root');
    const now = new Date().toISOString();
    writeJson(path.join(directory, 'project.json'), { ...meta, id, modifiedAt: now });
    const stories = path.join(directory, 'stories');
    if (fs.existsSync(stories)) {
      for (const storyId of fs.readdirSync(stories)) {
        const file = path.join(stories, storyId, 'story.json');
        if (fs.existsSync(file))
          writeJson(file, { ...readJson<Record<string, unknown>>(file, {}), projectId: id });
      }
    }
    const plots = path.join(directory, 'plotlines');
    if (fs.existsSync(plots)) {
      for (const filename of fs.readdirSync(plots).filter((name) => name.endsWith('.json'))) {
        const file = path.join(plots, filename);
        writeJson(file, { ...readJson<Record<string, unknown>>(file, {}), projectId: id });
      }
    }
    index.transaction(() => {
      index
        .insert(projects)
        .values({
          id,
          userId,
          name: meta.name as string,
          description: typeof meta.description === 'string' ? meta.description : null,
          dataPath: directory,
          pinned: false,
          createdAt: now,
          modifiedAt: now
        })
        .run();
      syncProjectMetadata(id);
      scanProject(id, directory);
      persistProjectMetadata(id);
    });
    return id;
  } catch (cause) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
}
