import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MATCH_LANES, SEATS } from '../js/config.js';
import { randomPermutation } from '../js/random.js';
import { createDraftController } from '../js/draft-controller.js';
import { createDraftRules, getPlayer, getBannedIds, getPickedIds, isHumanTurn, heroFitsLane, filterHeroes } from '../js/state.js';
import { createPosterModel } from '../js/presentation.js';
import { turnDueAt } from '../js/timer.js';
import { fakeClock } from './helpers/fake-clock.mjs';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;
const ids = MATCH_LANES.map(lane => lane.id).sort();
const legal = state => heroes.filter(hero => !getBannedIds(state).has(hero.id) && !getPickedIds(state).has(hero.id));
function setup(seatIndex = 0, input = heroes) {
  let first = true;
  const clock = fakeClock();
  const controller = createDraftController(input, { ...clock, rng: () => {
    if (first) { first = false; return (seatIndex + .5) / 10; }
    return 0;
  } });
  return { controller, clock };
}
function reachOwnPick(controller, clock) {
  controller.start();
  for (let guard = 0; guard < 40; guard++) {
    const state = controller.getState();
    if (state.phase === 'pick' && isHumanTurn(state)) return state;
    assert.ok(['ban', 'pick'].includes(state.phase));
    if (isHumanTurn(state)) { controller.select(legal(state)[0].id); assert.equal(controller.commit().ok, true); }
    else clock.advance(Math.max(0, turnDueAt(state) - clock.now()));
  }
  assert.fail('未到达本人选人组');
}
function finish(controller, clock, timeout = false) {
  for (let guard = 0; guard < 60; guard++) {
    const state = controller.getState();
    if (state.phase === 'review') return state;
    assert.ok(['ban', 'pick'].includes(state.phase), JSON.stringify(state.error));
    if (isHumanTurn(state) && !(timeout && state.phase === 'pick')) {
      const pool = legal(state).filter(hero => state.phase === 'ban' || heroFitsLane(hero, state.humanSeat.laneId));
      controller.select(pool[0].id); assert.equal(controller.commit().ok, true);
    } else clock.advance(Math.max(0, turnDueAt(state) - clock.now()));
  }
  assert.fail('未完成本轮');
}

test('分路洗牌不修改输入，随机值非法时拒绝生成', () => {
  const source = [...MATCH_LANES];
  const shuffled = randomPermutation(source, () => 0);
  assert.deepEqual(source, MATCH_LANES);
  assert.notDeepEqual(shuffled, source);
  assert.deepEqual(shuffled.map(lane => lane.id).sort(), ids);
  assert.throws(() => randomPermutation(source, () => 1), RangeError);
});

for (let index = 0; index < 10; index++) test(`${SEATS[index].id}开局每队五路唯一，机器人及本人超时均按所属分路抽取`, () => {
  const { controller, clock } = setup(index);
  const ready = controller.getState();
  for (const team of ['blue', 'red']) {
    assert.deepEqual(ready.teams[team].map(player => player.laneId).sort(), ids);
  }
  assert.equal(ready.humanSeat.laneId, getPlayer(ready, ready.humanSeat.id).laneId);
  controller.start();
  const review = finish(controller, clock, true);
  for (const player of [...review.teams.blue, ...review.teams.red]) {
    assert.equal(player.laneId, getPlayer(ready, player.id).laneId);
    assert.ok(heroFitsLane(heroes.find(hero => hero.id === player.heroId), player.laneId));
  }
  assert.equal(getPlayer(review, ready.humanSeat.id).lockedSource, 'timeout');
  assert.equal(new Set([...getPickedIds(review), ...getBannedIds(review)]).size, 20);
  controller.confirm();
  const snapshot = controller.getState().resultSnapshot;
  const model = createPosterModel(snapshot, heroes);
  for (const team of ['blue', 'red']) for (const card of model.teams[team]) {
    assert.equal(card.lane.id, snapshot.teams[team][card.slot - 1].laneId);
    assert.equal(card.lanes, undefined);
  }
  controller.dispose();
});

test('本人选人组自动切换本局分路并清空职业限制，之后可浏览全部或其他路', () => {
  const { controller, clock } = setup(7);
  controller.start(); controller.setFilter('坦克'); controller.setLaneFilter('farm');
  while (!(controller.getState().phase === 'pick' && isHumanTurn(controller.getState()))) {
    const state = controller.getState();
    if (isHumanTurn(state)) { controller.select(legal(state)[0].id); controller.commit(); }
    else clock.advance(turnDueAt(state) - clock.now());
  }
  const state = controller.getState();
  assert.equal(state.laneFilter, state.humanSeat.laneId);
  assert.equal(state.filter, '全部');
  assert.ok(filterHeroes(heroes, state.filter, state.laneFilter).every(hero => heroFitsLane(hero, state.humanSeat.laneId)));
  controller.setLaneFilter('all');
  assert.equal(filterHeroes(heroes, controller.getState().filter, controller.getState().laneFilter).length, 133);
  assert.equal(controller.getState().deadline, state.deadline);
  assert.equal(controller.setLaneFilter('fill').code, 'INVALID_LANE');
  controller.dispose();
});

