import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDraftController } from '../js/draft-controller.js';
import { createDraftRules, getCurrentSeat, getPlayer, getBannedIds, getPickedIds, isHumanTurn } from '../js/state.js';
import { SEATS, DEFAULT_SKILL_ID } from '../js/config.js';
import { fakeClock } from './helpers/fake-clock.mjs';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;

function setup(seatIndex = 0, options = {}) {
  const clock = options.clock ?? fakeClock();
  let calls = 0;
  const rng = options.rng ?? (() => ++calls === 1 ? (seatIndex + 0.5) / 10 : 0);
  const controller = createDraftController(options.heroes ?? heroes, { ...clock, rng });
  return { controller, clock };
}

function legal(state) {
  return heroes.find(hero => !getBannedIds(state).has(hero.id) && !getPickedIds(state).has(hero.id)).id;
}

function selectCommit(controller) {
  assert.equal(controller.select(legal(controller.getState())).ok, true);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
}

function reachHumanPick(controller, clock) {
  assert.equal(controller.start().ok, true);
  let steps = 0;
  while (controller.getState().phase === 'ban') {
    assert.ok(++steps <= 20);
    if (isHumanTurn(controller.getState())) selectCommit(controller);
    else clock.advance(1000);
  }
  while (!isHumanTurn(controller.getState())) {
    assert.ok(++steps <= 30);
    clock.advance(1000);
  }
  assert.equal(controller.getState().phase, 'pick');
}

function finishPicks(controller, clock) {
  let steps = 0;
  while (controller.getState().phase === 'pick') {
    assert.ok(++steps <= 12);
    if (isHumanTurn(controller.getState())) selectCommit(controller);
    else clock.advance(1000);
  }
  assert.equal(controller.getState().phase, 'review');
}

function envelope(state, type, extra = {}) {
  return { type, actor: 'human', seatId: state.humanSeat.id,
    matchId: state.matchId, turnToken: state.turnToken, ...extra };
}

test('ready不调度；用户禁用19.9秒仍可确认；系统禁用恰好1秒后发生', () => {
  const { controller, clock } = setup();
  assert.equal(clock.count(), 0);
  controller.start();
  clock.advance(19900);
  assert.equal(controller.getState().bans.length, 0);
  assert.equal(controller.getRemainingSeconds(), 1);
  selectCommit(controller);
  clock.advance(999);
  assert.equal(controller.getState().bans.length, 1);
  clock.advance(1);
  assert.equal(controller.getState().bans.length, 2);
  assert.equal(getCurrentSeat(controller.getState()).id, 'blue-2');
  controller.dispose();
});

test('本人选择19.9秒仍可锁定；每个下一回合有新的20秒上限', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  const initial = controller.getState().deadline;
  controller.select(legal(controller.getState()));
  clock.advance(19900);
  assert.equal(controller.getRemainingSeconds(), 1);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  assert.equal(getPlayer(controller.getState(), 'blue-1').lockedSource, 'manual');
  assert.equal(controller.getState().deadline, clock.now() + 20000);
  assert.notEqual(controller.getState().deadline, initial);
  controller.dispose();
});

test('无预选20秒到期，保留用户技能并发出关闭弹层/超时提示事件', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  controller.setSkill('heal');
  const events = [];
  controller.subscribe((_state, meta) => events.push(meta));
  clock.advance(20000);
  const state = controller.getState();
  const own = getPlayer(state, state.humanSeat.id);
  assert.equal(own.lockedSource, 'timeout');
  assert.equal(own.skillId, 'heal');
  assert.ok(own.proficiencyId);
  const timeout = events.find(meta => meta.notice?.type === 'timeout');
  assert.equal(timeout.closeTransientUi, true);
  assert.match(timeout.notice.message, /选择超时，已随机分配/);
  assert.equal(getPickedIds(state).size, 1);
  controller.dispose();
});

