# 开发指南（Windows 无 Mac 环境）

## 日常开发循环
```bash
npm start          # 启动 Metro，手机装 Expo Go 扫码即调，改代码秒级热更新
```

## AI 一句话记账联调
1. 本机启动网关（Key 只存在于这台机器/未来函数计算，绝不进 App）：
```powershell
$env:DASHSCOPE_API_KEY="sk-xxx"   # 百炼控制台申请
node server\dev-gateway.mjs       # 监听 :8787，含配额与成本日志
```
2. 把 `src/ai/aiService.ts` 的 `GATEWAY_URL` 改成你电脑局域网 IP（手机与电脑同一 WiFi）。

## 目录结构
```
App.tsx                 # 入口：月视图 + 手动记账 + AI 记账编排
src/db/                 # SQLite（同步就绪 schema）+ Repository
src/ai/                 # 协议(protocol.ts) + 客户端服务(aiService.ts)
src/features/ai/        # AI 结果确认页
server/dev-gateway.mjs  # P0 本机 AI 网关 → 以后迁函数计算
docs/PLAN.md            # ★ 项目计划书（决策都在这里）
```

## 冒烟清单
- [ ] 首启自动建表 + 预置账户/分类
- [ ] ＋ 记一笔 → 出现在列表与月支出
- [ ] AI 输入"今天午饭35，昨天打车28.5" → 拆 2 笔 → 确认入库带 AI 标签
- [ ] 长按流水删除（软删 + change_log 记 delete）

## 网络恢复后推送 GitHub（已探明：走 ssh.github.com:443）
```powershell
git remote add origin git@github.com:sweird1/littleledger.git
# 若直连被墙，~/.ssh/config 加：Host github.com / Hostname ssh.github.com / Port 443
git push -u origin main
```
