/**
 * Database Migration Runner
 *
 * Runs all pending SQL migrations from src/scripts/migrations/ in alphabetical order.
 * Tracks applied migrations in a `schema_migrations` table to avoid re-running.
 *
 * Usage:
 *   npm run db:migrate              # Apply pending migrations
 *   npm run db:migrate -- --status  # Show migration status
 *   npm run db:migrate -- --mark-all-applied  # Mark all as applied without running
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function createPool(): Pool {
  const sslEnv = (process.env.DATABASE_SSL || '').toLowerCase();
  const shouldUseSSL =
    process.env.NODE_ENV === 'production' || sslEnv === 'true';

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    max: 1,
  });
}

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name'
  );
  return new Set(result.rows.map((r) => r.name));
}

function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function runMigration(
  pool: Pool,
  filename: string
): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      [filename]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function showStatus(pool: Pool): Promise<void> {
  const applied = await getAppliedMigrations(pool);
  const files = getMigrationFiles();

  console.log(`\n  Migrations (${files.length} total)\n`);

  for (const file of files) {
    const status = applied.has(file) ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
    console.log(`  ${status}  ${file}`);
  }

  const pending = files.filter((f) => !applied.has(f));
  console.log(
    `\n  ${applied.size} applied, ${pending.length} pending\n`
  );
}

async function markAllApplied(pool: Pool): Promise<void> {
  const applied = await getAppliedMigrations(pool);
  const files = getMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('All migrations already marked as applied.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of pending) {
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file]
      );
      console.log(`  Marked: ${file}`);
    }
    await client.query('COMMIT');
    console.log(`\nMarked ${pending.length} migrations as applied.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pool = createPool();

  try {
    await ensureTrackingTable(pool);

    if (args.includes('--status')) {
      await showStatus(pool);
      return;
    }

    if (args.includes('--mark-all-applied')) {
      await markAllApplied(pool);
      return;
    }

    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Running ${pending.length} migration(s)...\n`);

    for (const file of pending) {
      process.stdout.write(`  Applying ${file}...`);
      try {
        await runMigration(pool, file);
        console.log(' \x1b[32mdone\x1b[0m');
      } catch (error) {
        console.log(' \x1b[31mFAILED\x1b[0m');
        const err = error as Error;
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
      }
    }

    console.log(`\n${pending.length} migration(s) applied successfully.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration runner failed:', err.message);
  process.exit(1);
});
