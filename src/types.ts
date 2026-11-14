// 领域类型定义（金额一律用「分」整数存储，避免浮点误差）

export type TxType = 'expense' | 'income' | 'transfer';
export type TxSource = 'manual' | 'ai';

export interface Account {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'alipay' | 'wechat' | 'credit' | 'other';
  initialBalanceCents: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;          // emoji
  type: TxType;          // 该分类适用的方向（transfer 用虚拟分类）
  parentId: string | null;
  sortOrder: number;
  isSystem: number;      // 1=预置分类，不可删（可改名）
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number;   // >0
  accountId: string;
  categoryId: string | null;
  toAccountId: string | null;  // transfer 专用
  note: string;
  occurredAt: number;    // epoch ms
  source: TxSource;
  batchId: string | null; // AI 一句话拆出的多笔共享 batchId
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
