// 规则层断言（第 7 课 7.2 验收）。
// 直接 node 运行即可：draft.js 不 import 英雄数据（heroes.json 在原生 ESM 下 import 不了）。
// 用法：npm run check:draft
import assert from 'node:assert/strict'

import {
  SETTINGS,
  STEPS,
  MY_SEAT,
  MY_STEPS,
  AUTO_STEP_MS,
  createDraft,
  cardStateOf,
  draftReducer,
  poolStateOf,
  derive,
  seatSteps,
} from '../src/game/draft.js'

let passed = 0
let failed = 0

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (err) {
    failed += 1
    console.log(`  FAIL  ${label}`)
    console.log(`        ${err.message.split('\n')[0]}`)
  }
}

const hero = (id) => ({ id, name: `H${id}`, heroType: { code: 1, name: '坦克' }, lanes: [] })
const token = (state) => ({ epoch: state.epoch, stepIndex: state.stepIndex })
const deepFreeze = (o) => {
  Object.freeze(o)
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v)
  }
  return o
}

console.log('\n[1] 顺序表与座位')
check('STEPS 为 20 步', () => assert.equal(STEPS.length, 20))
check('首步为蓝方 ban', () => {
  assert.equal(STEPS[0].side, 'blue')
  assert.equal(STEPS[0].action, 'ban')
})
check('末步为红方 pick', () => {
  assert.equal(STEPS[19].side, 'red')
  assert.equal(STEPS[19].action, 'pick')
})
check('MY_STEPS = { ban: 4, pick: 14 }', () => assert.deepEqual(MY_STEPS, { ban: 4, pick: 14 }))
check('MY_SEAT = 蓝方第 3 位', () => assert.deepEqual(MY_SEAT, { side: 'blue', slot: 3 }))
check('seatSteps 越界返回 -1', () => assert.deepEqual(seatSteps(STEPS, 'blue', 9), { ban: -1, pick: -1 }))

console.log('\n[2] 初始状态')
check('createDraft 七字段齐全', () => {
  const s = createDraft()
  assert.deepEqual(Object.keys(s).sort(), [
    'banned', 'bluePicks', 'epoch', 'intentNotice', 'myIntent', 'redPicks', 'stepIndex',
  ])
  assert.equal(s.epoch, 0)
  assert.equal(s.stepIndex, 0)
})
check('AUTO_STEP_MS = 700', () => assert.equal(AUTO_STEP_MS, 700))
check('SETTINGS 默认值', () =>
  assert.deepEqual(SETTINGS, { pickSeconds: 20, banTimed: false, firstSide: 'blue', preset: 'standard' }),
)
check('第 0 步 stepSeconds 为 null（系统步不计时）', () => assert.equal(derive(createDraft()).stepSeconds, null))
check('我的 pick 步 stepSeconds = 20', () => {
  const s = { ...createDraft(), stepIndex: MY_STEPS.pick }
  assert.equal(derive(s).stepSeconds, 20)
})

console.log('\n[3] reset')
check('epoch +1 且三数组/myIntent 清空', () => {
  const s = { epoch: 3, stepIndex: 2, banned: [hero(1)], bluePicks: [hero(2)], redPicks: [], myIntent: 5, intentNotice: 'x' }
  const next = draftReducer(s, { type: 'reset' })
  assert.equal(next.epoch, 4)
  assert.equal(next.stepIndex, 0)
  assert.deepEqual([next.banned, next.bluePicks, next.redPicks], [[], [], []])
  assert.equal(next.myIntent, null)
  assert.equal(next.intentNotice, '')
})

console.log('\n[4] preselect')
check('同 id 两次 → 设值再取消', () => {
  const s0 = createDraft()
  const s1 = draftReducer(s0, { type: 'preselect', heroId: 7 })
  assert.equal(s1.myIntent, 7)
  const s2 = draftReducer(s1, { type: 'preselect', heroId: 7 })
  assert.equal(s2.myIntent, null)
})
check('换一张 → 替换而非叠加', () => {
  const s1 = draftReducer(createDraft(), { type: 'preselect', heroId: 7 })
  const s2 = draftReducer(s1, { type: 'preselect', heroId: 8 })
  assert.equal(s2.myIntent, 8)
})
check('锁池后不再产生预选', () => {
  const s = { ...createDraft(), stepIndex: MY_STEPS.pick + 1 }
  assert.equal(draftReducer(s, { type: 'preselect', heroId: 7 }).myIntent, null)
})
check('已禁用英雄不可预选', () => {
  const s = { ...createDraft(), banned: [hero(7)] }
  assert.equal(draftReducer(s, { type: 'preselect', heroId: 7 }).myIntent, null)
})

