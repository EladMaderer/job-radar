import pg from 'pg';
import { dbConfig } from '../config/db.js';

/**
 * A single shared connection pool. Depends on the DB-only config so anything importing the pool
 * (migrations, dashboard API) needs just DATABASE_URL, not the full notifier config. `pg` reads
 * sslmode/other params straight from the connection string, so Neon (`?sslmode=require`) gets
 * TLS and local Docker stays plaintext with no branching here.
 */
export const pool = new pg.Pool({ connectionString: dbConfig.DATABASE_URL });

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
