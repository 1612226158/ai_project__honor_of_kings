export const DEFAULT_HERO_DISPLAY = Object.freeze({ defaults: Object.freeze({ x: 50, y: 50 }), heroes: Object.freeze({}) });

export function validateHeroDisplay(input, heroIds) {
  const valid = point => point && ['x', 'y'].every(key => Number.isFinite(point[key]) && point[key] >= 0 && point[key] <= 100);
  if (input?.version !== 1 || !valid(input.defaults) || !input.heroes || typeof input.heroes !== 'object') {
    throw new TypeError('英雄构图配置无效。');
  }
  const known = new Set(heroIds.map(String));
  const heroes = {};
  for (const [id, point] of Object.entries(input.heroes)) {
    if (!known.has(id) || !valid(point)) throw new TypeError('英雄构图ID或焦点无效。');
    heroes[id] = Object.freeze({ x: point.x, y: point.y });
  }
  return Object.freeze({ defaults: Object.freeze({ ...input.defaults }), heroes: Object.freeze(heroes) });
}

export async function loadHeroDisplay(heroIds, { fetcher = fetch } = {}) {
  try {
    const response = await fetcher('data/hero-display.json');
    if (!response.ok) return DEFAULT_HERO_DISPLAY;
    return validateHeroDisplay(await response.json(), heroIds);
  } catch { return DEFAULT_HERO_DISPLAY; }
}
