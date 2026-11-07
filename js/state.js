import {
  SEATS, BAN_ORDER, PICK_GROUPS, HERO_CATEGORIES, DEFAULT_SKILL_ID,
  SKILLS, PROFICIENCIES, PICK_TIME_MS, BAN_TIME_MS, AUTO_THINK_DELAYS_MS, MATCH_LANES,
} from './config.js';
import { randomChoice, randomSeat, randomPermutation } from './random.js';

export const getLane = laneId => MATCH_LANES.find(lane => lane.id === laneId) ?? null;
export const heroFitsLane = (hero, laneId) => Boolean(getLane(laneId) && hero?.lanes?.includes(getLane(laneId).name));

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

export function getTurnSeats(state) {
  if (state.phase === 'ban') return BAN_ORDER[state.turnIndex] ? [BAN_ORDER[state.turnIndex]] : [];
  return state.phase === 'pick' ? PICK_GROUPS[state.turnIndex] ?? [] : [];
}

export function getActiveSeats(state) {
  return getTurnSeats(state).filter(seat => state.phase !== 'pick' || getPlayer(state, seat.id)?.heroId === null);
}

export function getCurrentSeat(state) {
  return getActiveSeats(state)[0] ?? null;
}

export function getPlayer(state, seatId) {
  return [...state.teams.blue, ...state.teams.red].find(player => player.id === seatId) ?? null;
}

export function isHumanTurn(state) {
  return getActiveSeats(state).some(seat => seat.id === state.humanSeat.id);
}

export function getBannedIds(state) {
  return new Set(state.bans.map(ban => ban.heroId).filter(id => id !== null));
}

export function getPickedIds(state) {
  return new Set([...state.teams.blue, ...state.teams.red]
    .map(player => player.heroId).filter(id => id !== null));
}

export function getPermissions(state) {
  const active = state.phase === 'ban' || state.phase === 'pick';
  const ownTurn = active && isHumanTurn(state) && !state.isCommitting;
  return {
    canStart: state.phase === 'ready',
    canBrowse: active,
    canSelectHero: ownTurn,
    canCommitHero: ownTurn && state.candidateId !== null,
    canChangeSkill: ['ready', 'ban', 'pick', 'review'].includes(state.phase),
  };
}

/** 主副职业取并集并按ID去重；不将多分路改写成单值。 */
export function filterHeroes(heroes, category = '全部', laneId = 'all') {
  if (!HERO_CATEGORIES.includes(category)) throw new RangeError('未知英雄职业。');
  if (laneId !== 'all' && !getLane(laneId)) throw new RangeError('未知英雄分路。');
  const seen = new Set();
  return heroes.filter(hero => {
    if (seen.has(hero.id)) return false;
    const matches = (category === '全部' || hero.heroType?.name === category || hero.heroType2?.name === category)
      && (laneId === 'all' || heroFitsLane(hero, laneId));
    if (matches) seen.add(hero.id);
    return matches;
  });
}

/**
 * 不含DOM、网络、计时或任务调度的规则层。
 * 调用方保存每次成功返回的state，所有动作携带当前matchId/turnToken。
 * 随机仅在初始化、进入新组分配思考时间、明确抽取与锁定时发生，查询不会消耗随机源。
 */
