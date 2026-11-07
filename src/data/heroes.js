/**
 * 英雄数据层：把 heroes.json 的 133 条原始记录整形为页面可直接使用的 Hero 数组。
 * 页面只认本文件导出的 allHeroes，不直接 import JSON，也不自己拼图片路径。
 */

/**
 * 英雄（页面使用口径）。原始记录比这里多 4 个字段（ename、attributes、detailUrl、source），
 * 用 `...r` 原样透传，不做裁剪。
 *
 * @typedef {Object} Hero
 * @property {number} id 唯一数值标识（105–585），作列表 key 与禁选判断
 * @property {string} name 英雄名，展示与搜索
 * @property {string} title 称号（如「恋之微风」），搜索也要命中
 * @property {{ code: number, name: string }} heroType 主职业，六类
 * @property {{ code: number, name: string } | null} heroType2 副职业，41 位有，其余为 null
 * @property {string[]} lanes 推荐分路，可能为空数组（3 条）
 * @property {{ avatar: string, cover: string }} images 项目内绝对路径，形如 /heroes/avatar/105.jpg
 */

import raw from './heroes.json'

/** @type {any[]} 133 条原始记录，图片路径仍是相对 v2/ 的 `images/avatar/xxx` */
const records = raw.heroes

/**
 * 原始记录 → 页面可用对象。唯一职责：把 images 的路径改挂到 public 的对外 URL。
 *
 * 文件名（含扩展名）一律取 JSON 里的 basename，不能按 id 拼：
 * 头像 29 jpg + 104 png，封面 130 jpg + 3 png（138 王维、188 大禹、547 卢雅那）。
 *
 * @param {any} r
 * @returns {Hero}
 */
function mapHero(r) {
  return {
    ...r,
    images: {
      avatar: `/heroes/avatar/${r.images.avatar.split('/').pop()}`,
      cover: `/heroes/cover/${r.images.cover.split('/').pop()}`,
    },
  }
}

/** @type {Hero[]} 133 位英雄，图片路径已可用 */
export const allHeroes = records.map(mapHero)
