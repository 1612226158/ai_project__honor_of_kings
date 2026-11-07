import { SEATS } from './config.js';

/** rng应返回[0, 1)的有限数；不修改候选数组，不使用随机排序。 */
export function randomChoice(items, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) throw new RangeError('没有可随机选择的候选。');
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机源必须返回 [0, 1) 范围内的有限数。');
  return items[Math.floor(value * items.length)];
}

export function randomSeat(rng = Math.random) {
  return randomChoice(SEATS, rng);
}

/** Fisher–Yates：每条分路每队恰好一次，输入数组保持不变。 */
export function randomPermutation(items, rng = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomChoice(Array.from({ length: index + 1 }, (_, i) => i), rng);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
