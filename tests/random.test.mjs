import test from 'node:test';
import assert from 'node:assert/strict';
import { randomChoice, randomSeat } from '../js/random.js';
import { SEATS } from '../js/config.js';

test('随机索引覆盖首项、末项和每个候选区间，不修改原数组', () => {
  const items = Object.freeze(['a', 'b', 'c']);
  assert.equal(randomChoice(items, () => 0), 'a');
  assert.equal(randomChoice(items, () => 1 - Number.EPSILON), 'c');
  for (let index = 0; index < items.length; index++) {
    assert.equal(randomChoice(items, () => (index + 0.5) / items.length), items[index]);
  }
  assert.deepEqual(items, ['a', 'b', 'c']);
});

test('10个座位均可抽到，座位编号与分路无关', () => {
  const actual = SEATS.map((_, index) => randomSeat(() => (index + 0.5) / 10).id);
  assert.deepEqual(actual, SEATS.map(seat => seat.id));
  assert.equal(new Set(actual).size, 10);
});

test('不强制相邻两次抽取不同座位', () => {
  assert.equal(randomSeat(() => 0.8).id, randomSeat(() => 0.8).id);
});

test('空池明确失败，不调用随机源或返回undefined', () => {
  let calls = 0;
  assert.throws(() => randomChoice([], () => { calls++; return 0; }), /没有可随机选择/);
  assert.equal(calls, 0);
  assert.throws(() => randomChoice(null), RangeError);
});

test('拒绝负值、1、非有限值和非数值随机源结果', () => {
  for (const value of [-0.1, 1, 2, Infinity, -Infinity, NaN, '0.5', null]) {
    assert.throws(() => randomChoice([1], () => value), /随机源必须返回/);
  }
});
