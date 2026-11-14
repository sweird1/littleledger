// AI 一句话记账：提示词与结构化输出协议（与网关共用，改这里要同步网关）

export interface ParsedTx {
  type: 'expense' | 'income' | 'transfer';
  amountCents: number;      // 人民币分
  categoryName: string | null; // 必须来自传入的分类名，否则 null -> 归入"其他"
  accountName: string | null;  // 用户明确提到账户时给出
  note: string;
  occurredAt: number | null;   // epoch ms；未提及则用当前时间
}

export interface ParseRequest {
  text: string;                 // 用户自然语言
  todayISO: string;             // 服务端注入的"今天"，避免模型日期漂移
  categories: string[];         // 当前用户支出+收入分类名
  accounts: string[];
}

export const SYSTEM_PROMPT = `你是记账 App 的账单解析器。把用户的自然语言拆成若干笔账，输出 JSON（不要 markdown 代码块）。

每笔账字段：
- type: "expense"|"income"|"transfer"（转账=钱从自己一个账户到另一个账户）
- amountCents: 整数，人民币"分"（35元=3500，28.5元=2850）
- categoryName: 只能从给定分类名中选择，判断不了就填 null
- accountName: 用户明确提到支付账户(支付宝/微信/银行卡/现金)才填，否则 null
- note: 简短事项描述（如"午饭"）
- occurredAt: ISO8601 时间；只说了"昨天/上周五/上午"等相对表达时相对 today 计算；未提及则 null

规则：
1. 一句话可能含多笔账，全部拆出。
2. 金额无法确定的片段直接忽略，不要编造。
3. 严格输出：{"bills": [ ... ]}`;

export function buildUserPrompt(req: ParseRequest): string {
  return [
    `today=${req.todayISO}`,
    `categories=${JSON.stringify(req.categories)}`,
    `accounts=${JSON.stringify(req.accounts)}`,
    `用户输入：${req.text}`,
  ].join('\n');
}
