/**
 * 类型定义（第 8 课 8.4）。
 *
 * 字段说明与 Vue 版 `data/heroes.js` 顶部的 JSDoc 是**同一份说明的两种写法**，
 * 不是新设计。本文件不导出任何运行时代码，只有类型。
 */

/** 阵营。F = 先手方、S = 后手方，具体颜色由 firstSide 决定 */
export type Side = 'blue' | 'red'

/** 卡片的「占用态」：这三种状态下不可再被选中 */
export type Occupied = 'banned' | 'picked-blue' | 'picked-red'

/**
 * 卡片的显示态（五态）。
 * `preselect` 是显示态而非占用态 —— 它必须保持可点击，否则「再点同一张卡确认」无法进行。
 */
export type CardState = '' | 'preselect' | Occupied

export interface HeroTypeRef {
  code: number
  name: string
}

/**
 * 英雄（页面使用口径）。
 * 原始记录比这里多 4 个字段（ename、attributes、detailUrl、source），用 `...r` 原样透传，不做裁剪。
 */
export interface Hero {
  /** 唯一数值标识（105–585），作列表 track 与禁选判断 */
  id: number
  name: string
  /** 称号（如「恋之微风」），搜索也要命中 */
  title: string
  /** 主职业，六类 */
  heroType: HeroTypeRef
  /** 副职业，41 位有，其余为 null */
  heroType2: HeroTypeRef | null
  /** 推荐分路，可能为空数组（3 条：138 / 547 / 549）→ 渲染用 `lanes[0] ?? '—'` */
  lanes: string[]
  /** 项目内绝对路径，形如 /heroes/avatar/105.jpg；扩展名由 JSON 保留（封面有 3 张 png） */
  images: { avatar: string; cover: string }
}

/** 顺序表的一步（`buildSequence` 的产物） */
export interface Step {
  side: Side
  action: 'ban' | 'pick'
  turnIndex: number
  indexInTurn: number
  turnSize: number
  isFirstOfTurn: boolean
  isLastOfTurn: boolean
  isFirstOfAction: boolean
  isLastOfAction: boolean
}

/**
 * 动作令牌：一次动作必须携带**创建时**的 epoch + stepIndex。
 * 计时器与异步回调里的令牌必须在起表/排程那一刻冻结，迟到回调一律被拒。
 */
export interface DraftToken {
  epoch: number
  stepIndex: number
}

/** 阶段面板的三步标记（纯展示） */
export interface StepMark {
  no: string
  label: string
  state: 'current' | 'complete' | ''
}
