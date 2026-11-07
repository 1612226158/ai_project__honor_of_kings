import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SEATS, BAN_ORDER, PICK_GROUPS, SKILLS, PROFICIENCIES, DEFAULT_SKILL_ID } from '../js/config.js';
import {
  createDraftRules, getCurrentSeat, getActiveSeats, getPlayer, isHumanTurn,
  getBannedIds, getPickedIds, getPermissions, filterHeroes,
} from '../js/state.js';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;
const skillIds = new Set(SKILLS.map(item => item.id));
const proficiencyIds = new Set(PROFICIENCIES.map(item => item.id));

function session(seatIndex = 0) {
  let randomCalls = 0;
  const rules = createDraftRules(heroes, { rng: () => ++randomCalls === 1 ? (seatIndex + 0.5) / 10 : 0.35 });
  return { rules, state: rules.createMatch(1), calls: () => randomCalls };
}

function action(state, type, extra = {}) {
  return { matchId: state.matchId, turnToken: state.turnToken,
    actor: 'human', seatId: state.humanSeat.id, confirmOffLane: true, type, ...extra };
}

function send(rules, state, type, extra = {}) {
  const at = Math.max(state.turnStartedAt ?? 0, extra.actor === 'system' ? state.autoActionAt[extra.seatId] ?? 0 : 0);
  const result = rules.dispatch(state, action(state, type, extra), at);
  assert.equal(result.ok, true, `${type}: ${result.message}`);
  return result.state;
}

function commitNext(rules, state, heroId = rules.drawAvailableHero(state)) {
  if (isHumanTurn(state)) {
    state = send(rules, state, 'SELECT_HERO', { heroId });
    return send(rules, state, 'COMMIT_HERO');
  }
  return send(rules, state, 'COMMIT_HERO', { actor: 'system', seatId: getCurrentSeat(state).id, heroId });
}

function reachPick(rules, state) {
  state = send(rules, state, 'START');
  for (let i = 0; i < 10; i++) state = commitNext(rules, state);
  assert.equal(state.phase, 'pick');
  return state;
}

test('初始化产生独立冻结状态，只标记一名用户且不启动任何回合', () => {
  const { rules, state } = session();
  const other = rules.createMatch(2);
  assert.equal(state.phase, 'ready');
  assert.equal(state.turnIndex, -1);
  assert.equal(state.turnToken, 0);
  assert.equal(state.deadline, null);
  assert.equal(getCurrentSeat(state), null);
  assert.equal(state.filter, '全部');
  assert.equal(state.resultSnapshot, null);
  const players = [...state.teams.blue, ...state.teams.red];
  assert.equal(players.filter(player => player.isHuman).length, 1);
  assert.ok(players.every(player => player.heroId === null && player.proficiencyId === null));
  assert.equal(getPlayer(state, state.humanSeat.id).skillId, DEFAULT_SKILL_ID);
  assert.notEqual(other.teams.blue, state.teams.blue);
  assert.notEqual(other.teams.blue[0], state.teams.blue[0]);
  assert.throws(() => { state.teams.blue[0].heroId = 105; }, TypeError);
});

test('初始化拒绝空英雄、重复ID、非法轮ID和非法随机源', () => {
  assert.throws(() => createDraftRules([]));
  assert.throws(() => createDraftRules([heroes[0], heroes[0]]), /英雄ID/);
  assert.throws(() => createDraftRules([{ id: '105' }]));
  assert.throws(() => createDraftRules(heroes, { rng: 1 }));
  const { rules } = session();
  for (const id of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => rules.createMatch(id));
});

test('开始只消费一次，旧轮/旧token及非法操作不改变当前状态', () => {
  const { rules, state: ready } = session();
  const start = action(ready, 'START');
  const started = rules.dispatch(ready, start).state;
  assert.equal(started.phase, 'ban');
  assert.equal(getCurrentSeat(started).id, 'blue-1');
  assert.deepEqual(getPermissions(ready), { canStart: true, canBrowse: false, canSelectHero: false,
    canCommitHero: false, canChangeSkill: true });
  for (const stale of [start, { ...action(started, 'SELECT_HERO', { heroId: 105 }), matchId: 99 }]) {
    const rejected = rules.dispatch(started, stale);
    assert.equal(rejected.code, 'STALE_ACTION');
    assert.equal(rejected.state, started);
  }
  assert.equal(rules.dispatch(started, action(started, 'START')).code, 'INVALID_PHASE');
  assert.equal(rules.dispatch(started, action(started, 'UNKNOWN')).code, 'UNKNOWN_ACTION');
  assert.equal(rules.dispatch(started, null).code, 'STALE_ACTION');
});