console.log('\n[5] invalidateIntent')
check('命中当前预选才清除并写提示', () => {
  const s = { ...createDraft(), myIntent: 7 }
  const next = draftReducer(s, { type: 'invalidateIntent', heroId: 7, notice: '被抢了' })
  assert.equal(next.myIntent, null)
  assert.equal(next.intentNotice, '被抢了')
})
check('非当前预选不动', () => {
  const s = { ...createDraft(), myIntent: 7, intentNotice: '' }
  assert.equal(draftReducer(s, { type: 'invalidateIntent', heroId: 8, notice: 'x' }), s)
})

console.log('\n[6] 令牌')
check('错误 stepIndex 的 choose 被拒（返回同一引用）', () => {
  const s = createDraft()
  assert.equal(draftReducer(s, { type: 'choose', hero: hero(1), expected: { epoch: 0, stepIndex: 1 } }), s)
})
check('错误 epoch 的 choose 被拒', () => {
  const s = createDraft()
  assert.equal(draftReducer(s, { type: 'choose', hero: hero(1), expected: { epoch: 9, stepIndex: 0 } }), s)
})
check('无令牌被拒', () => {
  const s = createDraft()
  assert.equal(draftReducer(s, { type: 'choose', hero: hero(1) }), s)
})
check('同令牌二次提交被拒', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.ban }
  const t = token(s0)
  const s1 = draftReducer(s0, { type: 'choose', hero: hero(1), expected: t })
  assert.equal(s1.stepIndex, MY_STEPS.ban + 1)
  const s2 = draftReducer(s1, { type: 'choose', hero: hero(2), expected: t })
  assert.equal(s2, s1)
})
check('非我的步 choose 被拒（reducer 自校验）', () => {
  const s = createDraft() // step 0 是系统步
  assert.equal(draftReducer(s, { type: 'choose', hero: hero(1), expected: token(s) }), s)
})
check('我的 ban 步 choose 正常', () => {
  const s = { ...createDraft(), stepIndex: MY_STEPS.ban }
  const next = draftReducer(s, { type: 'choose', hero: hero(1), expected: token(s) })
  assert.equal(next.stepIndex, MY_STEPS.ban + 1)
})

console.log('\n[7] 落账与不可变')
check('正常落账：步号 +1、目标数组 +1', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.ban }
  const s1 = draftReducer(s0, { type: 'choose', hero: hero(1), expected: token(s0) })
  assert.equal(s1.stepIndex, MY_STEPS.ban + 1)
  assert.equal(s1.banned.length, 1)
  assert.equal(s1.banned[0].id, 1)
})
check('原 state 未被修改', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.ban }
  draftReducer(s0, { type: 'choose', hero: hero(1), expected: token(s0) })
  assert.equal(s0.stepIndex, MY_STEPS.ban)
  assert.equal(s0.banned.length, 0)
})
check('已占用英雄再次提交被拒', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.ban, banned: [hero(1)] }
  assert.equal(draftReducer(s0, { type: 'choose', hero: hero(1), expected: token(s0) }), s0)
})
check('深冻结的 state 跑 reducer 不报错', () => {
  const s = deepFreeze({ ...createDraft(), stepIndex: MY_STEPS.ban })
  assert.doesNotThrow(() => draftReducer(s, { type: 'choose', hero: hero(1), expected: token(s) }))
})

console.log('\n[7.5] 预选与落账的清理责任')
check('他人步 auto 取走预选 → 预选保留（交给页面 effect 提示）', () => {
  const s0 = { ...createDraft(), myIntent: 2 } // stepIndex 0 是系统步
  const s1 = draftReducer(s0, { type: 'auto', heroes: [hero(1), hero(2)], random: 0.9, expected: token(s0) })
  assert.equal(s1.banned.length, 1)
  assert.equal(s1.banned[0].id, 2)
  assert.equal(s1.myIntent, 2) // 不清，等 effect
})
check('我的步 choose 命中预选 → 静默清空', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.pick, myIntent: 2 }
  const s1 = draftReducer(s0, { type: 'choose', hero: hero(2), expected: token(s0) })
  assert.equal(s1.myIntent, null)
  assert.equal(s1.bluePicks.length, 1)
})
check('我的步超时 auto 命中预选 → 静默清空', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.pick, myIntent: 2 }
  const s1 = draftReducer(s0, { type: 'auto', heroes: [hero(1), hero(2)], random: 0.9, expected: token(s0) })
  assert.equal(s1.bluePicks[0].id, 2)
  assert.equal(s1.myIntent, null)
})
check('我的步超时但系统选了别人 → 预选也必须清（不留锁定角标）', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.pick, myIntent: 2 }
  const s1 = draftReducer(s0, { type: 'auto', heroes: [hero(1), hero(2)], random: 0, expected: token(s0) })
  assert.equal(s1.bluePicks[0].id, 1) // 系统选了 1，不是我预选的 2
  assert.equal(s1.myIntent, null) // 关键：不能残留
})
check('我的步 choose 了别的英雄（理论不可达）→ 预选也清', () => {
  const s0 = { ...createDraft(), stepIndex: MY_STEPS.ban, myIntent: 2 }
  const s1 = draftReducer(s0, { type: 'choose', hero: hero(1), expected: token(s0) })
  assert.equal(s1.myIntent, null)
})
check('他人步 auto 取走别的英雄 → 预选不受影响', () => {
  const s0 = { ...createDraft(), myIntent: 3 }
  const s1 = draftReducer(s0, { type: 'auto', heroes: [hero(1), hero(2), hero(3)], random: 0, expected: token(s0) })
  assert.equal(s1.banned[0].id, 1)
  assert.equal(s1.myIntent, 3)
})

