import { PROFICIENCIES, SKILLS, MATCH_LANES } from './config.js';

export function getVisibleSkill(state, player) {
  if (state.phase !== 'poster' && player.team !== state.humanSeat.team) return null;
  return SKILLS.find(item => item.id === player.skillId) ?? null;
}

export function getVisibleProficiency(state, player) {
  if (state.phase !== 'poster' || player.team !== state.humanSeat.team) return null;
  return PROFICIENCIES.find(item => item.id === player.proficiencyId) ?? null;
}

/** Build a read-only presentation from the confirmed snapshot, never from new random draws. */
export function createPosterModel(snapshot, heroes, display = {}) {
  if (!snapshot?.humanSeat || !snapshot.teams) throw new TypeError('缺少已确认的阵容。');
  const byId = new Map(heroes.map(hero => [hero.id, hero]));
  const seen = new Set();
  const teams = {};
  for (const team of ['blue', 'red']) {
    if (snapshot.teams[team]?.length !== 5) throw new TypeError('每队需要五位英雄。');
    if (new Set(snapshot.teams[team].map(player => player.laneId)).size !== 5) throw new TypeError('每队本局分路必须各不相同。');
    teams[team] = Object.freeze(snapshot.teams[team].map((player, index) => {
      const hero = byId.get(player.heroId);
      const skill = SKILLS.find(item => item.id === player.skillId);
      const lane = MATCH_LANES.find(item => item.id === player.laneId);
      if (player.id !== `${team}-${index + 1}` || player.team !== team || !hero || !skill || !lane || seen.has(hero.id)) {
        throw new TypeError('已确认的阵容不完整或有冲突。');
      }
      seen.add(hero.id);
      const point = display.heroes?.[hero.id] ?? display.defaults ?? { x: 50, y: 50 };
      const percent = value => Number.isFinite(value) && value >= 0 && value <= 100 ? value : 50;
      return Object.freeze({ seatId: player.id, team, slot: index + 1,
        isHuman: player.id === snapshot.humanSeat.id, nickname: player.nickname,
        heroId: hero.id, heroName: hero.name, cover: hero.images.cover, skill,
        lane: Object.freeze({ ...lane, image: `assets/lanes/${team}-${lane.id}.svg` }),
        proficiency: getVisibleProficiency({ phase: 'poster', humanSeat: snapshot.humanSeat }, player),
        objectPosition: `${percent(point.x)}% ${percent(point.y)}%`,
      });
    }));
  }
  return Object.freeze({ matchId: snapshot.matchId, humanSeat: Object.freeze({ ...snapshot.humanSeat }),
    teams: Object.freeze(teams) });
}
