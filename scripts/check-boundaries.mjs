// 3.9 组件边界断言：证明「数据向下、事件向上、属性只读」三条纪律在代码层面成立
// 静态扫描 src/components/*.vue —— 不需要起浏览器，也不依赖运行时行为。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/components'
const files = readdirSync(DIR).filter((f) => f.endsWith('.vue'))
if (files.length === 0) {
  console.error('未找到任何组件')
  process.exit(1)
}

let pass = 0
let fail = 0
const check = (label, ok, extra = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  → ' + extra : ''}`)
}

// 只有这些模块允许被组件导入：vue 本身（组合式 API）与同级组件
const ALLOWED_IMPORT = /^import\s+(?:[^'"]+from\s+)?['"](vue|\.\/[A-Za-z]+\.vue)['"]/m

// App.vue 内部才允许存在的业务符号（出现在组件里 = 越界）
const FORBIDDEN = [
  ['stepIndex', '步进状态'],
  ['bluePicks', '蓝方名单'],
  ['redPicks', '红方名单'],
  ['banned.value', '禁用名单的 ref 访问'],
  ['myIntent', '预选状态'],
  ['intentNotice', '预选提示'],
  ['myPicksDone', '锁定派生'],
  ['currentStep', '当前步派生'],
  ['currentSide', '当前方派生'],
  ['isMyTurn', '轮次判定'],
  ['commit(', '落账函数'],
  ['autoStep', '系统代选'],
  ['scheduleAuto', '代选调度'],
  ['resetDraft', '重置动作'],
  ['onCardClick', '点击处理'],
  ['allHeroes', '全量数据'],
  ['buildSequence', '顺序表规则'],
  ['cardState(', '四态判定函数'],
  ['matchRank', '搜索排序'],
]

console.log(`扫描 ${files.length} 个组件：${files.join(', ')}\n`)

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8')
  const lines = src.split('\n')
  console.log(`[${file}]`)

  // ① 导入白名单：不能引业务模块
  const imports = lines.filter((l) => /^\s*import\s/.test(l))
  const badImports = imports.filter((l) => !ALLOWED_IMPORT.test(l.trim()))
  check(`① 只导入 vue / 同级组件（共 ${imports.length} 条 import）`, badImports.length === 0, badImports.join(' | '))

  // ② 不引用 App 的业务符号
  const hits = []
  for (const [token, desc] of FORBIDDEN) {
    const at = lines.findIndex((l) => l.includes(token))
    if (at !== -1) hits.push(`${desc}「${token}」@行 ${at + 1}`)
  }
  check('② 不直接访问父级业务状态/动作', hits.length === 0, hits.join('；'))

  // ③ 不给 props 赋值（含数组内部修改）
  const assign = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /props\.\w+\s*=[^=]/.test(l) || /props\.\w+\.(push|pop|splice|shift|unshift|sort|reverse)\s*\(/.test(l))
    .map(({ l, i }) => `行 ${i + 1}: ${l.trim()}`)
  check('③ 不给 props 赋值或原地修改', assign.length === 0, assign.join(' | '))

  // ④ 只抛出约定内的事件
  const emits = [...src.matchAll(/defineEmits\(\[([^\]]*)\]\)/g)].flatMap((m) =>
    [...m[1].matchAll(/['"]([\w:-]+)['"]/g)].map((x) => x[1]),
  )
  const ALLOWED_EMITS = ['choose', 'select', 'reset', 'update:keyword', 'update:role']
  const badEmits = emits.filter((e) => !ALLOWED_EMITS.includes(e))
  check(`④ 事件名在契约清单内（${emits.length ? emits.join(', ') : '无事件'}）`, badEmits.length === 0, badEmits.join(', '))

  // ⑤ 不出现行数失控：40–100 为目标量级（防止职责膨胀）。
  //    PhasePanel 是唯一预期 >90 的组件——它承担回合块 + 三步标记 + 倒计时 + 禁用条四块展示职责。
  const n = lines.filter((l, i) => !(i === lines.length - 1 && l === '')).length
  check(`⑤ 行数在合理区间（${n} 行）`, n <= 100, n > 100 ? '超 100 行，检查是否职责膨胀' : '')

  console.log('')
}

// ⑥ 反向保险：三个「只该有一个」的入口（第 5 课起这些绑定在 DraftPage，不在 App）
const app = readFileSync('src/views/DraftPage.vue', 'utf8')
const count = (s, sub) => s.split(sub).length - 1
check('⑥ 池子的选人事件只绑 selectHandler（渲染时捕获令牌）', count(app, '@select="selectHandler"') === 1)
check('⑥ 只有 resetDraft 接收重置事件（template 里 @reset 唯一）', count(app, '@reset="resetDraft"') === 1)
// act 的调用方：页面 onCardClick 1 处；仓库定义 + autoStep + autoAssign 3 处
const storeSrc = readFileSync('src/stores/draft.js', 'utf8')
check('⑥ 页面里 act 只被 onCardClick 调用（1 次）', count(app, 'act(') === 1, `实际 ${count(app, 'act(')} 次`)
check('⑥ 仓库里 act = 定义 + autoStep + autoAssign（3 处）', count(storeSrc, 'act(') === 3, `实际 ${count(storeSrc, 'act(')} 次`)
// 防回归：MY_SEAT 是普通对象，storeToRefs 会跳过它——解构得 undefined 曾导致渲染中断
const destructureBlock = app.slice(app.indexOf('storeToRefs(store)'), app.indexOf('} = storeToRefs(store)'))
check('⑥ MY_SEAT 不得从 storeToRefs 解构（普通对象会被跳过）', !destructureBlock.includes('MY_SEAT'))

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
