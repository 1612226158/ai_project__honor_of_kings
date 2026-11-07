import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDraftController } from '../js/draft-controller.js';
import { getBannedIds, getPickedIds, isHumanTurn } from '../js/state.js';
import { turnDueAt } from '../js/timer.js';
import { createPosterModel, getVisibleSkill, getVisibleProficiency } from '../js/presentation.js';
import { loadHeroDisplay, validateHeroDisplay, DEFAULT_HERO_DISPLAY } from '../js/hero-display.js';
import { fakeClock } from './helpers/fake-clock.mjs';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;
const config = JSON.parse(await readFile(new URL('../data/hero-display.json', import.meta.url), 'utf8'));
test('海报仅展示快照的玩家本局分路，不随英雄推荐分路变化', () => {
  const snapshot = confirmed(0);
  const input = structuredClone(heroes);
  const first = input.find(hero => hero.id === snapshot.teams.blue[0].heroId);
  first.lanes = ['中路', '游走', '打野', '中路'];
  const enemy = input.find(hero => hero.id === snapshot.teams.red[0].heroId);
  enemy.lanes = [];
  const model = createPosterModel(snapshot, input);
  assert.equal(model.teams.blue[0].lane.id, snapshot.teams.blue[0].laneId);
  assert.equal(model.teams.red[0].lane.id, snapshot.teams.red[0].laneId);
  assert.equal(first.lanes.length, 4);
  assert.throws(() => { model.teams.blue[0].lane.name = '另一条路'; }, TypeError);
  for (const team of ['blue', 'red']) for (const card of model.teams[team]) {
    assert.equal(card.lane.image, `assets/lanes/${team}-${card.lane.id}.svg`);
    assert.equal(card.lanes, undefined);
  }
});

test('133位英雄推荐分路均有红蓝正式图标，8档熟练度均有独立贴角资源', async () => {
  const { LANES, PROFICIENCIES } = await import('../js/config.js');
  const names = new Set(LANES.map(lane => lane.name));
  assert.ok(heroes.every(hero => hero.lanes.every(name => names.has(name))));
  for (const team of ['blue', 'red']) for (const lane of LANES) {
    const svg = await readFile(new URL(`../assets/lanes/${team}-${lane.id}.svg`, import.meta.url), 'utf8');
    assert.ok(svg.includes('data:image/png;base64,') && svg.includes('clip-path'));
  }
  for (const proficiency of PROFICIENCIES) {
    assert.notEqual(proficiency.corner, proficiency.large);
    const svg = await readFile(new URL(`../${proficiency.corner}`, import.meta.url), 'utf8');
    assert.ok(svg.includes('viewBox=') && svg.includes('data:image/png;base64,'));
  }
});
for (const team of ['blue', 'red']) test(`${team}方视角：加载前隐藏敌方技能，加载后公开技能但保留敌方熟练度隐藏`, () => {
  const humanSeat = { team };
  for (const phase of ['ready', 'ban', 'pick', 'review', 'poster']) {
    for (const playerTeam of ['blue', 'red']) {
      const player = { team: playerTeam, skillId: 'flash', proficiencyId: 'novice' };
      const state = { phase, humanSeat };
      assert.equal(Boolean(getVisibleSkill(state, player)), phase === 'poster' || playerTeam === team);
      assert.equal(Boolean(getVisibleProficiency(state, player)), phase === 'poster' && playerTeam === team);
    }
  }
});
function confirmed(seatIndex = 0, skipBan = false) {
  let first = true;
  const clock = fakeClock();
  const controller = createDraftController(heroes, { ...clock, rng: () => {
    if (first) { first = false; return (seatIndex + .5) / 10; } return 0;
  } });
  controller.start();
  for (let n=0; ['ban','pick'].includes(controller.getState().phase); n++) {
    assert.ok(n<40);
    const state=controller.getState();
    if (isHumanTurn(state)) {
      if (skipBan && state.phase==='ban') clock.advance(20000);
      else {
        const hero=heroes.find(h=>!getBannedIds(state).has(h.id)&&!getPickedIds(state).has(h.id));
        controller.select(hero.id); controller.commit({ confirmOffLane: true });
      }
    } else clock.advance(turnDueAt(state)-clock.now());
  }
  controller.setSkill('heal'); controller.confirm();
  const snapshot=controller.getState().resultSnapshot;
  controller.dispose(); return snapshot;
}

