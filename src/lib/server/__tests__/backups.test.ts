import {
  uploadImages,
  updateImage,
  linkEntityToImage,
  listProjectImages,
  getProjectImage
} from '../images';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { pipeline } from 'node:stream/promises';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  return { testDb: new Database(':memory:') };
});
vi.mock('../db', () => ({ default: testDb }));
import { migrate } from '../migrate';
import { createBackup, restoreProject, extractProjectZip, listBackups } from '../backups';
import { createEntity, getEntity, updateEntity } from '../entities';
import { addCustomFieldDef, getCustomFieldDefs } from '../customFields';
import { createComment, getComments } from '../comments';
import { addBookmark, getBookmarks } from '../bookmarks';
import { syncProjectMetadata } from '../projectMetadata';
import { writeJson } from '../storage';

let root: string;
let directory: string;
beforeAll(() => {
  migrate();
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-backup-'));
  directory = path.join(root, 'projects', 'project');
  fs.mkdirSync(directory, { recursive: true });
  vi.stubEnv('DATA_DIR', path.join(root, 'projects'));
  vi.stubEnv('BACKUP_DIR', path.join(root, 'backups'));
  testDb.exec(
    'DELETE FROM image_entity_links; DELETE FROM project_images; DELETE FROM custom_field_defs; DELETE FROM comments; DELETE FROM bookmarks; DELETE FROM trash_items; DELETE FROM entities; DELETE FROM project_members; DELETE FROM projects; DELETE FROM sessions; DELETE FROM users;'
  );
  testDb
    .prepare('INSERT INTO users (id,email,username,password_hash,created_at) VALUES (?,?,?,?,?)')
    .run('user', 'backup@test.local', 'writer', 'hash', 'now');
  testDb
    .prepare(
      'INSERT INTO projects (id,user_id,name,data_path,created_at,modified_at) VALUES (?,?,?,?,?,?)'
    )
    .run('project', 'user', 'World', directory, 'now', 'now');
  writeJson(path.join(directory, 'project.json'), { id: 'project', name: 'World' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('restores a backup with entity IDs and portable metadata into an independent project', async () => {
  const entity = createEntity('project', directory, 'character', {
    name: '[Untitled]',
    tags: ['a, b'],
    stats: { power: 9 }
  });
  addCustomFieldDef('project', 'character', { key: 'magic', label: 'Magic', fieldType: 'text' });
  createComment('project', 'entity', entity.id, 'user', 'A comment');
  addBookmark('user', 'project', entity.id);
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const image = uploadImages('project', directory, [{ name: 'map.png', buffer: png }])[0];
  updateImage('project', image.id, { caption: 'World map', altText: 'Map of the world' });
  linkEntityToImage('project', image.id, entity.id);
  const name = await createBackup('project', directory);
  const restored = await restoreProject(path.join(root, 'backups', 'project', name), 'user');
  const restoredPath = path.join(root, 'projects', restored);
  expect(getEntity(restored, restoredPath, 'character', entity.id)?.name).toBe('[Untitled]');
  expect(getCustomFieldDefs(restored)[0].label).toBe('Magic');
  expect(getComments(restored, 'entity', entity.id)[0].body).toBe('A comment');
  expect(getBookmarks('user', restored)[0].entityId).toBe(entity.id);
  const fieldId = getCustomFieldDefs(restored)[0].id;
  syncProjectMetadata(restored);
  expect(getCustomFieldDefs(restored)[0].id).toBe(fieldId);
  expect(getCustomFieldDefs('project')).toHaveLength(1);
  const restoredImage = listProjectImages(restored, restoredPath)[0];
  expect(restoredImage.caption).toBe('World map');
  expect(restoredImage.altText).toBe('Map of the world');
  updateEntity('project', directory, 'character', entity.id, { name: 'Original changed' });
  expect(
    getProjectImage(restored, restoredPath, restoredImage.id)?.linkedEntities.map(
      (linked) => linked.name
    )
  ).toEqual(['[Untitled]']);
});

it('keeps only the configured number of complete backups', async () => {
  vi.stubEnv('BACKUP_RETENTION', '1');
  await createBackup('project', directory);
  await createBackup('project', directory);
  expect(listBackups('project')).toHaveLength(1);
});

it('rejects traversal entries without writing outside the restore directory', async () => {
  const zipPath = path.join(root, 'unsafe.zip');
  const archive = new ZipArchive();
  const output = pipeline(archive, fs.createWriteStream(zipPath));
  archive.append('escape', { name: '../escape.txt' });
  await Promise.all([archive.finalize(), output]);
  const zip = fs.readFileSync(zipPath);
  for (let position = 0; position < zip.length - 10; position++) {
    if (zip.subarray(position, position + 10).toString() === 'escape.txt')
      Buffer.from('../bad.txt').copy(zip, position);
  }
  fs.writeFileSync(zipPath, zip);
  await expect(extractProjectZip(zipPath, path.join(root, 'extract'))).rejects.toThrow();
  expect(fs.existsSync(path.join(root, 'bad.txt'))).toBe(false);
});