test('用户不能替系统预选/提交，系统也不能提前替用户锁定', () => {
  const { rules, state: ready } = session(9);
  const state = send(rules, ready, 'START');
  assert.equal(isHumanTurn(state), false);
  assert.equal(getPermissions(state).canSelectHero, false);
  for (const type of ['SELECT_HERO', 'COMMIT_HERO']) {
    assert.equal(rules.dispatch(state, action(state, type, { heroId: 105 })).code, 'FORBIDDEN');
  }
  assert.equal(rules.dispatch(state, action(state, 'COMMIT_HERO', { actor: 'system', seatId: 'red-2', heroId: 105 })).code, 'FORBIDDEN');
  const own = session(0);
  const userTurn = send(own.rules, own.state, 'START');
  assert.equal(own.rules.dispatch(userTurn, action(userTurn, 'COMMIT_HERO', { actor: 'system', seatId: 'blue-1', heroId: 105 })).code, 'FORBIDDEN');
});

test('预选不占用英雄，可更换候选；未预选或绕过候选无法提交', () => {
  const { rules, state: ready } = session();
  let state = send(rules, ready, 'START');
  assert.equal(rules.dispatch(state, action(state, 'COMMIT_HERO')).code, 'HERO_UNAVAILABLE');
  state = send(rules, state, 'SELECT_HERO', { heroId: heroes[0].id });
  assert.equal(rules.getAvailableHeroes(state).length, 133);
  assert.equal(rules.getHeroStatus(state, heroes[0].id), 'candidate');
  assert.equal(getPermissions(state).canCommitHero, true);
  state = send(rules, state, 'SELECT_HERO', { heroId: heroes[1].id });
  assert.equal(rules.getHeroStatus(state, heroes[0].id), 'available');
  assert.equal(rules.dispatch(state, action(state, 'COMMIT_HERO', { heroId: heroes[0].id })).code, 'CANDIDATE_MISMATCH');
  assert.equal(rules.dispatch(state, action(state, 'SELECT_HERO', { heroId: -1 })).code, 'HERO_UNAVAILABLE');
  const committed = send(rules, state, 'COMMIT_HERO');
  assert.equal(committed.bans[0].heroId, heroes[1].id);
  assert.equal(committed.candidateId, null);
  assert.equal(state.bans.length, 0);
});

test('已禁英雄不能再次禁用、已选英雄不可复用，非法提交不消费token', () => {
  const { rules, state: ready } = session();
  let state = send(rules, ready, 'START');
  state = commitNext(rules, state, heroes[0].id);
  const invalidBan = rules.dispatch(state, action(state, 'COMMIT_HERO', {
    actor: 'system', seatId: getCurrentSeat(state).id, heroId: heroes[0].id }), state.autoActionAt[getCurrentSeat(state).id]);
  assert.equal(invalidBan.code, 'HERO_UNAVAILABLE');
  assert.equal(invalidBan.state, state);
  for (let i = 1; i < 10; i++) state = commitNext(rules, state);
  assert.equal(rules.dispatch(state, action(state, 'SELECT_HERO', { heroId: heroes[0].id })).code, 'HERO_UNAVAILABLE');
  const pickedId = rules.getAvailableHeroes(state)[0].id;
  state = commitNext(rules, state, pickedId);
  assert.equal(rules.getHeroStatus(state, pickedId), 'picked');
  const result = rules.dispatch(state, action(state, 'COMMIT_HERO', { actor: 'system',
    seatId: getCurrentSeat(state).id, heroId: pickedId }), state.autoActionAt[getCurrentSeat(state).id]);
  assert.equal(result.code, 'HERO_UNAVAILABLE');
  assert.equal(result.state, state);
});

test('禁用和选人的旧提交重放不能额外推进', () => {
  const { rules, state: ready } = session();
  let state = send(rules, ready, 'START');
  state = send(rules, state, 'SELECT_HERO', { heroId: heroes[0].id });
  const old = action(state, 'COMMIT_HERO');
  state = rules.dispatch(state, old).state;
  assert.equal(rules.dispatch(state, old).code, 'STALE_ACTION');
  for (let i = 1; i < 10; i++) state = commitNext(rules, state);
  state = send(rules, state, 'SELECT_HERO', { heroId: rules.getAvailableHeroes(state)[0].id });
  const oldPick = action(state, 'COMMIT_HERO');
  state = rules.dispatch(state, oldPick).state;
  assert.equal(rules.dispatch(state, oldPick).code, 'STALE_ACTION');
  assert.equal(getPickedIds(state).size, 1);
});

