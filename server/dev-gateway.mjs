// P0 开发网关（本机跑，环境变量 DASHSCOPE_API_KEY 只留在这台机器/以后在函数计算，绝不进 App）
// 上线时本文件逻辑原样迁移到阿里云函数计算。
import http from 'node:http';

const UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const KEY = process.env.DASHSCOPE_API_KEY || '';

const SYSTEM_PROMPT = process.env.__LL_SYSTEM || null; // 占位：正式版由 server/prompt.mjs 共享
const systemPrompt = `你是记账 App 的账单解析器。把用户的自然语言拆成若干笔账，输出 JSON（不要 markdown 代码块）。

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

// 极简配额（商业化预埋：先按设备ID限次，函数计算版换持久化计数）
const quota = new Map();
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 200);

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('模型未返回 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.url === '/health') return json(res, 200, { ok: true });
  if (req.url !== '/parse' || req.method !== 'POST') return json(res, 404, { error: 'not found' });
  if (!KEY) return json(res, 500, { error: 'gateway missing DASHSCOPE_API_KEY' });

  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { error: 'bad json' }); }
  const deviceId = String(body.deviceId || 'anonymous');
  const day = new Date().toISOString().slice(0, 10);
  const used = quota.get(deviceId + day) || 0;
  if (used >= DAILY_LIMIT) return json(res, 429, { error: 'quota exceeded' });
  quota.set(deviceId + day, used + 1);

  const userPrompt = [
    `today=${body.todayISO || new Date().toISOString()}`,
    `categories=${JSON.stringify(body.categories || [])}`,
    `accounts=${JSON.stringify(body.accounts || [])}`,
    `用户输入：${String(body.text || '').slice(0, 500)}`,
  ].join('\n');

  try {
    const t0 = Date.now();
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });
    if (!r.ok) return json(res, 502, { error: `upstream ${r.status}`, detail: (await r.text()).slice(0, 300) });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    // 成本审计埋点（商业化：AI 毛利要能被算出来）
    const usage = data.usage || {};
    console.log(JSON.stringify({ ts: Date.now(), deviceId, model: MODEL, ms: Date.now() - t0, in: usage.prompt_tokens, out: usage.completion_tokens }));
    json(res, 200, { bills: parsed.bills ?? [] });
  } catch (e) {
    json(res, 502, { error: 'parse failed', detail: String(e?.message || e) });
  }
}).listen(Number(process.env.PORT || 8787), () => console.log('LittleLedger dev gateway on :8787'));