test('有预选且筛选其他职业时超时仍从本局分路合法池随机，不默认锁定预选', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  const state = controller.getState();
  const first = legal(state);
  const candidate = heroes.find(hero => hero.id !== first && !getBannedIds(state).has(hero.id)).id;
  controller.select(candidate);
  controller.setFilter('法师');
  const deadline = controller.getState().deadline;
  clock.advance(19000);
  controller.setSkill('stun');
  controller.setFilter('射手');
  controller.select(candidate);
  assert.equal(controller.getState().deadline, deadline);
  clock.advance(1000);
  const own = getPlayer(controller.getState(), 'blue-1');
  assert.equal(own.heroId, first);
  assert.notEqual(own.heroId, candidate);
  assert.equal(own.lockedSource, 'timeout');
  controller.dispose();
});

test('到期时晚到手动锁定优先走超时，旧定时回调和第二次提交无效', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  controller.select(legal(controller.getState()));
  const old = clock.pending()[0].id;
  const previousToken = controller.getState().turnToken;
  clock.jump(20000);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
  assert.equal(getPlayer(controller.getState(), 'blue-1').lockedSource, 'timeout');
  assert.equal(controller.getState().turnToken, previousToken + 1);
  const state = controller.getState();
  clock.fire(old);
  assert.equal(controller.getState(), state);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, false);
  controller.dispose();
});

test('后台恢复只结算到期的当前组；同组第二人仍用原截止时间，下一组重新计时', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  selectCommit(controller);
  const old = clock.pending()[0].id;
  const previous = controller.getState();
  controller.suspend();
  clock.jump(60000);
  controller.resume();
  assert.equal(getPickedIds(controller.getState()).size, 2);
  assert.equal(controller.getState().turnToken, previous.turnToken + 1);
  assert.equal(controller.getState().deadline, previous.deadline);
  assert.equal(getPlayer(controller.getState(), 'red-1').lockedSource, 'timeout');
  clock.fire(old);
  assert.equal(getPickedIds(controller.getState()).size, 2);
  clock.advance(0);
  assert.equal(getPickedIds(controller.getState()).size, 3);
  assert.equal(getPlayer(controller.getState(), 'red-2').lockedSource, 'timeout');
  assert.equal(controller.getState().deadline, clock.now() + 20000);
  clock.advance(999);
  assert.equal(getPickedIds(controller.getState()).size, 3);
  controller.dispose();
});

test('恢复未到期的用户回合不重启20秒，重复resume不增建任务', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  const deadline = controller.getState().deadline;
  controller.suspend();
  clock.jump(5000);
  controller.resume();
  controller.resume();
  assert.equal(controller.getState().deadline, deadline);
  assert.equal(controller.getRemainingSeconds(), 15);
  assert.equal(clock.count(), 1);
  controller.dispose();
});

test('普通系统回合推进不要求关闭本人的技能弹层', () => {
  const { controller, clock } = setup(9);
  controller.start();
  const changes = [];
  controller.subscribe((_state, meta) => changes.push(meta));
  controller.setSkill('heal');
  clock.advance(1000);
  const automatic = changes.find(meta => meta.action === 'AUTO_HERO');
  assert.equal(automatic.closeTransientUi, false);
  assert.equal(getPlayer(controller.getState(), 'red-5').skillId, 'heal');
  controller.dispose();
});

test('确认前可改自己的技能，确认生成深拷贝冻结快照且不可重复确认', () => {
  const { controller, clock } = setup();
  assert.equal(controller.confirm().code, 'INVALID_PHASE');
  reachHumanPick(controller, clock);
  finishPicks(controller, clock);
  assert.equal(clock.count(), 0);
  controller.setSkill('purify');
  const review = controller.getState();
  assert.equal(controller.confirm().ok, true);
  const poster = controller.getState();
  assert.equal(poster.phase, 'poster');
  assert.equal(clock.count(), 0);
  assert.notEqual(poster.resultSnapshot.teams, review.teams);
  assert.notEqual(poster.resultSnapshot.teams.blue[0], review.teams.blue[0]);
  assert.deepEqual(poster.resultSnapshot.teams, review.teams);
  assert.equal(getPlayer(poster, 'blue-1').skillId, 'purify');
  assert.throws(() => { poster.resultSnapshot.teams.blue[0].skillId = 'heal'; }, TypeError);
  assert.equal(controller.setSkill('heal').code, 'INVALID_PHASE');
  assert.equal(controller.confirm().code, 'INVALID_PHASE');
  assert.equal(controller.getState(), poster);
  controller.dispose();
});

