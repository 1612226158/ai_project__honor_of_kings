# 英雄征召工作台 · React 19 版（课程 3）

本仓库同一套素材与规则的**三个框架实现**之一。本分支只含 React 版项目。

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 课程 1 · 原生 HTML/CSS/JS + 源素材 | ✅ |
| `Vue3` | 课程 2 · Vue 3 三页应用 | ✅ |
| **`React`** | 课程 3 · **本分支** | ✅ |
| `Angular` | 课程 4 · 未开工 | ⏳ |

---

## 技术栈

| 项 | 版本 |
|---|---|
| React / React DOM | `^19.3.1` |
| Vite | `^8.3.6` |
| @vitejs/plugin-react | `^6.1.2` |
| oxlint | `^1.90.0`（脚手架自带） |

纯 JavaScript，**不装路由、不装状态库、不装 UI 库**——单页 + Hooks + 内置 `useReducer`。

## 运行

```bash
npm install
npm run dev        # http://localhost:5174（与 Vue 版的 5173 错开，便于并排对拍）
```

## 素材还原（本分支不含 images）

```bash
git archive main images | tar -x            # 得到 ./images
mkdir -p public/heroes
cp -r images/avatar public/heroes/avatar
cp -r images/cover  public/heroes/cover
```

> `heroes.json` 在 `src/data/`，随代码入库；`public/heroes/` 不入库。

## 目录结构

```
src/
├── App.jsx              # 页面装配：状态、派生、三个 effect、两段式点击
├── main.jsx             # 入口（StrictMode）
├── style.css            # 与 Vue 版逐字节一致
├── game/draft.js        # ★ 纯规则层：常量 + reducer + 派生，不依赖 React
├── components/          # HeroCard / FilterBar / HeroPool / TeamSlots / PhasePanel / SiteHeader
├── data/                # heroes.js（单导出 allHeroes）+ heroes.json
└── rules/sequence.js    # 顺序表纯函数（与 Vue 版逐字节一致）
scripts/                 # 断言脚本
```

## 设计要点

### 规则层与页面分离

`src/game/draft.js` 不 import React、不 import 数据、不含定时器与随机数，因此可以脱离框架单独断言：

- `STEPS` 20 步顺序表、`MY_STEPS = { ban: 4, pick: 14 }`
- `draftReducer` 五类动作：`reset` / `preselect` / `invalidateIntent` / `choose` / `auto`
- `derive(state)` 一次性产出 `phase / isMyTurn / myPicksDone / stepSeconds / poolState / labels`

三条硬约束：不可变更新（全文件无 `push(`）、随机数由外部传入、英雄对象由调用方给（不查数据表）。

### 三个 effect

| effect | 职责 |
|---|---|
| 系统代选 | 非我的步每 700 ms 推进一步；轮到我时直接返回，不排程 |
| 倒计时 | 只在我的限时步起表；令牌在起表时刻冻结；归零先停表再落账 |
| 预选失效 | 预选英雄被他人禁/选走 → 清预选 + 池上方一行提示 |

### 与 Vue 版的两处有意差异

1. **预选失效提示**：Vue 版该提示 **不可达**（`act()` 落账时无条件清预选，而 watch 要求预选非空），React 版改为「我的步无条件清、他人步保留给 effect 提示」，功能可达。
2. **reducer 自校验**：`choose` 额外校验「必须发生在我的步」；Vue 仅靠页面守卫，绕过 UI 直接派发会替别人落账。

### 本版不做

按需求基线，React/Angular **不移植 Vue 的路由、设置页与海报页**。完成后主按钮变「重新开局」，直接重置（无结果页——2026-11-07 确认保持此取舍）。

## 脚本

| 命令 | 作用 | 实测 |
|---|---|---|
| `npm run dev` / `build` / `preview` | 开发 / 构建 / 预览 | 通过 |
| `npm run lint` | oxlint | 0 warning / 0 error |
| `npm run check:heroes` | 数据断言（133 条 / 266 图可达 / 3 png 封面 / 3 空 lanes） | 全 PASS |
| `npm run check:sequence` | 顺序表断言（20 步 / 16 轮） | 全 PASS |
| `npm run check:draft` | 规则层断言（含令牌四类拒绝、纯度、不可变） | **46/46** |
| `npm run check:reducer` | 真实数据整局走查（Vite `ssrLoadModule` 加载 JSON） | **14/14** |

## 与 Vue 版的对拍结论

用 `Page.addScriptToEvaluateOnNewDocument` 注入 `Math.random = () => 0`，两版跑出**同一局**，再用 CDP 真实点击比对 DOM 文本：

- 4 个对局节点（我的 ban / 预选后 / 落账后 / 我的 pick）：**完全一致**
- 5 组搜索筛选（李 / 李+刺客 / 清空+刺客 / 取消职业 / 大）：**列表与第二行文案全一致**

## 素材版权

英雄名称、头像与封面版权归腾讯《王者荣耀》所有，仅作教学演示。
