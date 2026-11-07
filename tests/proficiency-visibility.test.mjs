import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleProficiency } from '../js/draft-view.js';

test('准备、禁用、选人和确认阶段，双方熟练度均不展示', () => {
  for (const phase of ['ready', 'ban', 'pick', 'review', 'error']) {
    for (const team of ['blue', 'red']) {
      assert.equal(getVisibleProficiency({ phase, humanSeat: { team: 'blue' } }, {
        team, proficiencyId: 'master',
      }), null);
    }
  }
});

for (const team of ['blue', 'red']) {
  test(`用户${team}方：加载结果仅本人/队友可见熟练度，对手不展示`, () => {
    const state = { phase: 'poster', humanSeat: { id: `${team}-3`, team } };
    for (const id of [1, 3, 5]) {
      assert.equal(getVisibleProficiency(state, { id: `${team}-${id}`, team, proficiencyId: 'mythic' }).name, '神话');
    }
    assert.equal(getVisibleProficiency(state, { team: team === 'blue' ? 'red' : 'blue', proficiencyId: 'pinnacle' }), null);
  });
}

test('缺失或未知熟练度不伪造默认等级', () => {
  const state = { phase: 'poster', humanSeat: { team: 'blue' } };
  for (const proficiencyId of [null, undefined, 'unknown']) {
    assert.equal(getVisibleProficiency(state, { team: 'blue', proficiencyId }), null);
  }
});
