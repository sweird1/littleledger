// Repository：业务代码唯一的数据入口（UI 禁止直连 SQL）
// 所有写操作在同一事务里记 change_log，为 P1 云同步准备。
import { getDb, logChange } from './database';
import { seedIfEmpty } from './seed';
import { uuidv4 } from '../util/uuid';
import type { Account, Category, Transaction, TxType } from '../types';

type TxRow = {
  id: string; type: string; amount_cents: number; account_id: string;
  category_id: string | null; to_account_id: string | null; note: string;
  occurred_at: number; source: string; batch_id: string | null;
  created_at: number; updated_at: number;
  account_name?: string; category_name?: string; category_icon?: string; to_account_name?: string;
};

const toTx = (r: TxRow): Transaction & { accountName: string; categoryName: string | null; categoryIcon: string | null } => ({
  id: r.id, type: r.type as TxType, amountCents: r.amount_cents,
  accountId: r.account_id, categoryId: r.category_id, toAccountId: r.to_account_id,
  note: r.note, occurredAt: r.occurred_at, source: r.source as Transaction['source'],
  batchId: r.batch_id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: null,
  accountName: r.account_name ?? '', categoryName: r.category_name ?? null, categoryIcon: r.category_icon ?? null,
});

export async function initStorage() {
  const db = await getDb();
  await seedIfEmpty(db);
}

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order');
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, initialBalanceCents: r.initial_balance_cents,
    sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  }));
}

export async function listCategories(type?: TxType): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    type
      ? 'SELECT * FROM categories WHERE deleted_at IS NULL AND type=? ORDER BY sort_order'
      : 'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order',
    type ? [type] : []);
  return rows.map((r) => ({
    id: r.id, name: r.name, icon: r.icon, type: r.type, parentId: r.parent_id,
    sortOrder: r.sort_order, isSystem: r.is_system,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  }));
}

export interface NewTx {
  type: TxType; amountCents: number; accountId: string; categoryId?: string | null;
  toAccountId?: string | null; note?: string; occurredAt?: number;
  source?: Transaction['source']; batchId?: string | null;
}

export async function createTransaction(t: NewTx): Promise<string> {
  const db = await getDb();
  const id = uuidv4();
  const now = Date.now();
  const row = {
    id, type: t.type, amount_cents: t.amountCents, account_id: t.accountId,
    category_id: t.categoryId ?? null, to_account_id: t.toAccountId ?? null,
    note: t.note ?? '', occurred_at: t.occurredAt ?? now, source: t.source ?? 'manual',
    batch_id: t.batchId ?? null, created_at: now, updated_at: now,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO transactions(id,type,amount_cents,account_id,category_id,to_account_id,note,occurred_at,source,batch_id,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id, row.type, row.amount_cents, row.account_id, row.category_id, row.to_account_id,
       row.note, row.occurred_at, row.source, row.batch_id, now, now]);
    await logChange(db, 'transactions', id, 'upsert', row);
  });
  return id;
}

export async function updateTransaction(id: string, patch: NewTx): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transactions SET type=?, amount_cents=?, account_id=?, category_id=?, to_account_id=?,
       note=?, occurred_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL`,
      [patch.type, patch.amountCents, patch.accountId, patch.categoryId ?? null,
       patch.toAccountId ?? null, patch.note ?? '', patch.occurredAt ?? now, now, id]);
    await logChange(db, 'transactions', id, 'upsert', { ...patch, updated_at: now });
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE transactions SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
    await logChange(db, 'transactions', id, 'delete');
  });
}

/** 按月查流水（occurred_at 归日倒序） */
export async function listTransactionsMonth(year: number, month: number) {
  const db = await getDb();
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();
  const rows = await db.getAllAsync<TxRow>(
    `SELECT t.*, a.name AS account_name, c.name AS category_name, c.icon AS category_icon
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC`,
    [start, end]);
  return rows.map(toTx);
}

/** 月度汇总：支出/收入总额（分） */
export async function monthSummary(year: number, month: number) {
  const db = await getDb();
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();
  const r = await db.getFirstAsync<{ expense: number; income: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS expense,
       COALESCE(SUM(CASE WHEN type='income'  THEN amount_cents END),0) AS income
     FROM transactions WHERE deleted_at IS NULL AND occurred_at>=? AND occurred_at<?`,
    [start, end]);
  return { expenseCents: r?.expense ?? 0, incomeCents: r?.income ?? 0 };
}

