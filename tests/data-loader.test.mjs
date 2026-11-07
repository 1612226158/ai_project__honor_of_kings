import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateHeroData, createHeroLoader } from '../js/data-loader.js';

const original = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(original);
const ok = raw => ({ ok: true, status: 200, json: async () => raw });

test('原始133位英雄可加载，索引不改写副职业、多分路或空分路', () => {
  const raw = fixture();
  const before = structuredClone(raw);
  const result = validateHeroData(raw);
  assert.equal(result.heroes.length, 133);
  assert.equal(result.byId.size, 133);
  assert.deepEqual(raw, before);
  assert.ok(result.heroes.some(hero => hero.lanes.length > 1));
  assert.ok(result.heroes.some(hero => hero.heroType2 !== null));
  assert.ok(result.heroes.some(hero => hero.lanes.length === 0));
});

test('不完整数据和重复ID不能启动', () => {
  const incomplete = fixture();
  incomplete.heroes.pop();
  assert.throws(() => validateHeroData(incomplete), /数量不完整/);
  const duplicate = fixture();
  duplicate.heroes[1].id = duplicate.heroes[0].id;
  assert.throws(() => validateHeroData(duplicate), /ID 缺失或重复/);
});

test('错误职业、非数组分路、非法能力或外部图片路径会被拒绝', () => {
  const edits = [
    raw => { raw.heroes[0].heroType2 = { code: 9, name: '其他' }; },
    raw => { raw.heroes[0].lanes = '中路'; },
    raw => { raw.heroes[0].attributes.skill = 11; },
    raw => { raw.heroes[0].images.avatar = 'https://example.com/avatar.jpg'; },
    raw => { raw.heroes[0].images.cover = '../cover.jpg'; },
  ];
  for (const edit of edits) {
    const raw = fixture();
    edit(raw);
    assert.throws(() => validateHeroData(raw));
  }
});

test('HTTP失败后可以成功重试', async () => {
  let count = 0;
  const loader = createHeroLoader({ fetchImpl: async () => ++count === 1
    ? { ok: false, status: 404 } : ok(fixture()) });
  assert.match((await loader.load()).message, /HTTP 404/);
  const result = await loader.load();
  assert.equal(result.status, 'ready');
  assert.equal(result.data.byId.size, 133);
});

test('非法JSON及网络异常返回可展示错误', async () => {
  const invalid = createHeroLoader({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('JSON解析失败'); } }) });
  assert.equal((await invalid.load()).status, 'error');
  const network = createHeroLoader({ fetchImpl: async () => { throw new Error('本地连接中断'); } });
  assert.match((await network.load()).message, /本地连接中断/);
});

test('重试成功后，旧响应即使忽略abort也只能返回stale', async () => {
  let resolveOld;
  let oldSignal;
  let calls = 0;
  const loader = createHeroLoader({ fetchImpl: (_url, options) => {
    if (++calls === 1) {
      oldSignal = options.signal;
      return new Promise(resolve => { resolveOld = resolve; });
    }
    return Promise.resolve(ok(fixture()));
  } });
  const oldLoad = loader.load();
  const latest = await loader.load();
  assert.equal(latest.status, 'ready');
  assert.equal(oldSignal.aborted, true);
  resolveOld(ok(fixture()));
  assert.equal((await oldLoad).status, 'stale');
});

test('过期错误不能覆盖新成功；dispose令未完成请求失效', async () => {
  let rejectOld;
  let count = 0;
  const loader = createHeroLoader({ fetchImpl: () => ++count === 1
    ? new Promise((_resolve, reject) => { rejectOld = reject; }) : Promise.resolve(ok(fixture())) });
  const pending = loader.load();
  assert.equal((await loader.load()).status, 'ready');
  rejectOld(new Error('过期错误'));
  assert.equal((await pending).status, 'stale');
  let resolvePending;
  const disposed = createHeroLoader({ fetchImpl: () => new Promise(resolve => { resolvePending = resolve; }) });
  const loading = disposed.load();
  disposed.dispose();
  resolvePending(ok(fixture()));
  assert.equal((await loading).status, 'stale');
});
