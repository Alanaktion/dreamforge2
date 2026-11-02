import { randomBytes } from 'node:crypto';
import { hash } from '$lib/server/password';
import db from './db';
import { migrate } from './migrate';
import { users } from './schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { generateId } from '$lib/utils';

const drizzleDb = drizzle(db);

export async function seed() {
  migrate();

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dreamforge.local').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url');

  const existing = drizzleDb.select().from(users).where(eq(users.email, adminEmail)).get();

  if (!existing) {
    const passwordHash = await hash(adminPassword);
    drizzleDb
      .insert(users)
      .values({
        id: generateId(),
        email: adminEmail,
        username: 'admin',
        passwordHash,
        mustChangePassword: true,
        createdAt: new Date().toISOString()
      })
      .run();

    console.log('Admin user created');
    if (!process.env.ADMIN_PASSWORD)
      console.log(`Initial administrator password (save this now): ${adminPassword}`);
  }
}
