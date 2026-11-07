# 英雄征召工作台 · Vue 3 版（课程 2）

本仓库同一套素材与规则的**三个框架实现**之一。本分支只含 Vue 3 版项目。

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 课程 1 · 原生 HTML/CSS/JS + 源素材 | ✅ |
| **`Vue3`** | 课程 2 · **本分支** | ✅ |
| `React` | 课程 3 · React 19 单页对局 | ✅ |
| `Angular` | 课程 4 · 未开工 | ⏳ |

---

## 技术栈

| 项 | 版本 |
|---|---|
| Vue | `^3.5.42`（组合式 API，`<script setup>`） |
| Vite | `^8.2.2` |
| Pinia | `^4.1.0` |
| Vue Router | `^5.4.0` |
| Node 要求 | `^22.18.0 \|\| >=24.12.0` |

纯 JavaScript，无 TypeScript、无 UI 库、无图标库。

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` 产出 `dist/`；`npm run preview` 预览产物。

## 素材还原（本分支不含 images）

按约定 `images/` 只放在 `main` 分支。本分支需要素材时从 `main` 取：

```bash
# 在仓库根目录执行
git archive main images | tar -x            # 得到 ./images（133 头像 + 133 封面）
mkdir -p public/heroes
cp -r images/avatar public/heroes/avatar
cp -r images/cover  public/heroes/cover
```

或使用内置脚本（脚本默认源路径是 `../../images`，本分支项目根就是仓库根，需按实际情况调整一层）：

```bash
npm run sync:assets
```

> `public/heroes/` 已在 `.gitignore` 中排除，不入库；`heroes.json` 在 `src/data/`。

## 三页结构

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 选人页 | 六大区块 + 常驻底部操作条 |
| `/poster` | 海报页 | 确认阵容后跳转，只读快照（双方 5 位、禁用名单、规则、确认时间） |
| `/settings` | 设置页 | 每步秒数（10/20/30）、禁用是否计时、先后手、顺序预设 |

路由守卫：未确认阵容直访 `/poster` 会重定向回选人页。

## 核心口径

- **单人座位**：我占蓝方第 3 位（ban 第 4 步 / pick 第 14 步），其余 18 步系统每 700 ms 代选。
- **两段式**：点卡 = 预选，再点同一张 = 确认落账；我的 pick 落账后整池锁定。
- **计时**：只有我的 pick 步计时（`banTimed` 开启时 ban 步也计），系统步不跳秒。
- **令牌**：每次动作携带 `{ epoch, stepIndex }`，旧步 / 旧局的回调一律被拒。
- **搜索**：命中英雄名或称号，三档排序（名前缀 > 名中间 > 仅称号）；仅称号命中的卡片第二行显示称号。
- **职业筛选**：单选，再点已选职业回到「全部」。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` / `build` / `preview` | 开发 / 构建 / 预览 |
| `npm run sync:assets` | 从 `../../images` 同步素材到 `public/heroes` |
| `npm run check:heroes` | 数据断言：133 条、id 唯一、266 张图可达、3 张 png 封面、3 条空 lanes |
| `npm run check:sequence` | 顺序表断言：20 步 / 16 轮、四组预设 |
| `npm run check:components` | 组件契约断言 |
| `npm run check:boundaries` | 四条宪法静态扫描（导入白名单、业务符号黑名单、props 不可写、事件白名单） |
| `npm run check:store` | Pinia 仓库断言（令牌、落账、重置、设置重排） |

## 验收状态

封版时 195 项断言全通过；窄屏（760 / 390）与键盘可访问性已补验；控制台零未处理异常。

## 素材版权

英雄名称、头像与封面版权归腾讯《王者荣耀》所有，仅作教学演示。
