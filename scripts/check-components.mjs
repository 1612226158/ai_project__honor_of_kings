// 组件契约验收（第 3 课）：用 Vite 编译 SFC，再用 vue/server-renderer 渲染成 HTML 断言。
// 注意：开发态 vite-plugin-vue-devtools 会给元素加 data-v-inspector 属性，
// 因此断言只用「文本片段」「类名出现次数」「属性存在性」，不要匹配带引号的完整标签。
// 事件行为（点击/输入）在 3.8 换装后用 CDP 端到端验证；这里只校验契约声明与渲染结果。
// 用法：npm run check:components
import { createServer } from 'vite'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const results = []
const check = (label, ok, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  → ' + extra : ''}`)
}
const count = (s, sub) => s.split(sub).length - 1
// 类名匹配不依赖顺序：Vue 合并 :class 时动态类可能排在静态类之前
const classTokens = (html) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/))
const classHas = (html, tokens) => classTokens(html).some((list) => tokens.every((t) => list.includes(t)))
const countClassHas = (html, tokens) => classTokens(html).filter((list) => tokens.every((t) => list.includes(t))).length

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const render = (Comp, props, slots) => renderToString(createSSRApp({ render: () => h(Comp, props, slots) }))
const load = async (path) => (await server.ssrLoadModule(path)).default

const heroA = { id: 105, name: '廉颇', title: '正义爆轰', heroType: { name: '坦克' }, lanes: ['对抗路'], images: { avatar: '/heroes/avatar/105.jpg' } }
const heroB = { id: 106, name: '小乔', title: '恋之微风', heroType: { name: '法师' }, lanes: ['中路'], images: { avatar: '/heroes/avatar/106.png' } }
const heroC = { id: 138, name: '王维', title: '大漠孤烟', heroType: { name: '法师' }, lanes: [], images: { avatar: '/heroes/avatar/138.jpg' } }

