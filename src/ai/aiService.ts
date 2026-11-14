// App 侧 AI 服务：只和自己的网关说话，永远不直连百炼（Key 不进客户端）
import type { ParsedTx } from './protocol';

// P0 开发期：改成你电脑的局域网 IP（手机与电脑同 WiFi），如 http://192.168.1.10:8787
export const GATEWAY_URL = 'http://192.168.1.10:8787';

export async function parseNaturalLanguage(
  text: string, categories: string[], accounts: string[], deviceId: string
): Promise<ParsedTx[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${GATEWAY_URL}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        text, categories, accounts, deviceId,
        todayISO: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({} as any));
      throw new Error(e.error || `网关错误 ${res.status}`);
    }
    const data = (await res.json()) as { bills: ParsedTx[] };
    return (data.bills ?? []).filter((b) => b.amountCents > 0);
  } finally {
    clearTimeout(timer);
  }
}