for (const index of [0, 7]) test(`海报按确认快照排列5+5，用户座位索引${index}仅同队熟练度可见`,()=>{
  const snapshot=confirmed(index);
  const before=JSON.stringify(snapshot);
  const model=createPosterModel(snapshot,heroes,validateHeroDisplay(config,heroes.map(h=>h.id)));
  assert.deepEqual(model.teams.blue.map(c=>c.seatId),['blue-1','blue-2','blue-3','blue-4','blue-5']);
  assert.deepEqual(model.teams.red.map(c=>c.seatId),['red-1','red-2','red-3','red-4','red-5']);
  const cards=[...model.teams.blue,...model.teams.red];
  assert.equal(new Set(cards.map(c=>c.heroId)).size,10);
  assert.equal(cards.filter(c=>c.isHuman).length,1);
  assert.equal(cards.filter(c=>c.proficiency).length,5);
  assert.ok(cards.every(c=>Boolean(c.proficiency)===(c.team===snapshot.humanSeat.team)));
  assert.equal(cards.find(c=>c.isHuman).skill.id,'heal');
  for(const card of cards) {
    const player=snapshot.teams[card.team][card.slot-1];
    assert.equal(card.heroId,player.heroId);assert.equal(card.skill.id,player.skillId);
    assert.equal(card.cover,heroes.find(h=>h.id===player.heroId).images.cover);
  }
  assert.equal(JSON.stringify(snapshot),before);
  assert.throws(()=>{model.teams.blue[0].heroId=999;},TypeError);
});

test('空ban记录不影响海报，无焦点配置时回退中心',()=>{
  const snapshot=confirmed(5,true);
  assert.equal(snapshot.bans.filter(b=>b.heroId===null).length,1);
  const model=createPosterModel(snapshot,heroes);
  assert.ok([...model.teams.blue,...model.teams.red].every(c=>c.objectPosition==='50% 50%'));
});

test('海报拒绝不存在英雄、重复英雄、缺人及乱序阵容',()=>{
  const snapshot=confirmed();
  for(const mutate of [s=>s.teams.blue.pop(),s=>s.teams.red[0].heroId=-1,
    s=>s.teams.red[0].heroId=s.teams.blue[0].heroId,s=>s.teams.blue.reverse()]){
    const invalid=structuredClone(snapshot);mutate(invalid);
    assert.throws(()=>createPosterModel(invalid,heroes),TypeError);
  }
  assert.throws(()=>createPosterModel(null,heroes),TypeError);
});

test('133位正式焦点完整，边界合法，未知ID与越界配置被拒绝',()=>{
  const parsed=validateHeroDisplay(config,heroes.map(h=>h.id));
  assert.equal(Object.keys(parsed.heroes).length,133);
  for(const point of Object.values(parsed.heroes))assert.ok(point.x>=0&&point.x<=100&&point.y>=0&&point.y<=100);
  for(const invalid of [ {...config,version:0}, {...config,heroes:{999999:{x:50,y:50}}},
    {...config,defaults:{x:101,y:50}}, {...config,heroes:{105:{x:-1,y:50}}}]){
    assert.throws(()=>validateHeroDisplay(invalid,heroes.map(h=>h.id)),TypeError);
  }
});

test('焦点文件缺失、网络或JSON失败均回退中心，不阻塞海报',async()=>{
  for(const fetcher of [async()=>({ok:false}),async()=>{throw Error('offline');},
    async()=>({ok:true,json:async()=>{throw Error('bad json');}})]){
    assert.equal(await loadHeroDisplay(heroes.map(h=>h.id),{fetcher}),DEFAULT_HERO_DISPLAY);
  }
  const valid=await loadHeroDisplay(heroes.map(h=>h.id),{fetcher:async()=>({ok:true,json:async()=>config})});
  assert.equal(Object.keys(valid.heroes).length,133);
});
