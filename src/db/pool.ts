import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!config.DATABASE_URL) {
      throw new Error("DATABASE_URL не задан");
    }
    pool = new Pool({ connectionString: config.DATABASE_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function hasDatabase(): boolean {
  return Boolean(config.DATABASE_URL);
}
