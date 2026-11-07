/**
 * 对局规则断言（第 8 课 8.2 第 7 条 / 契约 C3–C7）。
 *
 * 与另两版的差别只在载体：Vue/React 用 `scripts/check-*.mjs`（靠 Vite 的 ssrLoadModule 才吃得下 JSON），
 * Angular 的规则层是 TS，这里交给脚手架默认的 vitest —— 零额外依赖、原生吃 TS + JSON。
 *
 * 断言口径与 `heros-reactjs/scripts/check-draft.mjs` 一致，便于三版对读。
 */
import { describe, expect, it } from 'vitest'

import { ALL_HEROES } from '../data/heroes'
import { DraftStore, MY_STEPS, STEPS } from './draft-store'
import type { DraftToken } from '../rules/types'

/** 取当前第一个可用英雄（确定性，便于复跑） */
function firstAvailable(store: DraftStore): number {
  const hero = ALL_HEROES.find((h) => store.cardState(h.id) === '')
  if (!hero) throw new Error('可用池为空')
  return hero.id
}

/** 走完一整局：我的两步「预选 → 确认」，其余走 autoStep */
function playFullGame(store: DraftStore): void {
  advanceTo(store, 20)
}

/**
 * 推进到指定步号：**必须处理我的两步** ——
 * 轮到我时 `autoStep()` 会拒绝代选，直接 while + autoStep 会在第 4 步空转。
 */
function advanceTo(store: DraftStore, targetIndex: number): void {
  for (let guard = 0; guard < 100 && store.stepIndex() < targetIndex; guard++) {
    if (store.isMyTurn()) {
      const id = firstAvailable(store)
      store.handleCardClick(id, store.token()) // 预选
      store.handleCardClick(id, store.token()) // 落账
    } else if (!store.autoStep()) {
      throw new Error(`第 ${store.stepIndex()} 步推进失败`)
    }
  }
}

describe('初始状态', () => {
  it('顺序表 20 步，前 10 ban 后 10 pick', () => {
    expect(STEPS.length).toBe(20)
    expect(STEPS.filter((s) => s.action === 'ban').length).toBe(10)
    expect(STEPS.filter((s) => s.action === 'pick').length).toBe(10)
  })

  it('我的座位蓝 3 → ban 第 4 步 / pick 第 14 步', () => {
    expect(MY_STEPS).toEqual({ ban: 4, pick: 14 })
  })

  it('epoch 0、三名单为空、预选为空、第 0 步不计时', () => {
    const store = new DraftStore()
    expect(store.epoch()).toBe(0)
    expect(store.stepIndex()).toBe(0)
    expect(store.banned()).toEqual([])
    expect(store.bluePicks()).toEqual([])
    expect(store.redPicks()).toEqual([])
    expect(store.myIntent()).toBeNull()
    expect(store.intentNotice()).toBe('')
    expect(store.stepSeconds()).toBeNull()
    expect(store.isMyTurn()).toBe(false)
    expect(store.myPicksDone()).toBe(false)
  })
})

describe('落账与令牌', () => {
  it('合法令牌落账后步号 +1', () => {
    const store = new DraftStore()
    const id = firstAvailable(store)
    expect(store.act(id, store.token())).toBe(true)
    expect(store.stepIndex()).toBe(1)
    expect(store.banned().map((h) => h.id)).toEqual([id])
  })

  it('同一令牌二次提交被拒（只有第一次生效）', () => {
    const store = new DraftStore()
    const token: DraftToken = store.token()
    expect(store.act(firstAvailable(store), token)).toBe(true)
    expect(store.act(firstAvailable(store), token)).toBe(false)
    expect(store.stepIndex()).toBe(1)
  })

  it('无令牌 / 空令牌被拒', () => {
    const store = new DraftStore()
    expect(store.act(firstAvailable(store), null as unknown as DraftToken)).toBe(false)
    expect(store.stepIndex()).toBe(0)
  })

  it('已占用英雄被拒', () => {
    const store = new DraftStore()
    const id = firstAvailable(store)
    store.act(id, store.token())
    expect(store.act(id, store.token())).toBe(false)
  })

  it('reset 后旧局令牌被拒，epoch +1（即使本就在第 0 步）', () => {
    const store = new DraftStore()
    const old = store.token()
    store.reset()
    expect(store.epoch()).toBe(1)
    expect(store.act(firstAvailable(store), old)).toBe(false)
    expect(store.stepIndex()).toBe(0)
  })
})

