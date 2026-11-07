import { createDraftRules, isHumanTurn } from './state.js';
import { createTurnScheduler, remainingSeconds } from './timer.js';

const fatalCodes = new Set(['EMPTY_POOL', 'EMPTY_LANE_POOL', 'RANDOM_ERROR', 'INVALID_CLOCK', 'INVALID_ROSTER']);

/** 运行时唯一状态所有者；所有系统回调、用户动作都串行经过同一规则入口。 */
export function createDraftController(heroes, { rng = Math.random, now = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, matchId = 1 } = {}) {
  const rules = createDraftRules(heroes, { rng, now });
  let state = rules.createMatch(matchId);
  let disposed = false;
  const listeners = new Set();
  const notify = meta => {
    for (const listener of [...listeners]) listener(state, { ...meta, remainingSeconds: remainingSeconds(state, now()) });
  };

  const scheduler = createTurnScheduler({ now, schedule, cancel,
    onTick: () => notify({ type: 'tick' }),
    onDue: captured => {
      const type = Number.isFinite(state.deadline) && now() >= state.deadline ? 'TIMEOUT' : 'AUTO_HERO';
      apply({ ...captured, type });
    },
  });

  function apply(action) {
    if (disposed) return { ok: false, code: 'DISPOSED', message: '本轮控制器已关闭。', state };
    const previous = state;
    let result;
    try { result = rules.dispatch(state, action); }
    catch (error) { result = { ok: false, code: 'RUNTIME_ERROR', message: error instanceof Error ? error.message : '禁选运行异常。', state }; }
    if (result.ok) state = result.state;
    else if (fatalCodes.has(result.code) || result.code === 'RUNTIME_ERROR') state = rules.fail(state, result.code, result.message);
    const changed = previous !== state;
    const closeTransientUi = previous.matchId !== state.matchId || previous.phase !== state.phase ||
      (isHumanTurn(previous) && !isHumanTurn(state));
    scheduler.sync(state);
    notify({ type: result.ok ? 'change' : state.phase === 'error' ? 'error' : 'rejected',
      action: action.type, code: result.code, message: result.message, changed, closeTransientUi,
      notice: state.notice });
    return { ...result, state };
  }

  function send(type, payload = {}) {
    return apply({ ...payload, type, actor: 'human', seatId: state.humanSeat.id,
      matchId: state.matchId, turnToken: state.turnToken });
  }

  scheduler.sync(state);
  return Object.freeze({
    getState: () => state,
    getRemainingSeconds: () => remainingSeconds(state, now()),
    start: () => send('START'),
    select: heroId => send('SELECT_HERO', { heroId }),
    commit: ({ confirmOffLane = false } = {}) => send('COMMIT_HERO', { confirmOffLane }),
    setFilter: category => send('SET_FILTER', { category }),
    setLaneFilter: laneId => send('SET_LANE_FILTER', { laneId }),
    setSkill: skillId => send('SET_SKILL', { skillId }),
    confirm: () => send('CONFIRM_TEAMS'),
    reset: () => send('RESET'),
    subscribe(listener) {
      if (disposed) throw new Error('控制器已关闭。');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    suspend: () => scheduler.suspend(),
    resume: () => scheduler.resume(),
    dispose() { disposed = true; scheduler.dispose(); listeners.clear(); },
  });
}
