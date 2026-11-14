# LittleLedger 小账本 · 项目计划书

> 状态：P0 开发中 ｜ 更新：2026-11-14 ｜ 本文档随版本迭代持续修订

## 1. 产品定位

- 中文名：**小账本**；英文名：**LittleLedger**
- 一句话定位：界面极简、但后台功能强大的 AI 记账 App——记一笔只要 3 秒，一句话就能记账。
- 差异化（来自 2026-11 市场调研）：现有产品"极简"与"强功能"二选一（鲨鱼够简但没预算/资产；随手记全但臃肿广告多）。我们做 **极简外壳 + 预算/净资产/多账本内核 + AI 自然语言记账**。
- 路线：先个人自用 → 商业化上架（iOS 优先，Android 跟进）。

## 2. 技术选型

| 项 | 决定 | 理由 |
|---|---|---|
| 框架 | React Native + Expo (SDK 58, TypeScript) | 开发机仅 Windows：Expo Go 扫码热调试，无需 Mac；EAS 云构建出 IPA；一套代码双端 |
| 本地存储 | expo-sqlite，**同步就绪 schema**（见 §5） | 商业化核心资产是用户数据，schema 第一天就要支持云同步，避免迁移灾难 |
| AI | 阿里云百炼 千问（OpenAI 兼容接口 + JSON 结构化输出） | 自然语言→账单提取；国内延迟低、价格可控 |
| AI 网关 | 阿里云函数计算（P1 上线；P0 阶段本地 Node 代理调试） | **API Key 绝不进客户端**；顺带做限流/配额/成本埋点 |
| 账号 | P0 匿名设备 ID；P1 绑手机/Apple 登录 | 不依赖 iCloud，用户资产归自有账号体系 |
| 图表 | react-native-chart-kit 或 victory-native（P0 后期定） | 月度报表 |

## 3. 商业化倒逼的架构决策（第一天就生效）

1. **自有账号体系**，不依赖 iCloud；换机/多端/订阅都挂自有账号。
2. **同步就绪数据层**：全表 UUID 主键 + updated_at + 软删除墓碑 + change_log 表；业务代码只走 Repository 层。
3. **AI 走服务端网关**：客户端永不持有百炼 Key；网关记录每用户调用量。
4. **Entitlements 抽象**：本地权限对象（plan: free|pro, aiQuota, features[]），P0 恒为 free+充足配额；接 IAP 时只换 entitlements 提供方，不动业务。
5. **数据可携带**：P0 就实现导出 CSV/JSON（个保法要求 + 用户信任）。

## 4. 系统架构

```
┌ iPhone (Expo/RN) ────────────┐      ┌ 云端 ──────────────────────┐
│ UI（记账/报表/设置）          │      │ AI 网关（函数计算）          │
│  Entitlements 抽象           │─HTTPS→  鉴权(设备ID)→限流→千问→审计 │
│  Repository 层               │      │ P1: 账号/云同步/账单备份服务  │
│  SQLite（同步就绪 schema）    │      │ P2: RevenueCat / IAP        │
└──────────────────────────────┘      └────────────────────────────┘
```

## 5. 数据模型（同步就绪）

公共列：`id TEXT PRIMARY KEY (uuid4)`、`created_at`、`updated_at`、`deleted_at NULLABLE`（墓碑）、`sync_seq INTEGER`。

- `accounts` 账户（现金/银行卡/支付宝/微信…，含初始余额）
- `categories` 分类（树状，预置+自定义）
- `transactions` 流水（金额分存储 INTEGER、type: expense|income|transfer、account_id、category_id、note、occurred_at、source: manual|ai）
- `transaction_splits` AI 一句话多笔拆分后的父子关联
- `budgets` 预算（分类×周期）
- `change_log`（id、table、op、payload、at）——P1 云同步的推送队列
- 所有写操作经 Repository，禁止 UI 直连 SQL。

## 6. 商业模式（草案）

- 免费：手动记账全部核心功能 + 每月少量 AI 记账额度（如 30 笔）
- Pro 订阅（iOS IAP，Android 支付宝/微信走服务端权益）：AI 记账无限/大额配额、多设备云同步、多人共享账本、高级报表、月度 AI 消费洞察
- 定价参考：国内记账类 12–68 元/年 或 连续订阅 1–3 元/周；上线后按 AI 成本校准（千问 turbo 级单次数厘，毛利充足）

## 7. 合规清单（时间敏感项提前启动）

- [ ] P1 启动：后端域名 **ICP 备案**（2–4 周，卡上架）
- [ ] P2 前：Apple Developer 账号 $99/年；隐私政策页；App 内隐私标签
- [ ] P2 前：个保法——账号注销、数据导出（P0 已预埋）
- [ ] P3 国内安卓渠道：软件著作权（登记 1–2 月，提前办）

## 8. 路线图

- **P0 自用 MVP**（当前，Windows + Expo Go）：手动记账闭环、AI 一句话记账（先本地代理后云端）、分类管理、月度报表、CSV/JSON 导出
- **P1 服务化**：函数计算 AI 网关上线、匿名账号、云同步、启动 ICP 备案
- **P2 上架**：Apple 账号、TestFlight→App Store、IAP 订阅、合规文档
- **P3 增长**：多人账本、Android 渠道、AI 消费报告/预算预警

### P0 验收标准
1. 离线可完成 记/改/删/查/月汇总；2. 输入"今天午饭35，昨天打车28.5"能拆成 2 笔待确认入库；3. 冷启动<1s、记一笔<3s；4. 一键导出全部数据。

## 9. 决策日志

- 2026-11-14 定名 小账本/LittleLedger；定栈 Expo+RN+TS+SQLite；因仅有 Windows 放弃原生 SwiftUI，商业化路径经 EAS 云构建不受影响；AI 决策为"服务端网关"模式。
