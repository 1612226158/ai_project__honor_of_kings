import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SEATS, PICK_GROUPS } from '../js/config.js';
import { createDraftController } from '../js/draft-controller.js';
import { createDraftRules, getActiveSeats, getPickedIds, getBannedIds, getPlayer, isHumanTurn, getPermissions, heroFitsLane } from '../js/state.js';
import { turnDueAt } from '../js/timer.js';
import { describeDraft } from '../js/draft-view.js';
import { fakeClock } from './helpers/fake-clock.mjs';

const heroes = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8')).heroes;
function setup(seatId = 'red-2', nextRandom = () => 0) {
  const clock = fakeClock();
  let first = true;
  const rng = () => {
    if (first) { first = false; return (SEATS.findIndex(seat => seat.id === seatId) + .5) / 10; }
    return nextRandom();
  };
  return { clock, controller: createDraftController(heroes, { ...clock, rng }) };
}
const legal = state => heroes.filter(hero => !getBannedIds(state).has(hero.id) && !getPickedIds(state).has(hero.id));
function lock(controller, id = legal(controller.getState())[0].id) {
  assert.equal(controller.select(id).ok, true);
  assert.equal(controller.commit({ confirmOffLane: true }).ok, true);
}
function reachGroup(controller, clock, groupIndex = 1) {
  assert.equal(controller.start().ok, true);
  let steps = 0;
  while (controller.getState().phase === 'ban' || controller.getState().phase === 'pick' && controller.getState().turnIndex < groupIndex) {
    assert.ok(++steps < 60);
    if (isHumanTurn(controller.getState())) lock(controller);
    else clock.advance(Math.max(0, turnDueAt(controller.getState()) - clock.now()));
  }
  assert.equal(controller.getState().phase, 'pick');
  assert.equal(controller.getState().turnIndex, groupIndex);
}

test('选人分成1-2-2-2-2-1六组，组内顺序不限制个人先锁定', () => {
  assert.deepEqual(PICK_GROUPS.map(group => group.map(seat => seat.id)), [
    ['blue-1'], ['red-1','red-2'], ['blue-2','blue-3'], ['red-3','red-4'], ['blue-4','blue-5'], ['red-5'],
  ]);
  const { controller, clock } = setup();
  reachGroup(controller, clock);
  const before = controller.getState();
  assert.deepEqual(getActiveSeats(before).map(seat => seat.id), ['red-1', 'red-2']);
  assert.equal(getPermissions(before).canSelectHero, true);
  lock(controller);
  const after = controller.getState();
  assert.ok(getPlayer(after, 'red-2').heroId);
  assert.equal(getPlayer(after, 'red-1').heroId, null);
  assert.equal(after.turnIndex, 1);
  assert.equal(after.deadline, before.deadline);
  assert.deepEqual(getActiveSeats(after).map(seat => seat.id), ['red-1']);
  assert.equal(describeDraft(after).title, '等待队友锁定');
  assert.equal(controller.commit({ confirmOffLane: true }).code, 'FORBIDDEN');
  clock.advance(1000);
  assert.equal(controller.getState().turnIndex, 2);
  assert.equal(controller.getState().deadline, clock.now() + 20000);
  controller.dispose();
});

test('队友锁定保留本人预选、剩余时间与技能弹层；旧提交令牌失效', () => {
  const { controller, clock } = setup('red-1');
  reachGroup(controller, clock);
  const before = controller.getState();
  const candidate = legal(before).at(-1).id;
  controller.select(candidate);
  const events = [];
  controller.subscribe((_state, meta) => events.push(meta));
  clock.advance(1000);
  const state = controller.getState();
  assert.equal(state.candidateId, candidate);
  assert.equal(state.deadline, before.deadline);
  assert.equal(controller.getRemainingSeconds(), 19);
  assert.equal(isHumanTurn(state), true);
  assert.equal(getPermissions(state).canCommitHero, true);
  assert.equal(events.find(meta => meta.action === 'AUTO_HERO').closeTransientUi, false);
  const rules = createDraftRules(heroes);
  assert.equal(rules.dispatch(state, {type:'COMMIT_HERO', actor:'human', seatId:'red-1',
    matchId:before.matchId, turnToken:before.turnToken},clock.now()).code, 'STALE_ACTION');
  lock(controller, candidate);
  assert.equal(getPlayer(controller.getState(),'red-1').heroId,candidate);
  controller.dispose();
});

