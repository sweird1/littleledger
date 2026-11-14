import type { SQLiteDatabase } from 'expo-sqlite';
import { uuidv4 } from '../util/uuid';

// 首次启动写入默认账户与预置分类
const DEFAULT_ACCOUNTS = [
  { name: '现金', kind: 'cash' },
  { name: '支付宝', kind: 'alipay' },
  { name: '微信', kind: 'wechat' },
  { name: '银行卡', kind: 'bank' },
] as const;

const EXPENSE_CATS: Array<[string, string]> = [
  ['餐饮', '🍜'], ['交通', '🚇'], ['购物', '🛒'], ['居住', '🏠'],
  ['娱乐', '🎮'], ['医疗', '💊'], ['教育', '📚'], ['人情', '🧧'],
  ['通讯', '📱'], ['其他', '📦'],
];
const INCOME_CATS: Array<[string, string]> = [
  ['工资', '💼'], ['奖金', '🏆'], ['兼职', '⏱'], ['理财', '📈'], ['其他收入', '💰'],
];

export async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  const c = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM categories WHERE deleted_at IS NULL');
  if ((c?.n ?? 0) > 0) return;
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const [i, a] of DEFAULT_ACCOUNTS.entries()) {
      const id = uuidv4();
      await db.runAsync(
        'INSERT INTO accounts(id,name,kind,initial_balance_cents,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        [id, a.name, a.kind, 0, i, now, now]);
      await db.runAsync(
        'INSERT INTO change_log(table_name,row_id,op,payload,at) VALUES(?,?,?,?,?)',
        ['accounts', id, 'upsert', JSON.stringify({ id, name: a.name, kind: a.kind }), now]);
    }
    let sort = 0;
    for (const [name, icon] of [...EXPENSE_CATS, ...INCOME_CATS]) {
      const type = EXPENSE_CATS.some(([n]) => n === name) ? 'expense' : 'income';
      const id = uuidv4();
      await db.runAsync(
        'INSERT INTO categories(id,name,icon,type,sort_order,is_system,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        [id, name, icon, type, sort++, 1, now, now]);
      await db.runAsync(
        'INSERT INTO change_log(table_name,row_id,op,payload,at) VALUES(?,?,?,?,?)',
        ['categories', id, 'upsert', JSON.stringify({ id, name, icon, type }), now]);
    }
  });
}

