# 英雄征召工作台 · Angular 版（课程 4 / 第 8 课）

本仓库同一套素材与规则的**三个框架实现**之一。

> **状态：移植完成，待对拍收口**（2026-11-07）。初始化、规则层 TS 转写、`DraftStore`、六组件、根组件装配、构建与断言均已完成；与 React 版的逐项对拍（8.3.2）与读码六站（8.4–8.9）进行中。

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 课程 1 · 原生 HTML/CSS/JS + 源素材 | ✅ |
| `Vue3` | 课程 2 · Vue 3 三页应用 | ✅ 封版 |
| `React` | 课程 3 · React 19 单页对局 | ✅ 封版 |
| **`Angular`** | 课程 4 · **本分支** | 🔨 移植完成，对拍中 |

---

## 技术口径

| 项 | 值 |
|---|---|
| 版本 | **Angular 21.2.29**（CLI 同版本；21 已转 LTS，主线 latest 为 22.2.5） |
| 语言 | **TypeScript 5.9**（唯一使用 TS 的一版，`strict` + `strictTemplates` + `noUncheckedIndexedAccess`） |
| 变更检测 | **zoneless**（v21 默认，产物不含 zone.js） |
| 组件 | standalone + OnPush，模板用新控制流（`@if` / `@for` + `track`） |
| 状态 | `signal` / `computed`，集中在 `src/game/draft-store.ts`（`@Injectable({providedIn:'root'})`，对应 Vue 的 Pinia store） |
| 数据 | 编译期 `import heroes.json`（构建期打进 bundle，无请求、无三态） |
| 范围 | 单页完整对局，**不移植** Vue 的路由 / 设置页 / 海报页 |

## 运行步骤

```bash
npm ci                    # 安装依赖（Node ^20.19 || ^22.12 || >=24，本机 24.14.1）
npm run sync:assets       # 还原 public/heroes 素材（133 + 133，源在仓库外的 v2/images）
npm start -- --port 4200  # 开发服务器（vite），浏览器开 http://localhost:4200/
npm run build             # 生产构建（deleteOutputPath 已关，不会清空 dist）
npm test                  # 规则层断言（vitest，21 例）
npm run check:heroes      # 数据静态断言（133 条 / 266 路径 / 边界情况）
```

> 素材不入库（`.gitignore` 已排除 `/public/heroes/`），clone 后必须先跑 `sync:assets`，否则 133 张头像/封面 404。

## 核心口径（与另两版一致）

- 一局 20 步：前 10 禁、后 10 选；双方各禁 5 选 5；顺序模板 `FSFSFSFSFS` / `FSSFFSSFFS`。
- **单人座位**：`MY_SEAT = { side: 'blue', slot: 3 }` → 我的 ban 在第 4 步、pick 在第 14 步；其余 18 步系统每 700 ms 随机代选，轮到我时暂停。
- **两段式交互**：先点 = 预选（只存 id，不进名单），再点同一张 = 落账；我的 pick 落账后**整池锁定**。
- 卡片五态：`'' / preselect / banned / picked-blue / picked-red`；`preselect` **不可 disabled**。
- 计时：只有**我的 pick 步**限时（默认 20 秒），系统步不计时，禁用不限时。
- 动作令牌 `{ epoch, stepIndex }`：计时器在起表那一刻冻结令牌，迟到回调一律拒绝。
- 路径改写：`mapHero` 取 basename **保扩展名**（封面 3 张 png：138 / 188 / 547，不许按 id 拼 `.jpg`）。

## 目录速览

```
src/
  rules/    types.ts / sequence.ts        ← 纯逻辑，依赖里没有一行 @angular/*
  data/     heroes.json / heroes.ts       ← 编译期 import，单导出 ALL_HEROES
  game/     draft-store.ts (+ spec)       ← 对局状态唯一可写入口 + 18 例断言
  components/ site-header / phase-panel / team-slots / hero-pool / hero-card / filter-bar
  app/      app.ts / app.html             ← 根组件：页面局部状态 + 两个定时器 + 装配
scripts/   check-heroes.mjs / sync-assets.mjs
```