test('队友先锁定本人预选英雄时清空候选并提示，重新选择后依然全局唯一', () => {
  const { controller, clock } = setup();
  reachGroup(controller, clock);
  const candidate = legal(controller.getState()).find(hero => heroFitsLane(hero, getPlayer(controller.getState(), 'red-1').laneId)).id;
  controller.select(candidate);
  clock.advance(1000);
  const state = controller.getState();
  assert.equal(getPlayer(state,'red-1').heroId,candidate);
  assert.equal(state.candidateId,null);
  assert.equal(state.notice.type,'candidate-taken');
  assert.match(describeDraft(state).hint,/队友已锁定.*请重新选择/);
  assert.equal(getPermissions(state).canCommitHero,false);
  assert.equal(controller.select(candidate).code,'HERO_UNAVAILABLE');
  assert.equal(controller.select(legal(state)[0].id).ok,true);
  assert.equal(controller.getState().notice,null);
  lock(controller);
  assert.equal(getPickedIds(controller.getState()).size,3);
  assert.notEqual(getPlayer(controller.getState(),'red-2').heroId,candidate);
  controller.dispose();
});

test('两个机器人同一毫秒完成思考，依次原子锁定不同英雄，全部完成才换组', () => {
  const { controller, clock } = setup('red-5');
  reachGroup(controller, clock);
  const before = controller.getState();
  const observations=[];
  controller.subscribe(state => observations.push(state));
  clock.advance(999);
  assert.equal(getPickedIds(controller.getState()).size,1);
  clock.advance(1);
  const halfway=observations.find(state=>getPickedIds(state).size===2);
  assert.equal(halfway.turnIndex,1);
  assert.equal(halfway.deadline,before.deadline);
  assert.equal(getActiveSeats(halfway).length,1);
  const after=controller.getState();
  assert.equal(after.turnIndex,2);
  assert.equal(getPickedIds(after).size,3);
  assert.notEqual(getPlayer(after,'red-1').heroId,getPlayer(after,'red-2').heroId);
  assert.equal(clock.count(),1);
  controller.dispose();
});

test('同组机器人独立抽取1秒和5秒，不因浏览、技能修改或队友锁定重抽', () => {
  let flip=false;
  const { controller, clock } = setup('red-5',()=>{flip=!flip;return flip?0:.99;});
  reachGroup(controller,clock);
  const before=controller.getState();
  const times=Object.values(before.autoActionAt).sort((a,b)=>a-b);
  assert.deepEqual(times,[clock.now()+1000,clock.now()+5000]);
  const original={...before.autoActionAt};
  controller.setFilter('法师'); controller.setSkill('heal');
  assert.deepEqual(controller.getState().autoActionAt,original);
  clock.advance(1000);
  assert.equal(getPickedIds(controller.getState()).size,2);
  assert.equal(controller.getState().turnIndex,1);
  assert.equal(controller.getState().deadline,before.deadline);
  assert.deepEqual(Object.values(controller.getState().autoActionAt),[times[1]]);
  clock.advance(3999);
  assert.equal(getPickedIds(controller.getState()).size,2);
  clock.advance(1);
  assert.equal(getPickedIds(controller.getState()).size,3);
  assert.equal(controller.getState().turnIndex,2);
  controller.dispose();
});

for (let delay=1;delay<=5;delay++) {
  test(`机器人思考${delay}秒：边界前不提交，边界到达提交；思考查询不改变计划`,()=>{
    const {controller,clock}=setup('red-5',()=> (delay-.5)/5);
    controller.start();
    assert.equal(controller.getState().autoActionAt['blue-1'],delay*1000);
    controller.setFilter('战士');
    assert.equal(controller.getState().autoActionAt['blue-1'],delay*1000);
    clock.advance(delay*1000-1);
    assert.equal(controller.getState().bans.length,0);
    clock.advance(1);
    assert.equal(controller.getState().bans.length,1);
    controller.dispose();
  });
}

test('队友1秒锁定后，本人19.9秒仍可手动锁定，20秒截止没有被延后',()=>{
  const {controller,clock}=setup();
  reachGroup(controller,clock);
  const deadline=controller.getState().deadline;
  clock.advance(19900);
  assert.equal(controller.getState().deadline,deadline);
  assert.equal(controller.getRemainingSeconds(),1);
  lock(controller);
  assert.equal(getPlayer(controller.getState(),'red-2').lockedSource,'manual');
  controller.dispose();
});

