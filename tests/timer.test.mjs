import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnScheduler, remainingSeconds, turnDueAt } from '../js/timer.js';
import { createDraftRules } from '../js/state.js';
import { fakeClock } from './helpers/fake-clock.mjs';
import { SEATS } from '../js/config.js';

const heroes = [{ id: 1, name: '示例英雄' }];
const stateAtPick = (clock, human = true) => ({
  phase: 'pick', matchId: 1, turnToken: 11, turnIndex: human ? 0 : 1,
  humanSeat: { id: 'blue-1' }, deadline: clock.now() + 20000, turnStartedAt: clock.now(),
  teams: Object.fromEntries(['blue', 'red'].map(team => [team, SEATS.filter(seat => seat.team === team).map(seat => ({...seat, heroId:null}))])),
  autoActionAt: human ? {} : {'red-1': clock.now() + 1000, 'red-2': clock.now() + 4000},
});

test('倒计时向上取整，19.9秒剩1秒，20秒归0', () => {
  const clock = fakeClock();
  const state = stateAtPick(clock);
  assert.equal(remainingSeconds(state, 0), 20);
  assert.equal(remainingSeconds(state, 19900), 1);
  assert.equal(remainingSeconds(state, 20000), 0);
  assert.equal(remainingSeconds(state, 99999), 0);
  assert.equal(remainingSeconds({ ...state, phase: 'ban' }, 0), 20);
  assert.equal(remainingSeconds({ ...state, phase: 'ready' }, 0), null);
});

test('用户禁用及选人均20秒到期，系统优先在1秒思考后行动', () => {
  const clock = fakeClock(100);
  const rules = createDraftRules(heroes, { rng: () => 0, now: clock.now });
  let state = rules.createMatch();
  assert.equal(turnDueAt(state), null);
  state = rules.dispatch(state, { type: 'START', actor: 'human', seatId: state.humanSeat.id,
    matchId: 1, turnToken: 0 }).state;
  assert.equal(turnDueAt(state), 20100);
  assert.equal(turnDueAt({ ...state, turnIndex: 1, autoActionAt: {'red-1': 1100} }), 1100);
  assert.equal(turnDueAt(stateAtPick(clock)), 20100);
  assert.equal(turnDueAt(stateAtPick(clock, false)), 1100);
});

test('同回合反复sync不增建任务；计时刷新不依靠每次减1', () => {
  const clock = fakeClock();
  let due = 0;
  const ticks = [];
  const scheduler = createTurnScheduler({ ...clock, onDue: () => due++, onTick: () => ticks.push(clock.now()) });
  const state = stateAtPick(clock);
  scheduler.sync(state);
  const id = clock.pending()[0].id;
  scheduler.sync({ ...state, filter: '法师' });
  assert.equal(clock.count(), 1);
  assert.equal(clock.pending()[0].id, id);
  clock.advance(19900);
  assert.equal(due, 0);
  assert.equal(ticks.length, 19);
  clock.advance(100);
  assert.equal(due, 1);
  assert.equal(clock.count(), 0);
});

test('暂停后时间仍流逝，恢复立即处理当前到期一次', () => {
  const clock = fakeClock();
  let due = 0;
  const scheduler = createTurnScheduler({ ...clock, onDue: () => due++ });
  scheduler.sync(stateAtPick(clock));
  const oldId = clock.pending()[0].id;
  scheduler.suspend();
  clock.jump(90000);
  scheduler.resume();
  assert.equal(due, 1);
  clock.fire(oldId);
  scheduler.resume();
  assert.equal(due, 1);
});

test('dispose与轮次切换使旧回调失效，回调过早时重新安排', () => {
  const clock = fakeClock();
  let due = 0;
  const scheduler = createTurnScheduler({ ...clock, onDue: () => due++ });
  scheduler.sync(stateAtPick(clock, false));
  const old = clock.pending()[0].id;
  scheduler.sync({ ...stateAtPick(clock), turnToken: 12 });
  clock.fire(old);
  assert.equal(due, 0);
  const current = clock.pending()[0].id;
  clock.fire(current);
  assert.equal(due, 0);
  scheduler.dispose();
  clock.jump(30000);
  for (const task of clock.pending()) clock.fire(task.id);
  clock.fire(current);
  assert.equal(due, 0);
});

test('tick订阅中切换回合不遗留第二份定时任务', () => {
  const clock = fakeClock();
  const scheduler = createTurnScheduler({ ...clock, onDue: () => {}, onTick: () => scheduler.sync({
    ...stateAtPick(clock), turnToken: 12,
  }) });
  scheduler.sync(stateAtPick(clock));
  clock.advance(1000);
  assert.equal(clock.count(), 1);
  scheduler.dispose();
});

test('同一个倒计时刷新回调重复送达不会产生双份后续任务', () => {
  const clock = fakeClock();
  let due = 0;
  const scheduler = createTurnScheduler({ ...clock, onDue: () => due++ });
  scheduler.sync(stateAtPick(clock));
  const old = clock.pending()[0].id;
  clock.jump(1000);
  clock.fire(old);
  assert.equal(clock.count(), 1);
  const next = clock.pending()[0].id;
  clock.fire(old);
  assert.equal(clock.count(), 1);
  assert.equal(clock.pending()[0].id, next);
  clock.advance(19000);
  assert.equal(due, 1);
  assert.equal(clock.count(), 0);
});
