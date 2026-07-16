import pg from 'pg';
import { config } from '../config/env.js';

/**
 * A single shared connection pool. `pg` reads sslmode/other params straight from the
 * connection string, so Neon (`?sslmode=require`) gets TLS and local Docker stays plaintext
 * with no branching here.
 */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
