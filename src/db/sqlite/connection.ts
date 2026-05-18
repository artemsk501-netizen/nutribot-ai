import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../../config.js";

let db: DatabaseSync | null = null;

export function getSqlite(): DatabaseSync {
  if (!db) {
    throw new Error("SQLite не инициализирован. Вызовите initSqlite() при старте.");
  }
  return db;
}

export function initSqlite(): DatabaseSync {
  if (db) return db;

  const filePath = path.resolve(config.SQLITE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  return db;
}

export function closeSqlite(): void {
  if (db) {
    db.close();
    db = null;
  }
}
