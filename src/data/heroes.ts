/**
 * 英雄数据层：把 heroes.json 的 133 条原始记录整形为页面可直接使用的 Hero 数组。
 * 页面只认本文件导出的 ALL_HEROES，不直接 import JSON，也不自己拼图片路径。
 *
 * 数据在**构建期**打进 bundle（不走 fetch），因此没有加载三态、没有重试、没有取消；
 * 数据质量由 `npm run check:heroes` 静态断言保证。
 */
import raw from './heroes.json'

import type { Hero } from '../rules/types'

/** 133 条原始记录，图片路径仍是相对 v2/ 的 `images/avatar/xxx` */
const records = raw.heroes as unknown as Hero[]

/** 取路径最后一段（含扩展名）。**不能按 id 拼 `.jpg`** —— 封面 3 张是 png */
const basename = (path: string): string => path.split('/').pop() ?? path

/**
 * 原始记录 → 页面可用对象。唯一职责：把 images 的路径改挂到 public 的对外 URL。
 *
 * 文件名（含扩展名）一律取 JSON 里的 basename：
 * 头像 29 jpg + 104 png，封面 130 jpg + 3 png（138 王维、188 大禹、547 卢雅那）。
 */
function mapHero(hero: Hero): Hero {
  return {
    ...hero,
    images: {
      avatar: `/heroes/avatar/${basename(hero.images.avatar)}`,
      cover: `/heroes/cover/${basename(hero.images.cover)}`,
    },
  }
}

/** 133 位英雄，图片路径已可用。**本文件唯一导出。** */
export const ALL_HEROES: readonly Hero[] = records.map(mapHero)
