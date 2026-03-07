import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
const db = drizzle(pool);

await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
console.log('Migration complete');
await pool.end();
