import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDraftController } from '../js/draft-controller.js';
import { createDraftRules, getBannedIds, getPickedIds, getCurrentSeat, getPlayer, isHumanTurn } from '../js/state.js';
import { BAN_ORDER, SEATS } from '../js/config.js';
import { turnDueAt } from '../js/timer.js';
import { fakeClock } from './helpers/fake-clock.mjs';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;
const action = (state, type, extra = {}) => ({ type, actor: 'human', seatId: state.humanSeat.id,
  matchId: state.matchId, turnToken: state.turnToken, ...extra });
function setup(seatIndex = 0) {
  const clock = fakeClock();
  let first = true;
  const controller = createDraftController(heroes, { ...clock, rng: () => {
    if (first) { first = false; return (seatIndex + .5) / 10; }
    return 0;
  } });
  controller.start();
  return { controller, clock };
}
const legal = state => heroes.find(hero => !getBannedIds(state).has(hero.id) && !getPickedIds(state).has(hero.id)).id;
function progress(controller, clock) {
  const state = controller.getState();
  if (isHumanTurn(state)) {
    assert.equal(controller.select(legal(state)).ok, true);
    assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  } else clock.advance(turnDueAt(state) - clock.now());
}

for (const preselect of [false, true]) {
  test(`禁用20秒到期留空${preselect ? '，预选未确认也不禁用' : '，没有随机抽取英雄'}`, () => {
    const { controller, clock } = setup();
    const events = [];
    controller.subscribe((state, meta) => events.push(meta));
    if (preselect) controller.select(heroes[7].id);
    clock.advance(19900);
    assert.equal(controller.getRemainingSeconds(), 1);
    assert.equal(controller.getState().bans.length, 0);
    clock.advance(100);
    const state = controller.getState();
    assert.deepEqual(state.bans, [{ heroId: null, team: 'blue', seatId: 'blue-1', source: 'timeout' }]);
    assert.equal(getBannedIds(state).size, 0);
    assert.equal(state.candidateId, null);
    assert.equal(state.turnIndex, 1);
    assert.equal(state.deadline, 40000);
    assert.equal(controller.getRemainingSeconds(), 20);
    const event = events.find(meta => meta.notice?.type === 'ban-timeout');
    assert.equal(event.closeTransientUi, true);
    assert.match(event.notice.message, /ban位留空/);
    // 下一位可正常禁用第一个合法英雄，空位仍保留在蓝1而非被覆盖。
    clock.advance(1000);
    assert.equal(controller.getState().bans[0].heroId, null);
    assert.equal(controller.getState().bans[1].heroId, heroes[0].id);
    controller.dispose();
  });
}

test('换候选、筛选、修改技能不会刷新禁用截止，超时保留已保存技能', () => {
  const { controller, clock } = setup();
  const deadline = controller.getState().deadline;
  clock.advance(12000);
  controller.select(heroes[0].id);
  controller.select(heroes[1].id);
  controller.setFilter('法师');
  controller.setSkill('heal');
  assert.equal(controller.getState().deadline, deadline);
  clock.advance(8000);
  assert.equal(controller.getState().bans[0].heroId, null);
  assert.equal(getPlayer(controller.getState(), 'blue-1').skillId, 'heal');
  controller.dispose();
});

for (const type of ['SELECT_HERO', 'COMMIT_HERO', 'SET_FILTER', 'SET_SKILL', 'TIMEOUT']) {
  test(`20秒边界的${type}优先按空禁处理，旧动作不能再消费ban位`, () => {
    const rules = createDraftRules(heroes, { rng: () => 0 });
    let state = rules.createMatch();
    state = rules.dispatch(state, action(state, 'START'), 0).state;
    state = rules.dispatch(state, action(state, 'SELECT_HERO', { heroId: heroes[0].id }), 19900).state;
    const late = action(state, type, { heroId: heroes[0].id, category: '法师', skillId: 'heal' });
    const result = rules.dispatch(state, late, 20000);
    assert.equal(result.ok, true);
    assert.equal(result.state.bans.length, 1);
    assert.equal(result.state.bans[0].heroId, null);
    assert.equal(rules.getHeroStatus(result.state, heroes[0].id), 'available');
    assert.equal(rules.dispatch(result.state, late, 20000).code, 'STALE_ACTION');
  });
}

