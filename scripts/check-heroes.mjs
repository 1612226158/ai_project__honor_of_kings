// 数据层断言（2.1–2.3 验收用）：不依赖打包器，直接读 src/data/heroes.json，
// 按 heroes.js 里 mapHero 的规则复算目标 URL，并核对 public/heroes 里对应文件真实存在——
// 文件不存在才是 404 的根因，路径字符串写得再漂亮也没意义。
//
// 用法：npm run check:heroes
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jsonPath = join(projectRoot, 'src/data/heroes.json')
const publicRoot = join(projectRoot, 'public')

const failures = []
const check = (ok, label, detail = '') => {
  if (ok) {
    console.log(`  PASS  ${label}`)
  } else {
    failures.push(`${label}${detail ? ` → ${detail}` : ''}`)
    console.log(`  FAIL  ${label}${detail ? ` → ${detail}` : ''}`)
  }
}

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
const records = raw.heroes

// 与 mapHero 完全相同的换算规则
const basename = (p) => p.split('/').pop()
const toUrl = (r) => ({
  avatar: `/heroes/avatar/${basename(r.images.avatar)}`,
  cover: `/heroes/cover/${basename(r.images.cover)}`,
})
const all = records.map((r) => ({ ...r, url: toUrl(r) }))

console.log('\n[1] 结构')
check(Object.keys(raw).join() === 'meta,heroes', '顶层键为 meta + heroes', Object.keys(raw).join())
check(records.length === 133, 'heroes 条数为 133', String(records.length))
check(new Set(records.map((r) => r.id)).size === 133, 'id 唯一')
check(
  records.every((r) => Number.isInteger(r.id) && r.id >= 105 && r.id <= 585),
  'id 均为 105–585 的整数',
)

console.log('\n[2] 路径换算')
check(
  all.every((r) => r.url.avatar.startsWith('/heroes/avatar/')),
  'avatar 全部改挂 /heroes/avatar/',
)
check(all.every((r) => r.url.cover.startsWith('/heroes/cover/')), 'cover 全部改挂 /heroes/cover/')
check(
  all.every((r) => r.url.avatar.endsWith('.jpg') === r.images.avatar.endsWith('.jpg')),
  'avatar 扩展名与原文件一致（未被写死 .jpg）',
)
check(
  all.every((r) => r.url.cover.endsWith('.png') === r.images.cover.endsWith('.png')),
  'cover 扩展名与原文件一致（未被写死 .jpg）',
)

console.log('\n[3] 文件真实存在')
const missing = all.flatMap((r) =>
  [r.url.avatar, r.url.cover]
    .filter((u) => !existsSync(join(publicRoot, u.replace('/heroes/', 'heroes/'))))
    .map((u) => `${r.id} ${r.name} ${u}`),
)
check(missing.length === 0, '266 个 URL 对应文件全部存在', missing.slice(0, 5).join('; '))
check(
  readdirSync(join(publicRoot, 'heroes/avatar')).length === 133 &&
    readdirSync(join(publicRoot, 'heroes/cover')).length === 133,
  'public/heroes 下 avatar / cover 各 133 个文件',
)

console.log('\n[4] 已知数据边界')
const pngCovers = all.filter((r) => r.url.cover.endsWith('.png'))
check(
  pngCovers.map((r) => r.id).sort((a, b) => a - b).join() === '138,188,547',
  '3 张 png 封面为 138 / 188 / 547',
  pngCovers.map((r) => `${r.id}${r.name}`).join(' '),
)
const emptyLanes = all.filter((r) => !Array.isArray(r.lanes) || r.lanes.length === 0)
check(
  emptyLanes.map((r) => r.id).sort((a, b) => a - b).join() === '138,547,549',
  '3 条 lanes 为空：138 / 547 / 549（渲染时兜底 ?? "—"）',
  emptyLanes.map((r) => `${r.id}${r.name}`).join(' '),
)
check(
  all.filter((r) => r.heroType2 !== null && r.heroType2 !== undefined).length === 41,
  '副职业非空 41 条',
  String(all.filter((r) => r.heroType2).length),
)

console.log('\n[5] 抽查')
for (const id of [105, 138, 188, 547]) {
  const h = all.find((r) => r.id === id)
  console.log(`  ${id} ${h.name}：${h.url.avatar} | ${h.url.cover}`)
}

console.log('')
if (failures.length) {
  console.error(`✗ 失败 ${failures.length} 项：`)
  failures.forEach((f) => console.error(`  - ${f}`))
  process.exit(1)
}
console.log('✓ 全部通过')
