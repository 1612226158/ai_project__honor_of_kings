import { TEAM_NAMES } from './config.js';
import { createPosterModel } from './presentation.js';

/** Result-only view: loads the ten confirmed covers, cancels old image callbacks on reset. */
export function createPosterView(root, heroes, controller, display = {}) {
  const abort = new AbortController();
  const cards = new Map();
  let key = null, generation = 0, disposed = false;
  for (const team of ['blue', 'red']) {
    const list = root.querySelector(`#poster-${team}-cards`);
    list.replaceChildren();
    for (let slot = 1; slot <= 5; slot++) {
      const li = document.createElement('li');
      li.className = `poster-card ${team}`; li.dataset.seatId = `${team}-${slot}`;
      li.innerHTML = '<div class="poster-image-fallback">正在准备立绘</div><img class="poster-cover" alt="" decoding="async"><span class="poster-proficiency" hidden><img alt=""></span><span class="poster-you" hidden>你</span><div class="poster-card-info"><h3></h3><p class="poster-nickname"></p><div class="poster-card-loadout"><span class="poster-lanes"></span><span class="poster-skill"><img alt=""><span class="sr-only"></span></span></div></div>';
      list.append(li); cards.set(`${team}-${slot}`, li);
    }
  }

  function clear() {
    generation++; key = null;
    for (const li of cards.values()) {
      for (const img of li.querySelectorAll('img')) { img.onload = null; img.onerror = null; img.removeAttribute('src'); }
      li.dataset.imageStatus = 'empty';
    }
  }

  function render(state) {
    if (state.phase !== 'poster') { if (key !== null) clear(); return; }
    const snapshot = state.resultSnapshot;
    if (key === snapshot) return;
    clear(); key = snapshot;
    const token = generation;
    let model;
    try { model = createPosterModel(snapshot, heroes, display); }
    catch {
      root.querySelector('#poster-status').textContent = '阵容暂时无法展示，请重新开始。';
      return;
    }
    root.querySelector('#poster-status').textContent = '双方阵容已确认';
    root.querySelector('#poster-identity').textContent = `你：${TEAM_NAMES[model.humanSeat.team]}${model.humanSeat.slot}号`;
    for (const card of [...model.teams.blue, ...model.teams.red]) {
      const li = cards.get(card.seatId);
      li.dataset.human = card.isHuman; li.dataset.heroId = card.heroId; li.dataset.imageStatus = 'loading';
      li.setAttribute('aria-label', `${TEAM_NAMES[card.team]}${card.slot}号${card.isHuman ? '，你' : ''}，${card.heroName}，${card.nickname}`);
      li.querySelector('h3').textContent = card.heroName;
      li.querySelector('h3').title = card.heroName;
      li.querySelector('h3').dataset.long = card.heroName.length >= 8;
      li.querySelector('.poster-nickname').textContent = card.nickname;
      li.querySelector('.poster-nickname').title = card.nickname;
      li.querySelector('.poster-you').hidden = !card.isHuman;
      const fallback = li.querySelector('.poster-image-fallback'); fallback.textContent = '正在准备立绘';
      const cover = li.querySelector('.poster-cover');
      cover.hidden = false; cover.alt = `${card.heroName}立绘`; cover.style.objectPosition = card.objectPosition;
      cover.onload = () => { if (!disposed && token === generation) li.dataset.imageStatus = 'ready'; };
      cover.onerror = () => {
        if (disposed || token !== generation) return;
        li.dataset.imageStatus = 'failed'; cover.hidden = true; fallback.textContent = '立绘暂不可用';
      };
      cover.src = card.cover;
      const skill = li.querySelector('.poster-skill');
      skill.querySelector('img').src = card.skill.image; skill.querySelector('img').alt = `技能：${card.skill.name}`;
      skill.querySelector('span').textContent = card.skill.name;
      skill.title = `技能：${card.skill.name}`;
      const lanes = li.querySelector('.poster-lanes');
      lanes.replaceChildren();
      lanes.title = `本局分路：${card.lane.name}`;
      const laneImage = document.createElement('img');
      laneImage.src = card.lane.image; laneImage.alt = `本局分路：${card.lane.name}`;
      lanes.append(laneImage);
      const proficiency = li.querySelector('.poster-proficiency');
      proficiency.hidden = !card.proficiency;
      if (card.proficiency) {
        proficiency.querySelector('img').src = card.proficiency.corner;
        proficiency.querySelector('img').alt = `熟练度：${card.proficiency.name}`;
        proficiency.title = `熟练度：${card.proficiency.name}`;
      } else { proficiency.querySelector('img').removeAttribute('src'); proficiency.querySelector('img').alt = ''; proficiency.removeAttribute('title'); }
    }
  }

  root.querySelector('#poster-reset').addEventListener('click', () => controller.reset(), { signal: abort.signal });
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  return { dispose() { disposed = true; abort.abort(); unsubscribe(); clear(); } };
}