describe('两段式预选（契约 C5）', () => {
  it('非我的步点击只产生预选，不落账', () => {
    const store = new DraftStore()
    const id = firstAvailable(store)
    store.handleCardClick(id, store.token())
    expect(store.myIntent()).toBe(id)
    expect(store.stepIndex()).toBe(0)
    expect(store.banned()).toEqual([])
    expect(store.poolState()[id]).toBe('preselect')
  })

  it('再点同一张取消预选', () => {
    const store = new DraftStore()
    const id = firstAvailable(store)
    store.handleCardClick(id, store.token())
    store.handleCardClick(id, store.token())
    expect(store.myIntent()).toBeNull()
    expect(store.poolState()[id]).toBeUndefined()
  })

  it('轮到我时点预选卡 → 落账；点其它卡 → 只改预选', () => {
    const store = new DraftStore()
    // 推进到我的 ban 步（第 4 步）
    advanceTo(store, MY_STEPS.ban)
    expect(store.isMyTurn()).toBe(true)

    const intentId = firstAvailable(store)
    store.handleCardClick(intentId, store.token())
    expect(store.stepIndex()).toBe(MY_STEPS.ban)

    // 点其它卡：只改预选
    const otherId = ALL_HEROES.find((h) => h.id !== intentId && store.cardState(h.id) === '')!.id
    store.handleCardClick(otherId, store.token())
    expect(store.myIntent()).toBe(otherId)
    expect(store.stepIndex()).toBe(MY_STEPS.ban)

    // 点预选卡：落账（此前 4 步已禁用 4 位，故落账后为 5 条）
    store.handleCardClick(otherId, store.token())
    expect(store.stepIndex()).toBe(MY_STEPS.ban + 1)
    expect(store.banned().map((h) => h.id)).toContain(otherId)
    expect(store.banned().length).toBe(MY_STEPS.ban + 1)
    expect(store.myIntent()).toBeNull()
  })

  it('我的 pick 落账后整池锁定：点击完全无效', () => {
    const store = new DraftStore()
    advanceTo(store, MY_STEPS.pick + 1)
    expect(store.myPicksDone()).toBe(true)

    const before = {
      step: store.stepIndex(),
      intent: store.myIntent(),
      banned: store.banned().length,
      blue: store.bluePicks().length,
      red: store.redPicks().length,
    }
    const id = firstAvailable(store)
    store.handleCardClick(id, store.token())
    expect(store.stepIndex()).toBe(before.step)
    expect(store.myIntent()).toBe(before.intent)
    expect(store.banned().length).toBe(before.banned)
    expect(store.bluePicks().length).toBe(before.blue)
    expect(store.redPicks().length).toBe(before.red)
  })
})

describe('预选失效（契约 C5.4）', () => {
  it('预选被系统取走 → 清除预选并给出一行提示', () => {
    const store = new DraftStore()
    // 逼系统一定取走预选：覆盖 Math.random 让可用池取第一个
    const intentId = firstAvailable(store)
    store.handleCardClick(intentId, store.token())
    expect(store.myIntent()).toBe(intentId)

    const original = Math.random
    Math.random = () => 0 // 恒取可用池第一个 = 刚预选的那位
    try {
      expect(store.autoStep()).toBe(true)
    } finally {
      Math.random = original
    }

    expect(store.myIntent()).toBeNull()
    expect(store.intentNotice()).toContain('预选已清除')
  })

  it('我的步超时随机后预选清空，且不残留角标', () => {
    const store = new DraftStore()
    advanceTo(store, MY_STEPS.pick)
    expect(store.isMyTurn()).toBe(true)

    const intentId = firstAvailable(store)
    store.handleCardClick(intentId, store.token())
    expect(store.myIntent()).toBe(intentId)

    const token = store.token()
    const original = Math.random
    Math.random = () => 0.999 // 故意不取预选那张
    try {
      expect(store.autoAssign(token)).toBe(true)
    } finally {
      Math.random = original
    }

    expect(store.myIntent()).toBeNull()
    expect(store.myPicksDone()).toBe(true)
  })
})

describe('整局不变量（契约 C7）', () => {
  it('走完 20 步：10 禁 / 蓝 5 / 红 5，且完美收官', () => {
    const store = new DraftStore()
    playFullGame(store)

    expect(store.stepIndex()).toBe(20)
    expect(store.isFinished()).toBe(true)
    expect(store.phase()).toBe('confirm')
    expect(store.banned().length).toBe(10)
    expect(store.bluePicks().length).toBe(5)
    expect(store.redPicks().length).toBe(5)
  })

  it('步号 = 三名单长度和；并集无重复；容量不越界', () => {
    const store = new DraftStore()
    playFullGame(store)

    const banned = store.banned()
    const blue = store.bluePicks()
    const red = store.redPicks()
    const ids = [...banned, ...blue, ...red].map((h) => h.id)

    expect(store.stepIndex()).toBe(banned.length + blue.length + red.length)
    expect(new Set(ids).size).toBe(ids.length) // 全局唯一
    expect(banned.length).toBeLessThanOrEqual(10)
    expect(blue.length).toBeLessThanOrEqual(5)
    expect(red.length).toBeLessThanOrEqual(5)
  })

  it('整局结束后不再接受任何落账', () => {
    const store = new DraftStore()
    playFullGame(store)
    expect(store.act(ALL_HEROES[0]!.id, store.token())).toBe(false)
    expect(store.autoStep()).toBe(false)
  })

  it('重置后可重新走满一局（epoch 递增，名单清零）', () => {
    const store = new DraftStore()
    playFullGame(store)
    store.reset()
    expect(store.stepIndex()).toBe(0)
    expect(store.epoch()).toBe(1)
    expect(store.banned()).toEqual([])

    playFullGame(store)
    expect(store.stepIndex()).toBe(20)
    expect(store.epoch()).toBe(1)
  })
})
