import { getPool, hasDatabase } from "../db/pool.js";
import { config } from "../config.js";
import { getSqlite, initSqlite } from "../db/sqlite/connection.js";
import type { Store } from "./store.interface.js";
import { PostgresStore } from "./store.postgres.js";
import { SqliteStore } from "./store.sqlite.js";

let storeInstance: Store | null = null;

export async function initStore(): Promise<Store> {
  if (storeInstance) return storeInstance;

  if (hasDatabase()) {
    storeInstance = new PostgresStore(getPool());
    console.log("Store: PostgreSQL");
  } else {
    storeInstance = new SqliteStore(initSqlite());
    console.log(`Store: SQLite (${config.SQLITE_PATH})`);
  }

  return storeInstance;
}

export function getStore(): Store {
  if (!storeInstance) {
    throw new Error("Store не инициализирован. Вызовите initStore() при старте.");
  }
  return storeInstance;
}