export function createDraftRules(heroes, { rng = Math.random, now = () => performance.now() } = {}) {
  if (!Array.isArray(heroes) || heroes.length === 0) throw new TypeError('英雄数据不能为空。');
  if (typeof rng !== 'function') throw new TypeError('随机源必须是函数。');
  if (typeof now !== 'function') throw new TypeError('时钟必须是函数。');
  const byId = new Map(heroes.map(hero => [hero.id, hero]));
  if (byId.size !== heroes.length || heroes.some(hero => !Number.isInteger(hero.id) || hero.id <= 0)) {
    throw new TypeError('英雄ID必须唯一且为正整数。');
  }
  const allHeroes = [...byId.values()];
  const skillIds = new Set(SKILLS.map(skill => skill.id));
  const proficiencyIds = new Set(PROFICIENCIES.map(item => item.id));

  function createMatch(matchId = 1) {
    if (!Number.isSafeInteger(matchId) || matchId <= 0) throw new RangeError('本轮ID必须为正安全整数。');
    const humanSeat = randomSeat(rng);
    const assignments = Object.fromEntries(['blue', 'red'].map(team => [team, randomPermutation(MATCH_LANES, rng)]));
    const players = SEATS.map((seat, index) => ({ ...seat,
      laneId: assignments[seat.team][seat.slot - 1].id,
      nickname: `巅峰召唤师${index + 1}`,
      isHuman: seat.id === humanSeat.id,
      heroId: null,
      skillId: seat.id === humanSeat.id ? DEFAULT_SKILL_ID : null,
      proficiencyId: null,
      lockedSource: null,
      offLaneConfirmed: false,
    }));
    return freeze({
      matchId, phase: 'ready', humanSeat: { ...humanSeat, laneId: players.find(player => player.isHuman).laneId }, turnIndex: -1, turnToken: 0,
      bans: [], teams: {
        blue: players.filter(player => player.team === 'blue'),
        red: players.filter(player => player.team === 'red'),
      },
      candidateId: null, filter: '全部', laneFilter: 'all', deadline: null, turnStartedAt: null, autoActionAt: {},
      isCommitting: false, resultSnapshot: null, notice: null, error: null,
    });
  }

  function getAvailableHeroes(state) {
    const banned = getBannedIds(state);
    const picked = getPickedIds(state);
    return allHeroes.filter(hero => !banned.has(hero.id) && !picked.has(hero.id));
  }

  function getLaneHeroes(state, seat) {
    return getAvailableHeroes(state).filter(hero => heroFitsLane(hero, getPlayer(state, seat.id)?.laneId));
  }

  function getHeroStatus(state, heroId) {
    if (!byId.has(heroId)) return 'unknown';
    if (getBannedIds(state).has(heroId)) return 'banned';
    if (getPickedIds(state).has(heroId)) return 'picked';
    return state.candidateId === heroId ? 'candidate' : 'available';
  }

  function updatePlayer(state, seatId, changes) {
    const team = getPlayer(state, seatId).team;
    return { ...state.teams, [team]: state.teams[team].map(player =>
      player.id === seatId ? { ...player, ...changes } : player) };
  }

  const accept = state => ({ ok: true, state: freeze(state) });
  const reject = (state, code, message) => ({ ok: false, state, code, message });

  function fail(state, code, message) {
    return freeze({ ...state, phase: 'error', turnIndex: -1, turnToken: state.turnToken + 1,
      candidateId: null, deadline: null, turnStartedAt: null, autoActionAt: {}, isCommitting: false,
      notice: null, error: { code, message } });
  }

  function enterTurn(state, phase, turnIndex, at) {
    const next = { ...state, phase, turnIndex, candidateId: null,
      deadline: phase === 'ban' ? at + BAN_TIME_MS : phase === 'pick' ? at + PICK_TIME_MS : null,
      turnStartedAt: ['ban', 'pick'].includes(phase) ? at : null, autoActionAt: {} };
    if (phase === 'ban') next.laneFilter = 'all';
    if (phase === 'pick' && getActiveSeats(next).some(seat => seat.id === state.humanSeat.id)) {
      next.laneFilter = getPlayer(state, state.humanSeat.id).laneId;
      next.filter = '全部';
    }
    for (const seat of getActiveSeats(next)) {
      if (seat.id !== next.humanSeat.id) next.autoActionAt[seat.id] = at + randomChoice(AUTO_THINK_DELAYS_MS, rng);
    }
    return next;
  }

  function commit(state, currentSeat, heroId, source, at, confirmOffLane = false) {
    // 超时禁用只消费当前位置，不抽取英雄；显式空记录防止后续ban位前移。
    const skippedBan = state.phase === 'ban' && heroId === null && source === 'timeout';
    if (!skippedBan) {
      const available = getAvailableHeroes(state);
      if (available.length === 0) return reject(state, 'EMPTY_POOL', '没有可用英雄，请重新开始。');
      if (!available.some(hero => hero.id === heroId)) return reject(state, 'HERO_UNAVAILABLE', '请先选择一位可用英雄。');
    }
    if (state.phase === 'pick' && getPlayer(state, currentSeat.id).heroId !== null) {
      return reject(state, 'ALREADY_LOCKED', '该座位已锁定。');
    }
    const offLane = state.phase === 'pick' && !heroFitsLane(byId.get(heroId), getPlayer(state, currentSeat.id).laneId);
    if (offLane && source !== 'manual') return reject(state, 'LANE_HERO_UNAVAILABLE', '系统只能选择符合本局分路的英雄。');
    if (offLane && confirmOffLane !== true) return reject(state, 'LANE_CONFIRM_REQUIRED', '该英雄可能不适合本局分路，您确定吗？');
    try {
      let bans = state.bans;
      let teams = state.teams;
      if (state.phase === 'ban') {
        bans = [...state.bans, { heroId, team: currentSeat.team, seatId: currentSeat.id, source }];
      } else {
        const skillId = currentSeat.id === state.humanSeat.id ? getPlayer(state, currentSeat.id).skillId : randomChoice(SKILLS, rng).id;
        const proficiencyId = randomChoice(PROFICIENCIES, rng).id;
        teams = updatePlayer(state, currentSeat.id, { heroId, skillId, proficiencyId, lockedSource: source, offLaneConfirmed: offLane });
      }
      const ownCommit = currentSeat.id === state.humanSeat.id;
      const candidateTaken = !ownCommit && state.candidateId === heroId;
      const autoActionAt = { ...state.autoActionAt };
      delete autoActionAt[currentSeat.id];
      let next = { ...state, bans, teams, autoActionAt, turnToken: state.turnToken + 1,
        candidateId: ownCommit || candidateTaken ? null : state.candidateId, isCommitting: false,
        notice: skippedBan ? { type: 'ban-timeout', heroId: null, seatId: currentSeat.id,
          message: '禁用超时，本次ban位留空' } : source === 'timeout' ? { type: 'timeout', heroId, seatId: currentSeat.id,
          message: `选择超时，已随机分配${byId.get(heroId).name}` } : candidateTaken ? {
          type: 'candidate-taken', heroId, seatId: currentSeat.id,
          message: `队友已锁定${byId.get(heroId).name}，请重新选择英雄` } : null };
      if (state.phase === 'ban') {
        next = state.turnIndex === 9 ? enterTurn(next, 'pick', 0, at) : enterTurn(next, 'ban', state.turnIndex + 1, at);
      } else if (getActiveSeats(next).length === 0) {
        next = state.turnIndex === PICK_GROUPS.length - 1
          ? enterTurn(next, 'review', -1, at) : enterTurn(next, 'pick', state.turnIndex + 1, at);
      }
      return accept(next);
    } catch (error) {
      return reject(state, 'RANDOM_ERROR', error instanceof Error ? error.message : '随机分配失败。');
    }
  }

  function randomCommit(state, seat, source, at) {
    if (getAvailableHeroes(state).length === 0) return reject(state, 'EMPTY_POOL', '没有可用英雄，请重新开始。');
    const pool = state.phase === 'pick' ? getLaneHeroes(state, seat) : getAvailableHeroes(state);
    if (pool.length === 0) return reject(state, 'EMPTY_LANE_POOL', `${getLane(getPlayer(state, seat.id).laneId).name}已无可选英雄，请重新开始。`);
    try {
      return commit(state, seat, randomChoice(pool, rng).id, source, at);
    } catch (error) {
      return reject(state, 'RANDOM_ERROR', error instanceof Error ? error.message : '随机分配失败。');
    }
  }

  function completeRoster(state) {
    if (getPlayer(state, state.humanSeat.id)?.laneId !== state.humanSeat.laneId) return false;
    if (!Array.isArray(state.bans) || state.bans.length !== BAN_ORDER.length) return false;
    if (!state.bans.every((ban, index) => ban && ban.seatId === BAN_ORDER[index].id &&
      ban.team === BAN_ORDER[index].team && (ban.heroId === null ? ban.source === 'timeout' :
        byId.has(ban.heroId) && ban.source === (ban.seatId === state.humanSeat.id ? 'manual' : 'system')))) return false;
    if (getBannedIds(state).size !== state.bans.filter(ban => ban.heroId !== null).length) return false;
    if (!['blue', 'red'].every(team => Array.isArray(state.teams[team]) && state.teams[team].length === 5 &&
      new Set(state.teams[team].map(player => player.laneId)).size === 5 &&
      state.teams[team].every((player, index) => player.id === `${team}-${index + 1}` && player.team === team &&
        getLane(player.laneId) && (heroFitsLane(byId.get(player.heroId), player.laneId) ||
          (player.isHuman && player.lockedSource === 'manual' && player.offLaneConfirmed === true)) &&
        byId.has(player.heroId) && skillIds.has(player.skillId) && proficiencyIds.has(player.proficiencyId) &&
        player.isHuman === (player.id === state.humanSeat.id)))) return false;
    if (getPickedIds(state).size !== 10 || [...getPickedIds(state)].some(id => getBannedIds(state).has(id))) return false;
    return true;
  }

  function dispatch(state, action, at = now()) {
    if (!action || action.matchId !== state.matchId || action.turnToken !== state.turnToken) {
      return reject(state, 'STALE_ACTION', '该操作已过期，请以当前回合为准。');
    }
    if (state.isCommitting) return reject(state, 'BUSY', '当前回合正在提交。');
    const isHumanActor = action.actor === 'human' && action.seatId === state.humanSeat.id;
    if (!Number.isFinite(at) || at < 0) return reject(state, 'INVALID_CLOCK', '时钟状态不正确，请重新开始。');

    if (action.type === 'RESET') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '只有本轮用户可以重新开始。');
      try { return accept(createMatch(state.matchId + 1)); }
      catch (error) { return reject(state, 'RANDOM_ERROR', error instanceof Error ? error.message : '新一轮初始化失败。'); }
    }

    if (action.type === 'CONFIRM_TEAMS') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '只有本轮用户可以确认队伍。');
      if (state.phase !== 'review') return reject(state, 'INVALID_PHASE', '请先完成全部英雄选择。');
      if (!completeRoster(state)) return reject(state, 'INVALID_ROSTER', '队伍资料不完整或有冲突，请重新开始。');
      const resultSnapshot = structuredClone({ matchId: state.matchId, humanSeat: state.humanSeat,
        teams: state.teams, bans: state.bans });
      return accept({ ...state, phase: 'poster', turnToken: state.turnToken + 1,
        resultSnapshot, deadline: null, turnStartedAt: null, autoActionAt: {}, candidateId: null, notice: null });
    }

    // 到期边界优先处理超时：禁用留空、选人随机；晚到的确认不能抢过超时。
    const timedActions = ['SELECT_HERO', 'COMMIT_HERO', 'SET_FILTER', 'SET_LANE_FILTER', 'SET_SKILL', 'AUTO_HERO', 'TIMEOUT'];
    const current = getCurrentSeat(state);
    const systemSeat = getActiveSeats(state).find(seat => action.actor === 'system' && action.seatId === seat.id);
    const isCurrentSystem = Boolean(systemSeat);
    if (isHumanActor && ['SELECT_HERO', 'COMMIT_HERO'].includes(action.type) && current && !isHumanTurn(state)) {
      return reject(state, 'FORBIDDEN', '请等待自己的禁选回合。');
    }
    if (['ban', 'pick'].includes(state.phase) && Number.isFinite(state.deadline) && at >= state.deadline && timedActions.includes(action.type)) {
      if (!isHumanActor && !isCurrentSystem) return reject(state, 'FORBIDDEN', '无权操作当前回合。');
      const target = systemSeat ?? (isHumanTurn(state) ? state.humanSeat : current);
      return state.phase === 'ban' ? commit(state, target, null, 'timeout', at) : randomCommit(state, target, 'timeout', at);
    }

    if (action.type === 'TIMEOUT') return reject(state, 'NOT_DUE', '当前回合尚未到期。');
    if (action.type === 'AUTO_HERO') {
      if (!current) return reject(state, 'INVALID_PHASE', '当前没有自动禁选回合。');
      if (!isCurrentSystem || systemSeat.id === state.humanSeat.id) return reject(state, 'FORBIDDEN', '系统不能提前替用户选择。');
      if (!Number.isFinite(state.autoActionAt[systemSeat.id]) || at < state.autoActionAt[systemSeat.id]) {
        return reject(state, 'NOT_DUE', '系统仍在思考中。');
      }
      return randomCommit(state, systemSeat, 'system', at);
    }

    if (action.type === 'START') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '只有本轮用户可以开始。');
      if (state.phase !== 'ready') return reject(state, 'INVALID_PHASE', '当前不是准备阶段。');
      try { return accept(enterTurn({ ...state, turnToken: state.turnToken + 1 }, 'ban', 0, at)); }
      catch (error) { return reject(state, 'RANDOM_ERROR', error instanceof Error ? error.message : '思考时间生成失败。'); }
    }

    if (action.type === 'SET_SKILL') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '只能修改自己的召唤师技能。');
      if (!getPermissions(state).canChangeSkill) return reject(state, 'INVALID_PHASE', '当前阶段不能修改技能。');
      if (!skillIds.has(action.skillId)) return reject(state, 'INVALID_SKILL', '该召唤师技能不可用。');
      return accept({ ...state, teams: updatePlayer(state, state.humanSeat.id, { skillId: action.skillId }) });
    }

    if (action.type === 'SET_FILTER') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '无权修改当前筛选。');
      if (!getPermissions(state).canBrowse) return reject(state, 'INVALID_PHASE', '当前不在禁选阶段。');
      if (!HERO_CATEGORIES.includes(action.category)) return reject(state, 'INVALID_CATEGORY', '未知英雄职业。');
      return accept({ ...state, filter: action.category });
    }

    if (action.type === 'SET_LANE_FILTER') {
      if (!isHumanActor) return reject(state, 'FORBIDDEN', '无权修改当前筛选。');
      if (!getPermissions(state).canBrowse) return reject(state, 'INVALID_PHASE', '当前不在禁选阶段。');
      if (action.laneId !== 'all' && !getLane(action.laneId)) return reject(state, 'INVALID_LANE', '未知英雄分路。');
      return accept({ ...state, laneFilter: action.laneId, filter: '全部' });
    }

    if (action.type !== 'SELECT_HERO' && action.type !== 'COMMIT_HERO') {
      return reject(state, 'UNKNOWN_ACTION', '不支持该操作。');
    }
    const currentSeat = getCurrentSeat(state);
    if (!currentSeat) return reject(state, 'INVALID_PHASE', '当前不是禁用或选人回合。');

    if (action.type === 'SELECT_HERO') {
      if (!isHumanActor || !isHumanTurn(state)) return reject(state, 'FORBIDDEN', '请等待自己的禁选回合。');
      if (!getAvailableHeroes(state).some(hero => hero.id === action.heroId)) {
        return reject(state, 'HERO_UNAVAILABLE', '该英雄不存在、已被禁用或已被选择。');
      }
      return accept({ ...state, candidateId: action.heroId,
        notice: state.notice?.type === 'candidate-taken' ? null : state.notice });
    }

    const ownTurn = isHumanActor && isHumanTurn(state);
    const targetSeat = ownTurn ? state.humanSeat : systemSeat;
    if (!targetSeat || (!ownTurn && targetSeat.id === state.humanSeat.id)) return reject(state, 'FORBIDDEN', '不能替其他座位提交。');
    const heroId = ownTurn ? state.candidateId : action.heroId;
    if (ownTurn && action.heroId !== undefined && action.heroId !== heroId) {
      return reject(state, 'CANDIDATE_MISMATCH', '请锁定当前预选的英雄。');
    }
    if (!ownTurn && at < state.autoActionAt[targetSeat.id]) return reject(state, 'NOT_DUE', '系统仍在思考中。');
    return commit(state, targetSeat, heroId, ownTurn ? 'manual' : 'system', at, ownTurn && action.confirmOffLane === true);
  }

  return Object.freeze({
    createMatch, dispatch, fail, getAvailableHeroes, getHeroStatus,
    getVisibleHeroes: state => filterHeroes(allHeroes, state.filter, state.laneFilter),
    getLaneHeroes,
    drawAvailableHero: state => randomChoice(state.phase === 'pick'
      ? getLaneHeroes(state, isHumanTurn(state) ? state.humanSeat : getCurrentSeat(state)) : getAvailableHeroes(state), rng).id,
  });
}
