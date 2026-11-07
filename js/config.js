export const EXPECTED_HERO_COUNT = 133;
export const PICK_TIME_MS = 20_000;
export const BAN_TIME_MS = 20_000;
export const AUTO_THINK_DELAYS_MS = Object.freeze([1000, 2000, 3000, 4000, 5000]);
export const DEFAULT_SKILL_ID = 'flash';
export const HERO_CATEGORIES = Object.freeze(['全部', '坦克', '战士', '刺客', '法师', '射手', '辅助']);
export const TEAM_NAMES = Object.freeze({ blue: '蓝方', red: '红方' });
export const LANES = Object.freeze([
  ['farm', '发育路'], ['mid', '中路'], ['clash', '对抗路'],
  ['jungle', '打野'], ['roam', '游走'], ['fill', '全能补位'],
].map(([id, name]) => Object.freeze({ id, name })));
export const MATCH_LANES = Object.freeze(LANES.filter(lane => lane.id !== 'fill'));

const seat = (team, slot) => Object.freeze({ id: `${team}-${slot}`, team, slot });
export const SEATS = Object.freeze(['blue', 'red'].flatMap(team =>
  Array.from({ length: 5 }, (_, index) => seat(team, index + 1))));
const bySeatId = new Map(SEATS.map(item => [item.id, item]));
export const BAN_ORDER = Object.freeze(Array.from({ length: 5 }, (_, index) =>
  ['blue', 'red'].map(team => bySeatId.get(`${team}-${index + 1}`))).flat());
export const PICK_GROUPS = Object.freeze([
  ['blue-1'], ['red-1', 'red-2'], ['blue-2', 'blue-3'],
  ['red-3', 'red-4'], ['blue-4', 'blue-5'], ['red-5'],
].map(group => Object.freeze(group.map(id => bySeatId.get(id)))));
export const PICK_ORDER = Object.freeze(PICK_GROUPS.flat());

export const SKILLS = Object.freeze([
  ['flash', '闪现'], ['smite', '惩击'], ['execute', '终结'], ['frenzy', '狂暴'],
  ['sprint', '疾跑'], ['heal', '治疗术'], ['disrupt', '干扰'], ['stun', '晕眩'],
  ['purify', '净化'], ['weaken', '弱化'],
].map(([id, name]) => Object.freeze({ id, name, image: `assets/skills/${id}.png` })));

export const PROFICIENCIES = Object.freeze([
  ['novice', '见习'], ['experienced', '资深'], ['elite', '精英'], ['master', '宗师'],
  ['legend', '传说'], ['transcendent', '超凡'], ['mythic', '神话'], ['pinnacle', '巅峰'],
].map(([id, name]) => Object.freeze({ id, name,
  small: `assets/proficiency/${id}-small.png`,
  large: `assets/proficiency/${id}-large.png`,
  corner: `assets/proficiency/${id}-corner.svg`,
})));