test('跨路默认要求确认，拒绝不消耗回合；明确同意后保留玩家分路并进入快照', () => {
  const { controller, clock } = setup();
  const state = reachOwnPick(controller, clock);
  const hero = legal(state).find(hero => !heroFitsLane(hero, state.humanSeat.laneId));
  controller.select(hero.id);
  const before = controller.getState();
  assert.equal(controller.commit().code, 'LANE_CONFIRM_REQUIRED');
  assert.equal(controller.getState(), before);
  assert.equal(getPlayer(before, before.humanSeat.id).proficiencyId, null);
  assert.equal(controller.commit({ confirmOffLane: 'true' }).code, 'LANE_CONFIRM_REQUIRED');
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  const player = getPlayer(controller.getState(), before.humanSeat.id);
  assert.equal(player.heroId, hero.id);
  assert.equal(player.laneId, before.humanSeat.laneId);
  assert.equal(player.offLaneConfirmed, true);
  finish(controller, clock); assert.equal(controller.confirm().ok, true);
  const own = createPosterModel(controller.getState().resultSnapshot, heroes).teams[player.team][player.slot - 1];
  assert.equal(own.lane.id, player.laneId);
  controller.dispose();
});

test('跨路提示期间过20秒，迟到同意优先走本局分路超时补选', () => {
  const { controller, clock } = setup();
  const state = reachOwnPick(controller, clock);
  const hero = legal(state).find(hero => !heroFitsLane(hero, state.humanSeat.laneId));
  controller.select(hero.id); assert.equal(controller.commit().code, 'LANE_CONFIRM_REQUIRED');
  clock.jump(20000);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  const own = getPlayer(controller.getState(), state.humanSeat.id);
  assert.equal(own.lockedSource, 'timeout');
  assert.notEqual(own.heroId, hero.id);
  assert.ok(heroFitsLane(heroes.find(hero => hero.id === own.heroId), own.laneId));
  assert.equal(own.offLaneConfirmed, false);
  controller.dispose();
});

test('超时按本局分路取池，不受屏幕上其他分路或职业筛选影响', () => {
  const { controller, clock } = setup();
  const state = reachOwnPick(controller, clock);
  controller.setLaneFilter(MATCH_LANES.find(lane => lane.id !== state.humanSeat.laneId).id);
  controller.setFilter('坦克'); clock.advance(20000);
  const own = getPlayer(controller.getState(), state.humanSeat.id);
  assert.ok(heroFitsLane(heroes.find(hero => hero.id === own.heroId), own.laneId));
  controller.dispose();
});

test('同组队友先锁定后，原跨路候选仍可由本人明确确认，截止时间不变', () => {
  const { controller, clock } = setup(5);
  const state = reachOwnPick(controller, clock);
  const hero = legal(state).find(hero => !heroFitsLane(hero, state.humanSeat.laneId) &&
    !heroFitsLane(hero, getPlayer(state, 'red-2').laneId));
  controller.select(hero.id); assert.equal(controller.commit().code, 'LANE_CONFIRM_REQUIRED');
  clock.advance(1000);
  assert.equal(controller.getState().candidateId, hero.id);
  assert.equal(controller.getState().deadline, state.deadline);
  assert.equal(controller.getRemainingSeconds(), 19);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  assert.equal(getPlayer(controller.getState(), state.humanSeat.id).heroId, hero.id);
  controller.dispose();
});

test('100个种子的完整对局均保持五路唯一、机器人适配分路和英雄排他', () => {
  for (let round = 1; round <= 100; round++) {
    let seed = round;
    const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    const clock = fakeClock();
    const controller = createDraftController(heroes, { ...clock, rng });
    controller.start();
    const review = finish(controller, clock, round % 2 === 0);
    for (const team of ['blue', 'red']) {
      assert.deepEqual(review.teams[team].map(player => player.laneId).sort(), ids);
      for (const player of review.teams[team]) assert.ok(heroFitsLane(heroes.find(hero => hero.id === player.heroId), player.laneId));
    }
    assert.equal(getPickedIds(review).size, 10);
    assert.equal(controller.confirm().ok, true);
    controller.dispose();
  }
});

test('分路池耗尽明确停止，不跨路随机；禁用仍可使用其他路英雄', () => {
  const input = structuredClone(heroes);
  for (const hero of input) hero.lanes = hero.lanes.filter(name => name !== '中路');
  const { controller, clock } = setup(0, input);
  reachOwnPick(controller, clock);
  clock.advance(20000);
  assert.equal(controller.getState().phase, 'error');
  assert.equal(controller.getState().error.code, 'EMPTY_LANE_POOL');
  assert.equal(getPlayer(controller.getState(), 'blue-1').heroId, null);
  assert.equal(controller.getState().bans.length, 10);
  controller.dispose();
});

test('重置重抽分路，本轮保持稳定且海报拒绝重复或未知分路', () => {
  let seed = 9137;
  const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const rules = createDraftRules(heroes, { rng });
  const initial = rules.createMatch();
  const layouts = new Set([JSON.stringify(initial.teams.blue.map(player => player.laneId))]);
  for (let match = 2; match <= 20; match++) {
    const state = rules.createMatch(match);
    layouts.add(JSON.stringify(state.teams.blue.map(player => player.laneId)));
    for (const team of ['blue', 'red']) assert.deepEqual(state.teams[team].map(player => player.laneId).sort(), ids);
  }
  assert.ok(layouts.size > 1);
  const { controller, clock } = setup(); controller.start(); finish(controller, clock); controller.confirm();
  const snapshot = structuredClone(controller.getState().resultSnapshot);
  snapshot.teams.blue[0].laneId = snapshot.teams.blue[1].laneId;
  assert.throws(() => createPosterModel(snapshot, heroes), TypeError);
  snapshot.teams.blue[0].laneId = 'fill';
  assert.throws(() => createPosterModel(snapshot, heroes), TypeError);
  controller.reset(); assert.equal(controller.getState().resultSnapshot, null);
  assert.ok([...controller.getState().teams.blue, ...controller.getState().teams.red].every(player => player.heroId === null && !player.offLaneConfirmed));
  controller.dispose();
});
