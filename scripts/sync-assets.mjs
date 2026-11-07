// 英雄素材同步：v2/images → public/heroes
// 用途：public/heroes 已在 .gitignore 中排除（约 68 MB，不入库），
//      clone 或换机后先跑 `npm run sync:assets` 把素材补回本地。
// 特性：可重复执行；已存在且大小一致的文件跳过，只补缺失或损坏的。
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, '../../images')
const targetRoot = resolve(projectRoot, 'public/heroes')

if (!existsSync(sourceRoot)) {
  console.error(`[sync-assets] 找不到素材源目录：${sourceRoot}`)
  console.error('[sync-assets] 该目录位于仓库外（v2/images），请确认工作副本完整。')
  process.exit(1)
}

let copied = 0
let skipped = 0

for (const dir of ['avatar', 'cover']) {
  const srcDir = join(sourceRoot, dir)
  const dstDir = join(targetRoot, dir)

  if (!existsSync(srcDir)) {
    console.error(`[sync-assets] 缺少源目录：${srcDir}`)
    process.exit(1)
  }

  mkdirSync(dstDir, { recursive: true })

  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name)
    const dst = join(dstDir, name)
    if (existsSync(dst) && statSync(dst).size === statSync(src).size) {
      skipped += 1
      continue
    }
    cpSync(src, dst)
    copied += 1
  }
}

const count = (dir) => readdirSync(join(targetRoot, dir)).length
console.log(`[sync-assets] 复制 ${copied} 个，跳过 ${skipped} 个（已存在且大小一致）`)
console.log(`[sync-assets] 源：${sourceRoot}`)
console.log(`[sync-assets] 目标：${targetRoot}`)
console.log(`[sync-assets] 结果：avatar ${count('avatar')} 张、cover ${count('cover')} 张`)