test('双人组20秒边界只超时本人，已锁定队友、技能与熟练度保持',()=>{
  const {controller,clock}=setup();
  reachGroup(controller,clock);
  controller.setSkill('heal');
  clock.advance(1000);
  const teammate=getPlayer(controller.getState(),'red-1');
  const saved=structuredClone(teammate);
  const oldCallback=clock.pending()[0].id;
  clock.advance(19000);
  const state=controller.getState();
  assert.equal(getPlayer(state,'red-2').lockedSource,'timeout');
  assert.equal(getPlayer(state,'red-2').skillId,'heal');
  assert.deepEqual(getPlayer(state,'red-1'),saved);
  assert.equal(getPickedIds(state).size,3);
  clock.fire(oldCallback);
  assert.equal(controller.getState(),state);
  controller.dispose();
});

test('后台恢复结算当前组两位到期玩家，再开新组，不吞掉未来组的思考时间',()=>{
  const {controller,clock}=setup();
  reachGroup(controller,clock);
  const old=clock.pending()[0].id;
  controller.suspend();clock.jump(60000);controller.resume();clock.advance(0);
  const state=controller.getState();
  assert.equal(state.turnIndex,2);
  assert.equal(getPlayer(state,'red-1').lockedSource,'timeout');
  assert.equal(getPlayer(state,'red-2').lockedSource,'timeout');
  assert.equal(getPickedIds(state).size,3);
  assert.equal(state.deadline,clock.now()+20000);
  assert.ok(Object.values(state.autoActionAt).every(at=>at>=clock.now()+1000));
  clock.fire(old);
  assert.equal(controller.getState(),state);
  controller.dispose();
});

test('双人组中途重置清除两份行动时间，旧回调不能修改新轮',()=>{
  const {controller,clock}=setup('red-5');
  reachGroup(controller,clock);
  const old=clock.pending()[0].id;
  const previous=controller.getState();
  controller.reset();
  const fresh=controller.getState();
  assert.equal(fresh.matchId,previous.matchId+1);
  assert.deepEqual(fresh.autoActionAt,{});
  clock.jump(60000);clock.fire(old);
  assert.equal(controller.getState(),fresh);
  assert.equal(clock.count(),0);
  controller.dispose();
});

test('下一双人组思考随机失败时事务回滚，不留下半锁定的本人英雄',()=>{
  const {controller,clock}=setup('blue-1');
  reachGroup(controller,clock,0);
  controller.select(legal(controller.getState())[0].id);
  const before=controller.getState();
  let calls=0;
  const rules=createDraftRules(heroes,{rng:()=>++calls===1?0:NaN});
  const result=rules.dispatch(before,{type:'COMMIT_HERO',actor:'human',seatId:'blue-1',
    matchId:before.matchId,turnToken:before.turnToken},clock.now());
  assert.equal(result.code,'RANDOM_ERROR');
  assert.equal(result.state,before);
  assert.equal(getPickedIds(result.state).size,0);
  assert.equal(getPlayer(result.state,'blue-1').proficiencyId,null);
  controller.dispose();
});

test('10个用户位置在非固定思考时间下完成并组选人、手动/超时、确认和重置',()=>{
  for (const [index,seat] of SEATS.entries()) {
    let seed=index+1;
    const {controller,clock}=setup(seat.id,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
    const groupIndex=PICK_GROUPS.findIndex(group=>group.some(item=>item.id===seat.id));
    reachGroup(controller,clock,groupIndex);
    controller.setSkill('heal');
    if (index%2) clock.advance(20000);
    else { clock.advance(19900); lock(controller); }
    let steps=0;
    while (controller.getState().phase==='pick') {
      assert.ok(++steps<20);
      clock.advance(Math.max(0,turnDueAt(controller.getState())-clock.now()));
    }
    const state=controller.getState();
    assert.equal(state.phase,'review',seat.id);
    assert.equal(state.bans.filter(ban=>ban.source==='manual').length,1);
    assert.equal(getPickedIds(state).size,10);
    assert.equal(getBannedIds(state).size,10);
    assert.ok([...getPickedIds(state)].every(id=>!getBannedIds(state).has(id)));
    assert.equal(getPlayer(state,seat.id).lockedSource,index%2?'timeout':'manual');
    assert.equal(controller.confirm().ok,true);
    assert.equal(getPlayer(controller.getState(),seat.id).skillId,'heal');
    assert.equal(controller.reset().ok,true);
    assert.equal(clock.count(),0);
    controller.dispose();
  }
});