console.log('\n[8] auto 与纯度')
check('random=0 → 取可用池第一个', () => {
  const s0 = createDraft()
  const heroes = [hero(1), hero(2), hero(3)]
  const s1 = draftReducer(s0, { type: 'auto', heroes, random: 0, expected: token(s0) })
  assert.equal(s1.banned[0].id, 1)
})
check('跳过已占用英雄', () => {
  const s0 = { ...createDraft(), banned: [hero(1)] }
  const heroes = [hero(1), hero(2), hero(3)]
  const s1 = draftReducer(s0, { type: 'auto', heroes, random: 0, expected: token(s0) })
  assert.equal(s1.banned[1].id, 2)
})
check('random 越界（1.0）不取到 undefined', () => {
  const s0 = createDraft()
  const s1 = draftReducer(s0, { type: 'auto', heroes: [hero(1), hero(2)], random: 1, expected: token(s0) })
  assert.equal(s1.stepIndex, 1)
  assert.equal(s1.banned[0].id, 2)
})
check('同一 state + action 连跑两次结果一致', () => {
  const s0 = createDraft()
  const action = { type: 'auto', heroes: [hero(1), hero(2), hero(3)], random: 0.37, expected: token(s0) }
  assert.equal(
    JSON.stringify(draftReducer(s0, action)),
    JSON.stringify(draftReducer(s0, action)),
  )
})
check('未知动作原样返回', () => {
  const s = createDraft()
  assert.equal(draftReducer(s, { type: 'nope' }), s)
  assert.equal(draftReducer(s, null), s)
})

console.log('\n[9] 派生')
check('初始：phase=ban、currentSide=blue、非我回合、未锁池', () => {
  const d = derive(createDraft())
  assert.equal(d.phase, 'ban')
  assert.equal(d.currentSide, 'blue')
  assert.equal(d.isMyTurn, false)
  assert.equal(d.myPicksDone, false)
  assert.equal(d.isFinished, false)
})
check('走完 20 步：phase=confirm、isFinished=true', () => {
  const d = derive({ ...createDraft(), stepIndex: 20 })
  assert.equal(d.phase, 'confirm')
  assert.equal(d.isFinished, true)
  assert.equal(d.currentStep, null)
})
check('轮到我：ban 步 isMyTurn=true', () => {
  const d = derive({ ...createDraft(), stepIndex: MY_STEPS.ban })
  assert.equal(d.isMyTurn, true)
  assert.equal(d.myPicksDone, false)
})
check('我的 pick 之后锁池', () => {
  assert.equal(derive({ ...createDraft(), stepIndex: MY_STEPS.pick }).myPicksDone, false)
  assert.equal(derive({ ...createDraft(), stepIndex: MY_STEPS.pick + 1 }).myPicksDone, true)
})
check('poolState / labels 含 preselect', () => {
  const s = { ...createDraft(), myIntent: 9 }
  const pool = poolStateOf(s)
  assert.equal(pool[9], 'preselect')
  assert.equal(derive(s).labels[9], '预选')
})
check('预选不覆盖已占用态', () => {
  const s = { ...createDraft(), banned: [hero(9)], myIntent: 9 }
  assert.equal(poolStateOf(s)[9], 'banned')
})
check('cardStateOf 优先级 banned > 蓝 > 红', () => {
  const s = { ...createDraft(), banned: [hero(1)], bluePicks: [hero(1)], redPicks: [hero(1)] }
  assert.equal(cardStateOf(s, 1), 'banned')
  assert.equal(cardStateOf({ ...createDraft(), redPicks: [hero(1)] }, 1), 'picked-red')
  assert.equal(cardStateOf(createDraft(), 1), '')
})

console.log(`\n结果：${passed}/${passed + failed} 通过`)
if (failed) process.exit(1)