test('主副职业并集、空副职业、多分路、去重不破坏原始数据', () => {
  const before = structuredClone(heroes);
  const dual = heroes.find(hero => hero.heroType2 && hero.heroType.name !== hero.heroType2.name);
  assert.ok(filterHeroes(heroes, dual.heroType.name).some(hero => hero.id === dual.id));
  assert.ok(filterHeroes(heroes, dual.heroType2.name).some(hero => hero.id === dual.id));
  assert.equal(filterHeroes([...heroes, heroes[0]], '全部').length, 133);
  assert.equal(filterHeroes([], '法师').length, 0);
  assert.throws(() => filterHeroes(heroes, '打野'), /未知英雄职业/);
  assert.deepEqual(heroes, before);
});

test('筛选和查询不会消耗随机、改变候选/deadline或缩小全场合法池', () => {
  const { rules, state: ready, calls } = session();
  let state = send(rules, ready, 'START');
  state = send(rules, state, 'SELECT_HERO', { heroId: heroes[0].id });
  // E3将建立deadline，本例验证现有非提交动作会保留它。
  state = Object.freeze({ ...state, deadline: 12345 });
  const before = calls();
  state = send(rules, state, 'SET_FILTER', { category: '法师' });
  assert.equal(state.deadline, 12345);
  assert.equal(state.candidateId, heroes[0].id);
  assert.equal(rules.getAvailableHeroes(state).length, 133);
  assert.ok(rules.getVisibleHeroes(state).every(hero => hero.heroType.name === '法师' || hero.heroType2?.name === '法师'));
  getCurrentSeat(state); getPermissions(state); getBannedIds(state); getPickedIds(state);
  rules.getHeroStatus(state, 105); rules.getVisibleHeroes(state);
  assert.equal(calls(), before);
  assert.equal(rules.dispatch(state, action(state, 'SET_FILTER', { category: '打野' })).code, 'INVALID_CATEGORY');
});

test('已禁状态跨职业同步，系统回合可浏览但不可预选', () => {
  const { rules, state: ready } = session();
  let state = send(rules, ready, 'START');
  const dual = heroes.find(hero => hero.heroType2);
  state = commitNext(rules, state, dual.id);
  for (const category of [dual.heroType.name, dual.heroType2.name]) {
    state = send(rules, state, 'SET_FILTER', { category });
    assert.ok(rules.getVisibleHeroes(state).some(hero => hero.id === dual.id));
    assert.equal(rules.getHeroStatus(state, dual.id), 'banned');
  }
  assert.equal(getPermissions(state).canBrowse, true);
  assert.equal(getPermissions(state).canSelectHero, false);
  assert.equal(rules.getHeroStatus(state, -1), 'unknown');
});

test('本人技能可在ready/ban/pick/review修改，不能修改系统位置或非法技能', () => {
  const { rules, state: ready } = session();
  let state = send(rules, ready, 'SET_SKILL', { skillId: 'heal' });
  assert.equal(getPlayer(state, state.humanSeat.id).skillId, 'heal');
  const denied = rules.dispatch(state, action(state, 'SET_SKILL', { seatId: 'red-1', skillId: 'heal' }));
  assert.equal(denied.code, 'FORBIDDEN');
  assert.equal(rules.dispatch(state, action(state, 'SET_SKILL', { skillId: 'teleport' })).code, 'INVALID_SKILL');
  state = send(rules, state, 'START');
  state = send(rules, state, 'SET_SKILL', { skillId: 'sprint' });
  for (let i = 0; i < 10; i++) state = commitNext(rules, state);
  state = send(rules, state, 'SET_SKILL', { skillId: 'stun' });
  for (let i = 0; i < 10; i++) state = commitNext(rules, state);
  const oldProficiency = getPlayer(state, state.humanSeat.id).proficiencyId;
  state = send(rules, state, 'SET_SKILL', { skillId: 'purify' });
  assert.equal(getPlayer(state, state.humanSeat.id).skillId, 'purify');
  assert.equal(getPlayer(state, state.humanSeat.id).proficiencyId, oldProficiency);
  // poster转换在E3实现；先校验该阶段不能修改技能的权限规则。
  const poster = Object.freeze({ ...state, phase: 'poster' });
  assert.equal(rules.dispatch(poster, action(poster, 'SET_SKILL', { skillId: 'heal' })).code, 'INVALID_PHASE');
});

