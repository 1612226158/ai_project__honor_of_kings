import { getActiveSeats } from './state.js';

export function remainingSeconds(state, at = performance.now()) {
  return ['ban', 'pick'].includes(state.phase) && Number.isFinite(state.deadline)
    ? Math.max(0, Math.ceil((state.deadline - at) / 1000)) : null;
}

export function nextTurnEvent(state) {
  const events = getActiveSeats(state).flatMap(seat => {
    const autoAt = state.autoActionAt?.[seat.id];
    const at = Math.min(Number.isFinite(state.deadline) ? state.deadline : Infinity,
      Number.isFinite(autoAt) ? autoAt : Infinity);
    return Number.isFinite(at) ? [{ seatId: seat.id, at }] : [];
  });
  return events.sort((left, right) => left.at - right.at)[0] ?? null;
}

export function turnDueAt(state) {
  return nextTurnEvent(state)?.at ?? null;
}

/** 单个定时任务覆盖倒计时刷新与到期检查；代号使已取消却晚到的回调失效。 */
export function createTurnScheduler({ now = () => performance.now(), schedule = setTimeout,
  cancel = clearTimeout, onDue, onTick = () => {} } = {}) {
  let state = null;
  let key = null;
  let handle = null;
  let generation = 0;
  let suspended = false;
  let disposed = false;

  function clear() {
    generation++;
    if (handle !== null) cancel(handle);
    handle = null;
  }

  function arm() {
    if (disposed || suspended || !state) return;
    const due = turnDueAt(state);
    if (due === null) return;
    const at = now();
    let delay = Math.max(0, due - at);
    if (['ban', 'pick'].includes(state.phase) && state.deadline > at) {
      const ms = state.deadline - at;
      const nextSecond = ms - (Math.ceil(ms / 1000) - 1) * 1000;
      delay = Math.min(delay, nextSecond);
    }
    const token = ++generation;
    handle = schedule(() => {
      if (disposed || suspended || token !== generation) return;
      handle = null;
      wake();
    }, delay);
  }

  function wake() {
    if (disposed || suspended || !state) return;
    const due = turnDueAt(state);
    if (due === null) return;
    if (now() >= due) {
      const captured = { matchId: state.matchId, turnToken: state.turnToken,
        actor: 'system', seatId: nextTurnEvent(state).seatId };
      clear();
      key = null;
      state = null;
      onDue(captured);
    } else {
      const beforeTick = generation;
      onTick();
      if (beforeTick === generation) arm();
    }
  }

  function sync(next) {
    if (disposed) return;
    const nextKey = `${next.matchId}:${next.turnToken}:${next.phase}:${next.deadline}:${next.turnStartedAt}`;
    state = next;
    if (nextKey === key) return;
    clear();
    key = nextKey;
    arm();
  }

  return Object.freeze({
    sync,
    suspend() { suspended = true; clear(); },
    resume() {
      if (disposed) return;
      suspended = false;
      clear();
      wake();
    },
    dispose() { disposed = true; clear(); state = null; key = null; },
  });
}