test('review阵容不完整或英雄冲突拒绝确认，原始快照不被创建', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  finishPicks(controller, clock);
  const original = controller.getState();
  const rules = createDraftRules(heroes, { rng: () => 0, now: clock.now });
  const invalid = structuredClone(original);
  invalid.teams.red[0].heroId = invalid.teams.blue[0].heroId;
  assert.equal(rules.dispatch(invalid, envelope(invalid, 'CONFIRM_TEAMS')).code, 'INVALID_ROSTER');
  invalid.teams.red.pop();
  assert.equal(rules.dispatch(invalid, envelope(invalid, 'CONFIRM_TEAMS')).code, 'INVALID_ROSTER');
  assert.equal(original.resultSnapshot, null);
  controller.dispose();
});

test('重置清空候选/筛选/技能/快照、重抽用户位置，旧回调不污染新轮', () => {
  let calls = 0;
  const { controller, clock } = setup(0, { rng: () => ++calls === 1 ? 0 : 0.95 });
  controller.start();
  selectCommit(controller);
  controller.setSkill('heal');
  controller.setFilter('法师');
  const oldCallback = clock.pending()[0].id;
  const old = controller.getState();
  assert.equal(controller.reset().ok, true);
  const fresh = controller.getState();
  assert.equal(fresh.matchId, old.matchId + 1);
  assert.equal(fresh.phase, 'ready');
  assert.equal(fresh.humanSeat.id, 'red-5');
  assert.equal(fresh.bans.length, 0);
  assert.equal(getPickedIds(fresh).size, 0);
  assert.equal(fresh.filter, '全部');
  assert.equal(fresh.candidateId, null);
  assert.equal(fresh.resultSnapshot, null);
  assert.equal(fresh.deadline, null);
  assert.equal(getPlayer(fresh, fresh.humanSeat.id).skillId, DEFAULT_SKILL_ID);
  assert.equal(clock.count(), 0);
  clock.jump(90000);
  clock.fire(oldCallback);
  assert.equal(controller.getState(), fresh);
  const rules = createDraftRules(heroes);
  assert.equal(rules.dispatch(fresh, envelope(old, 'COMMIT_HERO')).code, 'STALE_ACTION');
  controller.dispose();
});

for (const phase of ['ready', 'ban', 'pick', 'review', 'poster']) {
  test(`阶段${phase}可重置，所有任务停止且不自动开始`, () => {
    const { controller, clock } = setup();
    if (phase === 'ban') controller.start();
    if (['pick', 'review', 'poster'].includes(phase)) reachHumanPick(controller, clock);
    if (['review', 'poster'].includes(phase)) finishPicks(controller, clock);
    if (phase === 'poster') controller.confirm();
    assert.equal(controller.getState().phase, phase);
    controller.reset();
    assert.equal(controller.getState().phase, 'ready');
    assert.equal(clock.count(), 0);
    clock.advance(60000);
    assert.equal(controller.getState().phase, 'ready');
    controller.dispose();
  });
}

test('空池进入可重置error，随机失败也停止任务，无undefined英雄', () => {
  const { controller, clock } = setup(0, { heroes: heroes.slice(0, 1) });
  controller.start();
  controller.select(heroes[0].id);
  controller.commit({ confirmOffLane: true });
  clock.advance(1000);
  assert.equal(controller.getState().phase, 'error');
  assert.equal(controller.getState().error.code, 'EMPTY_POOL');
  assert.equal(clock.count(), 0);
  assert.equal(getPickedIds(controller.getState()).size, 0);
  assert.equal(controller.reset().ok, true);
  assert.equal(controller.getState().phase, 'ready');
  let broken = false;
  const second = setup(0, { rng: () => broken ? NaN : 0 });
  second.controller.start();
  selectCommit(second.controller);
  broken = true;
  second.clock.advance(1000);
  assert.equal(second.controller.getState().error.code, 'RANDOM_ERROR');
  assert.equal(second.clock.count(), 0);
  broken = false;
  assert.equal(second.controller.reset().ok, true);
  controller.dispose(); second.controller.dispose();
});