test('锁定时才抽技能/熟练度，查询或后续回合不能重抽已锁定等级', () => {
  const { rules, state: ready, calls } = session();
  let state = reachPick(rules, ready);
  const userHero = rules.getAvailableHeroes(state)[0].id;
  state = send(rules, state, 'SELECT_HERO', { heroId: userHero });
  let before = calls();
  state = send(rules, state, 'COMMIT_HERO');
  // 一次本人熟练度，加下一双人组两次思考时间；不是重抽技能/熟练度。
  assert.equal(calls() - before, 3);
  const saved = getPlayer(state, state.humanSeat.id);
  const systemHero = rules.getLaneHeroes(state, getCurrentSeat(state))[0].id;
  before = calls();
  state = commitNext(rules, state, systemHero);
  assert.equal(calls() - before, 2);
  assert.equal(getPlayer(state, saved.id).proficiencyId, saved.proficiencyId);
  assert.equal(getPlayer(state, saved.id).skillId, DEFAULT_SKILL_ID);
  const bot = getPlayer(state, 'red-1');
  assert.ok(skillIds.has(bot.skillId));
  assert.ok(proficiencyIds.has(bot.proficiencyId));
});

test('随机源异常时保持原回合，不留下半写入的技能/英雄', () => {
  let fail = false;
  const rules = createDraftRules(heroes, { rng: () => fail ? 1 : 0 });
  let state = reachPick(rules, rules.createMatch(1));
  state = send(rules, state, 'SELECT_HERO', { heroId: rules.getAvailableHeroes(state)[0].id });
  fail = true;
  const result = rules.dispatch(state, action(state, 'COMMIT_HERO'));
  assert.equal(result.code, 'RANDOM_ERROR');
  assert.equal(result.state, state);
  assert.equal(getPickedIds(state).size, 0);
});

for (const [index, seat] of SEATS.entries()) {
  test(`完整无DOM演练：用户${seat.id}仅操作一禁一选，最终5+5且无冲突`, () => {
    const { rules, state: ready } = session(index);
    const original = structuredClone(ready);
    assert.equal(ready.humanSeat.id, seat.id);
    let state = send(rules, ready, 'SET_SKILL', { skillId: 'heal' });
    state = send(rules, state, 'START');
    let humanBans = 0;
    let humanPicks = 0;
    for (const expected of BAN_ORDER) {
      assert.equal(state.phase, 'ban');
      assert.equal(getCurrentSeat(state).id, expected.id);
      if (isHumanTurn(state)) humanBans++;
      state = commitNext(rules, state);
    }
    assert.equal(state.bans.filter(ban => ban.team === 'blue').length, 5);
    assert.equal(state.bans.filter(ban => ban.team === 'red').length, 5);
    assert.equal(getBannedIds(state).size, 10);
    assert.equal(state.phase, 'pick');
    assert.equal(state.candidateId, null);
    for (const group of PICK_GROUPS) {
      assert.equal(state.phase, 'pick');
      assert.deepEqual(getActiveSeats(state).map(seat => seat.id), group.map(seat => seat.id));
      for (let i = 0; i < group.length; i++) {
        if (isHumanTurn(state)) humanPicks++;
        state = commitNext(rules, state);
      }
    }
    assert.equal(humanBans, 1);
    assert.equal(humanPicks, 1);
    assert.equal(state.phase, 'review');
    assert.equal(getCurrentSeat(state), null);
    assert.equal(state.turnToken, 21);
    assert.equal(getPickedIds(state).size, 10);
    assert.equal(rules.getAvailableHeroes(state).length, 113);
    assert.ok([...getPickedIds(state)].every(id => !getBannedIds(state).has(id)));
    const players = [...state.teams.blue, ...state.teams.red];
    assert.ok(players.every(player => skillIds.has(player.skillId) && proficiencyIds.has(player.proficiencyId)));
    assert.equal(players.filter(player => player.lockedSource === 'manual').length, 1);
    assert.equal(getPlayer(state, seat.id).skillId, 'heal');
    assert.equal(rules.dispatch(state, action(state, 'COMMIT_HERO')).code, 'INVALID_PHASE');
    assert.equal(getPermissions(state).canCommitHero, false);
    assert.deepEqual(ready, original);
  });
}
