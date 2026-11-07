/** 假时钟支持正常推进与后台节流，且可人工执行已取消回调用于竞态测试。 */
export function fakeClock(start = 0) {
  let time = start;
  let serial = 0;
  const tasks = new Map();
  const history = new Map();
  const clock = {
    now: () => time,
    schedule(callback, delay) {
      const id = ++serial;
      const task = { id, callback, due: time + delay };
      tasks.set(id, task);
      history.set(id, task);
      return id;
    },
    cancel: id => tasks.delete(id),
    advance(ms) {
      const target = time + ms;
      let iterations = 0;
      while (tasks.size) {
        const next = [...tasks.values()].sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (next.due > target) break;
        if (++iterations > 10000) throw new Error('定时任务未能收敛。');
        time = Math.max(time, next.due);
        tasks.delete(next.id);
        next.callback();
      }
      time = target;
    },
    jump(ms) { time += ms; },
    fire(id) { tasks.delete(id); history.get(id).callback(); },
    pending: () => [...tasks.values()],
    count: () => tasks.size,
  };
  return clock;
}
