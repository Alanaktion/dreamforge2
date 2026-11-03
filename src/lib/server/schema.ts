import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull()
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  dataPath: text('data_path').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  modifiedAt: text('modified_at').notNull()
});

export const entities = sqliteTable(
  'entities',
  {
    id: text('id').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    type: text('type').notNull(),
    name: text('name').notNull(),
    slug: text('slug'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
    status: text('status').notNull().default('draft'),
    imagePath: text('image_path'),
    createdAt: text('created_at').notNull(),
    modifiedAt: text('modified_at').notNull()
  },
  (table) => [primaryKey({ columns: [table.projectId, table.id] })]
);

export const bookmarks = sqliteTable('bookmarks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  entityId: text('entity_id').notNull(),
  createdAt: text('created_at').notNull()
});

export const trashItems = sqliteTable('trash_items', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  entityId: text('entity_id').notNull(),
  entityType: text('entity_type').notNull(),
  originalPath: text('original_path').notNull(),
  deletedAt: text('deleted_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  kind: text('kind').notNull().default('entity'),
  metadata: text('metadata')
});

export const projectImages = sqliteTable('project_images', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  caption: text('caption'),
  altText: text('alt_text'),
  createdAt: text('created_at').notNull()
});

export const imageEntityLinks = sqliteTable('image_entity_links', {
  id: text('id').primaryKey(),
  imageId: text('image_id')
    .notNull()
    .references(() => projectImages.id),
  entityId: text('entity_id').notNull(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id)
});

export const customFieldDefs = sqliteTable('custom_field_defs', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  entityType: text('entity_type').notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull(),
  refEntityType: text('ref_entity_type'),
  placeholder: text('placeholder'),
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0)
});

export const projectMembers = sqliteTable('project_members', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role').notNull(),
  createdAt: text('created_at').notNull()
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false)
});

export const instanceSettings = sqliteTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const projectPins = sqliteTable(
  'project_pins',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    createdAt: text('created_at').notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.projectId] })]
);

export const projectInvites = sqliteTable('project_invites', {
  token: text('token').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  role: text('role').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false)
});
