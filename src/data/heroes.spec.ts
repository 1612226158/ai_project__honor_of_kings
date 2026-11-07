/**
 * 数据层断言（契约 C2，与 `scripts/check-heroes.mjs` 同一口径的运行时版本）。
 *
 * 本文件只依赖 `data/heroes.ts` + JSON，**不 import 任何 @angular/* 符号** ——
 * 既验证数据映射，也顺带当「规则层之外的冒烟用例」用。
 */
import { describe, expect, it } from 'vitest'

import { ALL_HEROES } from './heroes'

describe('数据层', () => {
  it('133 条，id 唯一且为 105–585 的整数', () => {
    expect(ALL_HEROES.length).toBe(133)
    const ids = ALL_HEROES.map((h) => h.id)
    expect(new Set(ids).size).toBe(133)
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThanOrEqual(105)
      expect(id).toBeLessThanOrEqual(585)
    }
  })

  it('图片路径已改挂 /heroes/ 且保留原扩展名（封面 3 张 png 不许写死 .jpg）', () => {
    for (const hero of ALL_HEROES) {
      expect(hero.images.avatar.startsWith('/heroes/avatar/')).toBe(true)
      expect(hero.images.cover.startsWith('/heroes/cover/')).toBe(true)
    }
    const png = ALL_HEROES.filter((h) => h.images.cover.endsWith('.png')).map((h) => h.id)
    expect(png.sort((a, b) => a - b)).toEqual([138, 188, 547])
  })

  it('已知边界：3 条 lanes 为空、41 条副职业非空', () => {
    const emptyLanes = ALL_HEROES.filter((h) => h.lanes.length === 0).map((h) => h.id)
    expect(emptyLanes.sort((a, b) => a - b)).toEqual([138, 547, 549])
    expect(ALL_HEROES.filter((h) => h.heroType2 !== null).length).toBe(41)
  })
})