try {
  // ── HeroCard（契约 §2.1）──
  console.log('\n[HeroCard]')
  const Card = await load('/src/components/HeroCard.vue')

  check('emits 只声明 choose', JSON.stringify(Card.emits), JSON.stringify(['choose']))

  const plain = await render(Card, { hero: heroA })
  check('可选态：类名只有 hero-card', plain.includes('class="hero-card"'))
  check('可选态：无 disabled、无徽标', !plain.includes('disabled') && !plain.includes('card-status'))
  check('默认 lazy 加载头像', plain.includes('loading="lazy"'))
  check('展示名字与主职业', plain.includes('>廉颇<') && plain.includes('>坦克<'))
  check('aria-label = 选择{名}，{职业}', plain.includes('aria-label="选择廉颇，坦克"'))

  const pre = await render(Card, { hero: heroA, state: 'preselect', label: '预选' })
  check('预选态：类名叠加', classHas(pre, ['hero-card', 'preselect']))
  check('预选态：不 disabled（否则无法确认）', !pre.includes('disabled'))
  check('预选态：徽标取 label', pre.includes('>预选<'))

  const banned = await render(Card, { hero: heroA, state: 'banned', label: '已禁用' })
  check('禁用态：带 disabled 且徽标正确', banned.includes('disabled') && banned.includes('>已禁用<'))

  const blue = await render(Card, { hero: heroA, state: 'picked-blue', label: '蓝方已选' })
  check('蓝方已选：类名与 disabled 正确', classHas(blue, ['hero-card', 'picked-blue']) && blue.includes('disabled'))

  check('eager=true 时首屏立即加载', (await render(Card, { hero: heroA, eager: true })).includes('loading="eager"'))

  // 整池锁定：我这局的 ban + pick 都用完后，连可选的卡也不能点
  check('locked：可选态也被 disabled', (await render(Card, { hero: heroA, locked: true })).includes('disabled'))
  check('locked：预选态也被 disabled', (await render(Card, { hero: heroA, state: 'preselect', label: '预选', locked: true })).includes('disabled'))
  check('locked：默认 false 不影响可选态', !(await render(Card, { hero: heroA })).includes('disabled'))

  // ── FilterBar（契约 §2.2）──
  console.log('\n[FilterBar]')
  const FilterBar = await load('/src/components/FilterBar.vue')
  const chips = ['坦克', '战士', '法师', '刺客', '射手', '辅助']

  check('emits 声明两个 update:*', JSON.stringify(FilterBar.emits), JSON.stringify(['update:keyword', 'update:role']))

  const fbAll = await render(FilterBar, { keyword: '', role: '', roleChips: chips })
  check('渲染 7 个职业按钮（全部 + 六职业）', count(fbAll, 'class="role-chip'), 7)
  check('role 为空时「全部」高亮', classHas(fbAll, ['role-chip', 'on']) && fbAll.includes('aria-pressed="true"'))
  check('搜索框为受控（value 来自 props）', fbAll.includes('id="hero-search"') && !fbAll.includes('v-model'))

  const fbMage = await render(FilterBar, { keyword: '李', role: '法师', roleChips: chips })
  check('受控回显：value/关键词来自 props', fbMage.includes('value="李"'))
  check('单选高亮：只有一个 chip 带 on', countClassHas(fbMage, ['role-chip', 'on']) === 1, true)
  check('非选中项 aria-pressed=false', count(fbMage, 'aria-pressed="false"'), 6)

  // ── HeroPool（契约 §2.3）──
  console.log('\n[HeroPool]')
  const HeroPool = await load('/src/components/HeroPool.vue')

  check('emits 只声明 select', JSON.stringify(HeroPool.emits), JSON.stringify(['select']))

  const poolProps = {
    heroes: [heroA, heroB, heroC],
    poolState: { 105: 'preselect', 106: 'picked-blue' },
    labels: { 105: '预选', 106: '蓝方已选' },
    count: 3,
    notice: '你预选的「李白」已被禁用，预选已清除',
    subhead: '轮到你 · 先预选再确认',
  }
  const pool = await render(HeroPool, poolProps, { default: () => h('span', { class: 'slot-probe' }, 'SLOT') })
  check('渲染 3 张卡', count(pool, 'class="hero-card'), 3)
  check('状态由 poolState 决定', classHas(pool, ['hero-card', 'preselect']) && classHas(pool, ['hero-card', 'picked-blue']))
  check('徽标文字由 labels 决定', pool.includes('>预选<') && pool.includes('>蓝方已选<'))
  check('池头计数来自 count', /共\s*<strong[^>]*>3<\/strong>\s*位英雄/.test(pool))
  check('notice 渲染在池上方', pool.includes('pool-notice') && pool.includes('已被禁用'))
  check('subhead 来自 props', pool.includes('轮到你 · 先预选再确认'))
  check(
    '插槽内容位于池头之后、副头之前',
    pool.indexOf('slot-probe') > pool.indexOf('pool-heading') && pool.indexOf('slot-probe') < pool.indexOf('pool-subhead'),
  )
  check('首屏前 24 张 eager（3 张全 eager）', count(pool, 'loading="eager"'), 3)

  // locked 要透传到每一张卡：3 张卡都应有 disabled
  const lockedPool = await render(HeroPool, { ...poolProps, locked: true })
  check('locked 透传到每张卡（3 张全 disabled）', count(lockedPool, 'disabled'), 3)

  const empty = await render(HeroPool, { ...poolProps, heroes: [], count: 0 })
  check('空数组渲染空态', empty.includes('pool-empty') && !empty.includes('class="hero-card'))

  // ── TeamSlots（契约 §2.4）──
  console.log('\n[TeamSlots]')
  const TeamSlots = await load('/src/components/TeamSlots.vue')

  check('无 emits', !TeamSlots.emits || TeamSlots.emits.length === 0)

  const slots = await render(TeamSlots, { side: 'blue', heroes: [heroA, heroB], activeNo: 3, statusText: '轮到你选择' })
  check('已选 2 位 → 2 filled + 3 placeholder', countClassHas(slots, ['slot-filled']) === 2 && countClassHas(slots, ['slot-placeholder']) === 3)
  check('activeNo=3 → 只有第 3 槽 active', countClassHas(slots, ['slot-placeholder', 'active']), 1)
  check('active 槽显示「等待选择 / 当前位置」', slots.includes('>等待选择<') && slots.includes('>当前位置<'))
  check('队名与计数正确', slots.includes('>蓝方<') && slots.includes('>BLUE TEAM<') && slots.includes('>2<'))
  check('activeNo>0 时状态行不灰（无 waiting）', !classHas(slots, ['team-status', 'waiting']))

  const slotsRed = await render(TeamSlots, { side: 'red', heroes: [heroC], activeNo: 0, statusText: '等待蓝方选择' })
  check('红方配色与队名', classHas(slotsRed, ['team-slots', 'red']) && slotsRed.includes('>红方<') && slotsRed.includes('>RED TEAM<'))
  check('lanes 为空显示「—」', slotsRed.includes('法师 · —'))
  check('activeNo=0 时状态行灰显', classHas(slotsRed, ['team-status', 'waiting']))

  // ── PhasePanel（契约 §2.5）──
  console.log('\n[PhasePanel]')
  const PhasePanel = await load('/src/components/PhasePanel.vue')

  check('emits 只声明 reset', JSON.stringify(PhasePanel.emits), JSON.stringify(['reset']))

  const steps = [
    { no: '01', label: '禁用英雄', state: 'current' },
    { no: '02', label: '选择英雄', state: '' },
    { no: '03', label: '确认阵容', state: '' },
  ]
  const panel = await render(PhasePanel, {
    eyebrow: 'TURN 05 / 20 · BAN',
    title: '禁用英雄',
    sub: '轮到你：点「廉颇」确认禁用',
    side: 'blue',
    steps,
    banned: [heroA, heroB],
    bannedCount: 2,
    seconds: null,
    bannedNote: '',
  })
  check('回合块三行文案', panel.includes('TURN 05 / 20 · BAN') && panel.includes('>蓝方<') && panel.includes('禁用英雄'))
  check('三步标记：current 落在第 1 步', count(panel, 'class="current"'), 1)
  check('banned 2 位 → 2 个头像', count(panel, '/heroes/avatar/'), 2)
  check('seconds=null 显示 --', panel.includes('>--<'))
  check('禁用计数正确', /2<span[^>]*>\/ 10<\//.test(panel))
  check('bannedNote 为空时不渲染注记', !panel.includes('ban-note'))

  const panelRed = await render(PhasePanel, {
    eyebrow: 'TURN 12 / 20 · PICK',
    title: '选择英雄',
    sub: '等待红方第 2 位玩家选择…',
    side: 'red',
    steps: [
      { no: '01', label: '禁用英雄', state: 'complete' },
      { no: '02', label: '选择英雄', state: 'current' },
      { no: '03', label: '确认阵容', state: '' },
    ],
    banned: [heroA],
    bannedCount: 10,
    seconds: 12,
    bannedNote: '禁用阶段已完成',
  })
  check('红方：徽标与标题变红', classHas(panelRed, ['turn-emblem', 'red']) && panelRed.includes('red-text'))
  check('complete 步显示对勾（无编号 01）', !panelRed.includes('>01<'))
  check('seconds=12 正常显示', panelRed.includes('>12<'))
  check('bannedNote 非空时渲染注记', panelRed.includes('ban-note') && panelRed.includes('禁用阶段已完成'))
} finally {
  await server.close()
}

console.log('')
if (results.some((r) => !r)) {
  const failed = results.filter((r) => !r).length
  console.error(`✗ 失败 ${failed} 项 / 共 ${results.length} 项`)
  process.exit(1)
}
console.log(`✓ 全部通过（${results.length} 项）`)
