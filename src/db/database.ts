import * as SQLite from 'expo-sqlite';

// 打开数据库并执行迁移（同步就绪 schema，见 docs/PLAN.md §5）
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('littleledger.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`);
  const row = await db.getFirstAsync<{ v: number | null }>(
    'SELECT CAST(value AS INTEGER) AS v FROM meta WHERE key = 1', ['schema_version']
  );
  const version = row?.v ?? 0;
  if (version < 1) await migrateV1(db);
  if (version !== 1 || !row) {
    await db.runAsync(
      'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['schema_version', '1']);
  }
}

// v1：业务表 + 变更日志（P1 云同步的推送队列）
async function migrateV1(db: SQLite.SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      initial_balance_cents INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'expense',
      parent_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      category_id TEXT REFERENCES categories(id),
      to_account_id TEXT REFERENCES accounts(id),
      note TEXT NOT NULL DEFAULT '',
      occurred_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      batch_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(occurred_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id) WHERE deleted_at IS NULL;
    CREATE TABLE IF NOT EXISTS change_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      op TEXT NOT NULL,             -- upsert | delete
      payload TEXT,                 -- 序列化后的行；delete 时为 NULL
      at INTEGER NOT NULL
    );`);
  });
}

export async function logChange(
  db: SQLite.SQLiteDatabase, table: string, rowId: string, op: 'upsert' | 'delete', payload?: object
) {
  await db.runAsync(
    'INSERT INTO change_log(table_name,row_id,op,payload,at) VALUES(?,?,?,?,?)',
    [table, rowId, op, payload ? JSON.stringify(payload) : null, Date.now()]);
}
