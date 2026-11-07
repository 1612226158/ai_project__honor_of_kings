// 仓库断言（5.2–5.6「只建不接」阶段的机器验收）
// 用 Vite 的 transform 管道加载仓库（它 import 了 vue/pinia），配独立 Pinia 实例断言。
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`        期望 ${JSON.stringify(expected)} / 实际 ${JSON.stringify(actual)}`)
}

setActivePinia(createPinia())
const { useDraftStore } = await server.ssrLoadModule('/src/stores/draft.js')
const store = useDraftStore()

console.log('—— 5.2 状态与派生 ——')
check('顺序表 20 步', store.steps.length, 20)
check('初始 epoch = 0', store.epoch, 0)
check('MY_STEPS = {ban:4, pick:14}', store.MY_STEPS, { ban: 4, pick: 14 })
check('settings 默认值', store.settings, {
  pickSeconds: 20,
  banTimed: false,
  firstSide: 'blue',
  preset: 'standard',
})
check('stepSeconds 初始（step 0，系统步）为 null', store.stepSeconds, null)

console.log('\n—— 5.4 act 与令牌 ——')
const free = store.availableHeroes().slice(0, 3)
const token0 = store.currentToken()
check('act 正常落账', store.act(free[0].id, token0), true)
check('步进 1', store.stepIndex, 1)
check('同令牌二次提交被拒', store.act(free[1].id, token0), false)
check('新令牌可继续', store.act(free[1].id, store.currentToken()), true)
check('已占英雄被拒', store.act(free[0].id, store.currentToken()), false)
check('无令牌被拒', store.act(free[2].id, undefined), false)

console.log('\n—— 5.5 resetDraft / confirmDraft ——')
const oldToken = store.currentToken()
const epochBefore = store.epoch
store.resetDraft()
check('重置后 epoch +1（即使回到 0 步）', store.epoch, epochBefore + 1)
check('重置后名单清空', [store.banned.length, store.bluePicks.length, store.redPicks.length], [0, 0, 0])
check('旧局令牌被拒', store.act(free[0].id, oldToken), false)

// 走满 20 步：系统步 autoStep，轮到我的步用 act 模拟"我"落账
for (let i = 0; i < 40 && store.stepIndex < 20; i++) {
  if (store.isMyTurn) {
    store.act(store.availableHeroes()[0].id, store.currentToken())
  } else {
    store.autoStep()
  }
}
check('autoStep 走完 20 步', [store.stepIndex, store.banned.length, store.bluePicks.length, store.redPicks.length], [20, 10, 5, 5])
check('confirm 阶段才能确认', store.confirmDraft(), true)
const snap = store.result
check('快照已生成（含设置与时间）', [snap.banned.length, snap.settings.pickSeconds, typeof snap.confirmedAt], [10, 20, 'string'])
store.banned.push({ id: -9, name: '污染测试' })
check('快照是复制（改对局不影响）', store.result.banned.length, 10)
store.resetDraft()
check('重置清 result、保留 settings', [store.result, store.settings.pickSeconds], [null, 20])

console.log('\n—— 5.6 updateSettings ——')
store.updateSettings({ firstSide: 'red' })
check('红先手：第 1 步是红方 ban', [store.steps[0].side, store.steps[0].action], ['red', 'ban'])
check('改设置后对局已重置（epoch 再 +1、步 0）', [store.stepIndex, store.epoch > epochBefore], [0, true])
// 红先手 pick 段：红10 蓝11 蓝12 红13 红14 蓝15 蓝16 红17 红18 蓝19 → 蓝 3 = 15
check('我的步号随红先手重算', store.MY_STEPS, { ban: 5, pick: 15 })
check('standard：pick 段有 4 个双位轮', store.steps.filter((s) => s.action === 'pick' && s.indexInTurn === 1).length, 4)

store.updateSettings({ preset: 'simple' })
check('simple：pick 段每轮 1 位（无同队连选）', store.steps.slice(10).every((s) => s.turnSize === 1), true)

store.updateSettings({ banTimed: true, pickSeconds: 10 })
// stepSeconds 是 computed，按当前步取值：重置后 stepIndex=0，先推进到我的 ban 步
store.stepIndex = store.MY_STEPS.ban
check('banTimed 开启 → 我的 ban 步 = pickSeconds', store.stepSeconds, 10)
store.stepIndex = store.MY_STEPS.pick
check('我的 pick 步 = pickSeconds', store.stepSeconds, 10)
store.stepIndex = 0
check('系统步不计时', store.stepSeconds, null)

await server.close()
console.log(`\n结果：${results.filter(Boolean).length}/${results.length} 通过`)
process.exit(results.every(Boolean) ? 0 : 1)
