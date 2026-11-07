import { EXPECTED_HERO_COUNT, HERO_CATEGORIES } from './config.js';

const fail = message => { throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validType = value => value && Number.isInteger(value.code) && HERO_CATEGORIES.slice(1).includes(value.name);

/** 验证原始数据，不改写副职业、多分路或素材路径。 */
export function validateHeroData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.heroes)) fail('英雄资料格式不正确。');
  if (raw.heroes.length !== EXPECTED_HERO_COUNT || raw.meta?.total !== raw.heroes.length) {
    fail(`英雄资料数量不完整，应为 ${EXPECTED_HERO_COUNT} 位。`);
  }
  const byId = new Map();
  for (const hero of raw.heroes) {
    if (!hero || !Number.isInteger(hero.id) || hero.id <= 0 || byId.has(hero.id)) fail('英雄 ID 缺失或重复。');
    if (!nonempty(hero.name) || !nonempty(hero.ename) || !nonempty(hero.title)) fail(`英雄 ${hero.id} 的名称资料不完整。`);
    if (!validType(hero.heroType) || (hero.heroType2 !== null && !validType(hero.heroType2))) {
      fail(`英雄 ${hero.name} 的职业资料不正确。`);
    }
    // 部分原始记录尚无分路信息，保留空数组，不推测分配位置。
    if (!Array.isArray(hero.lanes) || !hero.lanes.every(nonempty)) fail(`英雄 ${hero.name} 的分路资料不正确。`);
    for (const key of ['survive', 'attack', 'skill', 'difficulty']) {
      const value = hero.attributes?.[key];
      if (!Number.isFinite(value) || value < 0 || value > 10) fail(`英雄 ${hero.name} 的能力资料不正确。`);
    }
    for (const type of ['avatar', 'cover']) {
      const path = hero.images?.[type];
      if (typeof path !== 'string' || !new RegExp(`^images/${type}/${hero.id}\\.(jpg|jpeg|png|webp)$`).test(path)) {
        fail(`英雄 ${hero.name} 的图片路径不正确。`);
      }
    }
    byId.set(hero.id, hero);
  }
  return { meta: raw.meta, heroes: raw.heroes, byId };
}

/** 只允许最新一次加载返回有效结果，即使旧fetch不响应abort也不能覆盖新数据。 */
export function createHeroLoader({ fetchImpl = globalThis.fetch } = {}) {
  let requestId = 0;
  let controller;
  return {
    async load() {
      const id = ++requestId;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetchImpl('data/heroes.json', { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw new Error(`英雄资料读取失败（HTTP ${response.status}）。`);
        const raw = await response.json();
        if (id !== requestId) return { status: 'stale', requestId: id };
        const data = validateHeroData(raw);
        return { status: 'ready', requestId: id, data };
      } catch (error) {
        if (id !== requestId) return { status: 'stale', requestId: id };
        return { status: 'error', requestId: id,
          message: error instanceof Error ? error.message : '无法读取本地英雄资料，请重新加载。' };
      }
    },
    dispose() {
      requestId += 1;
      controller?.abort();
    },
  };
}
