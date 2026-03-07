import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Cognito Sub
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const groups = pgTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
  }),
);

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const elements = pgTable('elements', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'sticky' | 'rect' | 'circle' | 'arrow' | 'freehand'
  props: jsonb('props').notNull(),
  zIndex: integer('z_index').notNull().default(0),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