test('后台恢复只处理当前过期ban位一次，为下一位重新给20秒，旧回调失效', () => {
  const { controller, clock } = setup();
  const old = clock.pending()[0].id;
  controller.suspend();
  clock.jump(90000);
  controller.resume();
  assert.equal(controller.getState().bans.length, 1);
  assert.equal(controller.getState().bans[0].heroId, null);
  assert.equal(controller.getState().deadline, 110000);
  clock.fire(old);
  controller.resume();
  assert.equal(controller.getState().bans.length, 1);
  assert.equal(clock.count(), 1);
  controller.reset();
  clock.fire(old);
  assert.equal(controller.getState().bans.length, 0);
  assert.equal(controller.getState().deadline, null);
  assert.equal(clock.count(), 0);
  controller.dispose();
});

test('机器人回调晚于20秒也留空，正常回调仍在1～5秒内禁用', () => {
  const { controller, clock } = setup(5);
  clock.jump(20000);
  clock.fire(clock.pending()[0].id);
  assert.equal(controller.getState().bans[0].heroId, null);
  assert.equal(getCurrentSeat(controller.getState()).id, 'red-1');
  assert.equal(controller.getRemainingSeconds(), 20);
  controller.select(heroes[7].id);
  controller.commit({ confirmOffLane: true });
  clock.advance(999);
  assert.equal(controller.getState().bans.length, 2);
  clock.advance(1);
  assert.equal(controller.getState().bans[2].source, 'system');
  controller.dispose();
});

test('禁用提前TIMEOUT被拒绝，最后一位超时直接进入首组选人20秒', () => {
  const rules = createDraftRules(heroes, { rng: () => .99 });
  let state = rules.createMatch();
  state = rules.dispatch(state, action(state, 'START'), 0).state;
  for (let index = 0; index < 10; index++) {
    assert.equal(rules.dispatch(state, action(state, 'TIMEOUT'), state.deadline - 1).code, 'NOT_DUE');
    const next = rules.dispatch(state, action(state, 'TIMEOUT', {
      actor: 'system', seatId: BAN_ORDER[index].id,
    }), state.deadline);
    assert.equal(next.ok, true);
    state = next.state;
  }
  assert.equal(state.phase, 'pick');
  assert.equal(state.bans.length, 10);
  assert.equal(getBannedIds(state).size, 0);
  assert.equal(state.deadline, 220000);
  assert.equal(state.candidateId, null);
});

for (const [seatIndex, seat] of SEATS.entries()) {
  test(`${seat.id}禁用超时仍可完成选人、确认快照、重置`, () => {
    const { controller, clock } = setup(seatIndex);
    let steps = 0;
    while (!(controller.getState().phase === 'ban' && isHumanTurn(controller.getState()))) {
      assert.ok(++steps < 30);
      progress(controller, clock);
    }
    clock.advance(20000);
    while (['ban', 'pick'].includes(controller.getState().phase)) {
      assert.ok(++steps < 40);
      progress(controller, clock);
    }
    const review = controller.getState();
    assert.equal(review.phase, 'review');
    assert.equal(review.bans.filter(ban => ban.heroId === null).length, 1);
    assert.equal(getBannedIds(review).size, 9);
    assert.equal(getPickedIds(review).size, 10);
    assert.equal(controller.confirm().ok, true);
    const snapshot = controller.getState().resultSnapshot;
    assert.equal(snapshot.bans.find(ban => ban.seatId === seat.id).heroId, null);
    assert.equal(Object.isFrozen(snapshot.bans[0]), true);
    assert.equal(controller.reset().ok, true);
    assert.equal(controller.getState().phase, 'ready');
    assert.equal(snapshot.bans.length, 10);
    controller.dispose();
  });
}

test('确认仍拒绝空禁伪造来源、错位、重复英雄、非法英雄和缺失ban记录', () => {
  const { controller, clock } = setup();
  clock.advance(20000);
  while (['ban', 'pick'].includes(controller.getState().phase)) progress(controller, clock);
  const review = controller.getState();
  const rules = createDraftRules(heroes);
  for (const corrupt of [
    bans => { bans[0].source = 'manual'; },
    bans => { bans[1].seatId = bans[0].seatId; },
    bans => { bans[1].team = 'blue'; },
    bans => { bans[2].heroId = bans[1].heroId; },
    bans => { bans[1].heroId = -1; },
    bans => { bans.pop(); },
  ]) {
    const tampered = structuredClone(review);
    corrupt(tampered.bans);
    assert.equal(rules.dispatch(tampered, action(tampered, 'CONFIRM_TEAMS'), clock.now()).code, 'INVALID_ROSTER');
  }
  controller.dispose();
});