test('非法点击是可恢复拒绝，不停止当前有效计时；dispose后任何入口不可再推进', () => {
  const { controller, clock } = setup();
  reachHumanPick(controller, clock);
  const state = controller.getState();
  assert.equal(controller.select(-1).code, 'HERO_UNAVAILABLE');
  assert.equal(controller.getState(), state);
  assert.equal(clock.count(), 1);
  const callback = clock.pending()[0].id;
  controller.dispose();
  clock.jump(90000);
  clock.fire(callback);
  assert.equal(clock.count(), 0);
  assert.equal(controller.reset().code, 'DISPOSED');
  assert.equal(controller.start().code, 'DISPOSED');
  controller.resume();
  assert.equal(controller.getState(), state);
});

test('系统提前触发被拒绝；19.9秒TIMEOUT不能越权提交', () => {
  const clock = fakeClock();
  const rules = createDraftRules(heroes, { rng: () => 0, now: clock.now });
  let state = rules.createMatch();
  state = rules.dispatch(state, envelope(state, 'START')).state;
  assert.equal(rules.dispatch(state, envelope(state, 'AUTO_HERO', { actor: 'system' })).code, 'FORBIDDEN');
  const { controller, clock: c } = setup();
  reachHumanPick(controller, c);
  const pick = controller.getState();
  assert.equal(rules.dispatch(pick, envelope(pick, 'TIMEOUT', { actor: 'system' }), pick.deadline - 100).code, 'NOT_DUE');
  const invalid = rules.dispatch(pick, envelope(pick, 'COMMIT_HERO'), NaN);
  assert.equal(invalid.code, 'INVALID_CLOCK');
  controller.dispose();
});

test('当前系统座位也不能提前提交AUTO_HERO，随机到5秒时等待到5秒边界', () => {
  const clock = fakeClock();
  const rules = createDraftRules(heroes, { rng: () => 0.95, now: clock.now });
  let state = rules.createMatch();
  state = rules.dispatch(state, envelope(state, 'START')).state;
  const automatic = envelope(state, 'AUTO_HERO', { actor: 'system', seatId: 'blue-1' });
  assert.equal(state.autoActionAt['blue-1'], 5000);
  assert.equal(rules.dispatch(state, automatic, 4999).code, 'NOT_DUE');
  const result = rules.dispatch(state, automatic, 5000);
  assert.equal(result.ok, true);
  assert.equal(result.state.bans.length, 1);
  assert.equal(result.state.bans[0].source, 'system');
});

for (const [index, seat] of SEATS.entries()) {
  for (const timeout of [false, true]) {
    test(`完整运行：${seat.id} ${timeout ? '超时' : '手动'}选人→确认→快照→重置`, () => {
      const { controller, clock } = setup(index);
      reachHumanPick(controller, clock);
      if (timeout) clock.advance(20000);
      else selectCommit(controller);
      finishPicks(controller, clock);
      assert.equal(controller.getState().bans.filter(ban => ban.source === 'manual').length, 1);
      assert.equal(getBannedIds(controller.getState()).size, 10);
      assert.equal(getPickedIds(controller.getState()).size, 10);
      assert.ok([...getPickedIds(controller.getState())].every(id => !getBannedIds(controller.getState()).has(id)));
      const own = getPlayer(controller.getState(), seat.id);
      assert.equal(own.lockedSource, timeout ? 'timeout' : 'manual');
      const before = structuredClone(controller.getState().teams);
      controller.confirm();
      assert.deepEqual(controller.getState().resultSnapshot.teams, before);
      controller.reset();
      assert.equal(controller.getState().phase, 'ready');
      assert.equal(getPickedIds(controller.getState()).size, 0);
      assert.equal(clock.count(), 0);
      controller.dispose();
    });
  }
}
