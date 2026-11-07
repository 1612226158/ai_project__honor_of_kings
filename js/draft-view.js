import { SEATS, HERO_CATEGORIES, TEAM_NAMES, SKILLS, PICK_GROUPS } from './config.js';
import { getCurrentSeat, getTurnSeats, getActiveSeats, getPlayer, getPermissions, getBannedIds, getPickedIds, filterHeroes, isHumanTurn, getLane } from './state.js';
import { getVisibleProficiency, getVisibleSkill } from './presentation.js';
export { getVisibleProficiency } from './presentation.js';

const helmet = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M14 26 20 12l12-6 12 6 6 14-5 4v20l-9 8V40h-8v18l-9-8V30z"/><path fill="#102947" d="m22 23 10-7 10 7-5 5H27z"/></svg>';
const seatName = seat => `${TEAM_NAMES[seat.team]}${seat.slot}号`;

export function describeDraft(state) {
  const current = getCurrentSeat(state);
  const own = isHumanTurn(state);
  if (state.phase === 'ban') return { title: own ? '请禁用英雄' : '等待其他玩家禁用',
    caption: `禁用阶段 · ${state.turnIndex + 1} / 10`,
    detail: `${seatName(current)}${own ? '（你）' : ''}正在禁用 · 20秒未确认则留空`,
    button: own ? '确认禁用' : '等待禁用', hint: own ? '20秒内确认禁用 · 超时ban位留空' : `${seatName(current)}正在操作` };
  if (state.phase === 'pick') {
    const group = getTurnSeats(state);
    const waiting = group.some(seat => seat.id === state.humanSeat.id) && !own;
    return { title: own ? '请选择英雄' : waiting ? '等待队友锁定' : '等待其他玩家选择',
      caption: `选择阶段 · 第${state.turnIndex + 1} / ${PICK_GROUPS.length}组 · 已锁定${getPickedIds(state).size} / 10`,
      detail: group.map(seat => `${seatName(seat)}${seat.id === state.humanSeat.id ? '（你）' : ''}${getPlayer(state, seat.id).heroId === null ? '选择中' : '已锁定'}`).join(' · '),
      button: own ? '锁定' : waiting ? '等待队友' : '等待选择',
      hint: state.notice?.type === 'candidate-taken' ? state.notice.message : own ? '同组同时选择 · 20秒内锁定' : '同组全部锁定后进入下一组' };
  }
  return {
    ready: { title: '英雄集结', caption: '5V5 征召对战', detail: '双方各选五位英雄，开启本轮征召', button: '开始禁选', hint: '先禁用 · 再选择' },
    review: { title: '阵容已就绪', caption: '选择完成 · 10 / 10', detail: '双方英雄已锁定，请确认队伍', button: '确认队伍', hint: '确认前可调整自己的技能' },
    poster: { title: '队伍已确认', caption: '本轮阵容', detail: '本轮选择已完成', button: '重新开始', hint: '开启新一轮征召' },
    error: { title: '本轮已停止', caption: '请重新开始', detail: state.error?.message ?? '禁选流程发生异常', button: '重新开始', hint: '' },
  }[state.phase];
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setImage(img, path) {
  img.hidden = !path;
  if (!path) { img.onerror = null; delete img.dataset.imagePath; img.removeAttribute('src'); img.classList.remove('image-failed'); return; }
  // A failed path stays a placeholder until the represented asset changes.
  if (img.dataset.imagePath === path) return;
  img.dataset.imagePath = path;
  img.classList.remove('image-failed');
  img.onerror = () => {
    if (img.dataset.imagePath !== path) return;
    img.onerror = null; img.removeAttribute('src'); img.classList.add('image-failed');
  };
  img.src = path;
}

/** 持久节点只更新状态；对局计时和随机仅由controller负责。 */
export function createDraftView(root, heroes, controller, {
  prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
} = {}) {
  const query = selector => root.querySelector(selector);
  const byId = new Map(heroes.map(hero => [hero.id, hero]));
  const abort = new AbortController();
  const players = new Map();
  const bans = { red: [], blue: [] };
  const cards = new Map();
  const tabs = new Map();
  const skillChoices = new Map();
  const summaryCards = new Map();
  const dialog = query('#skill-dialog');
  const laneDialog = query('#lane-warning');
  let laneConfirmation = null;
  let draftSkillId = null;
  let returnFocus = null;
  let feedbackHandle = null;
  let feedbackSerial = 0;
  let lastNoticeKey = null;
  let lastMatchId = null;
  let focusedHeroId = null;
  let disposed = false;
  let lastPanelKey = null;
  let poolOpen = false;
  let artKey = null;
  const layerAnimations = new Map();
  let coverArrival = null;

  function reduceMotion() { return prefersReducedMotion(); }

  // Visual exit never delays state/permissions. Re-entry cancels the old exit.
  function showLayer(node, shown, immediate = false) {
    const old = layerAnimations.get(node);
    if (!immediate && (old ? old.shown === shown : node.hidden === !shown)) return;
    const opacity = node.hidden ? 0 : Number(getComputedStyle(node).opacity);
    layerAnimations.delete(node); old?.animation.cancel();
    if (immediate || reduceMotion() || typeof node.animate !== 'function') { node.hidden = !shown; return; }
    node.hidden = false;
    const animation = node.animate([{ opacity }, { opacity: shown ? 1 : 0 }], {
      duration: 240, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both',
    });
    layerAnimations.set(node, { shown, animation });
    animation.onfinish = () => {
      if (layerAnimations.get(node)?.animation !== animation) return;
      layerAnimations.delete(node); node.hidden = !shown; animation.cancel();
    };
  }

  query('#hero-cover').addEventListener('load', () => {
    coverArrival?.cancel(); coverArrival = null;
    if (!disposed && !reduceMotion() && !query('#hero-backdrop').hidden) {
      coverArrival = query('#hero-cover').animate([{ opacity: .35 }, { opacity: 1 }], {
        duration: 280, easing: 'ease-out',
      });
    }
  }, { signal: abort.signal });

  for (const seat of SEATS) {
    const li = element('li', `player-slot ${seat.team}`);
    li.dataset.seatId = seat.id;
    li.innerHTML = '<div class="portrait-frame"><div class="empty-portrait">' + helmet + '</div><img class="portrait-image" alt="" hidden><span class="you-tag" hidden>你</span><span class="seat-number"><b></b></span></div><div class="player-info"><strong class="player-nickname"></strong><span class="player-lane"></span><div class="player-hero-line"><img class="player-skill" alt="" hidden><span class="player-hero"></span></div><span class="player-status"></span></div>';
    li.querySelector('.seat-number b').textContent = seat.slot;
    query(`#${seat.team}-players`).append(li);
    players.set(seat.id, li);
  }
  for (const team of ['red', 'blue']) {
    for (let index = 0; index < 5; index++) {
      const li = element('li', 'ban-slot');
      const img = element('img');
      img.alt = '';
      img.hidden = true;
      li.append(img);
      li.setAttribute('aria-label', `${TEAM_NAMES[team]}第${index + 1}个禁用位，空`);
      query(`#${team}-bans`).append(li);
      bans[team].push(li);
    }
  }
  for (const category of HERO_CATEGORIES) {
    const button = element('button', 'profession-tab', category);
    button.type = 'button';
    button.dataset.category = category;
    query('#profession-tabs').append(button);
    tabs.set(category, button);
  }
  const fragment = document.createDocumentFragment();
  for (const hero of heroes) {
    const li = element('li', 'hero-card');
    const button = element('button', 'hero-option');
    button.type = 'button';
    button.dataset.heroId = hero.id;
    const thumb = element('span', 'hero-thumb');
    const img = element('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    setImage(img, hero.images.avatar);
    const label = element('span', 'hero-state');
    label.hidden = true;
    const laneLabel = element('span', 'hero-lane-label', (hero.lanes ?? []).map(name => name === '对抗路' ? '对抗' : name === '发育路' ? '发育' : name).join('·'));
    thumb.append(img, laneLabel, label);
    button.append(thumb, element('span', 'hero-name', hero.name));
    button.title = `${hero.name} · 推荐分路：${hero.lanes?.join('、') || '暂无资料'}`;
    li.append(button);
    fragment.append(li);
    cards.set(hero.id, { li, button, label });
  }
  query('#hero-grid').append(fragment);
  for (const skill of SKILLS) {
    const button = element('button', 'skill-choice');
    button.type = 'button';
    button.dataset.skillId = skill.id;
    button.setAttribute('aria-label', skill.name);
    const img = element('img'); img.alt = ''; setImage(img, skill.image);
    const mark = element('span', 'skill-choice-mark', '✓'); mark.setAttribute('aria-hidden', 'true');
    button.append(img, element('span', '', skill.name), mark);
    query('#skill-options').append(button);
    skillChoices.set(skill.id, button);
  }

  for (const team of ['blue', 'red']) {
    const section = element('section', `summary-team ${team}`);
    section.append(element('h3', '', `${TEAM_NAMES[team]}阵容`));
    const list = element('ul');
    for (const seat of SEATS.filter(item => item.team === team)) {
      const li = element('li'); li.dataset.seatId = seat.id;
      const label = element('span', 'summary-seat');
      const portrait = element('img', 'summary-portrait'); portrait.alt = '';
      const name = element('span', 'summary-hero-name');
      const loadout = element('span', 'summary-loadout');
      const skill = element('img'); const proficiency = element('img');
      loadout.append(skill, proficiency); li.append(label, portrait, name, loadout); list.append(li);
      summaryCards.set(seat.id, { li, label, portrait, name, skill, proficiency });
    }
    section.append(list); query('#lineup-summary').append(section);
  }

  function hideFeedback() {
    feedbackSerial++;
    clearTimeout(feedbackHandle); feedbackHandle = null;
    query('#draft-feedback').hidden = true;
  }

  function showFeedback(message, tone = 'info') {
    hideFeedback();
    const serial = feedbackSerial;
    const node = query('#draft-feedback');
    node.textContent = message; node.dataset.tone = tone; node.hidden = false;
    query('#announcer').textContent = message;
    feedbackHandle = setTimeout(() => {
      if (!disposed && serial === feedbackSerial) { node.hidden = true; feedbackHandle = null; }
    }, 5000);
  }

  function chooseSkill(id) {
    draftSkillId = id;
    for (const [skillId, button] of skillChoices) {
      button.setAttribute('aria-pressed', String(skillId === id));
      button.tabIndex = skillId === id ? 0 : -1;
    }
    query('#skill-draft-name').textContent = SKILLS.find(skill => skill.id === id).name;
  }

  function closeSkillDialog(restore = true) {
    if (!dialog.open) return;
    dialog.close();
    query('#skill-button').setAttribute('aria-expanded', 'false');
    if (restore) {
      const target = [returnFocus, query('#primary-action'), query('#skill-button'), query('#reset-button')]
        .find(node => node?.isConnected && !node.disabled && !node.closest('[inert]'));
      target?.focus();
    }
    returnFocus = null; draftSkillId = null;
  }

  function openSkillDialog() {
    const state = controller.getState();
    if (!getPermissions(state).canChangeSkill || dialog.open) return;
    returnFocus = document.activeElement;
    chooseSkill(getPlayer(state, state.humanSeat.id).skillId);
    query('#skill-button').setAttribute('aria-expanded', 'true');
    dialog.showModal(); skillChoices.get(draftSkillId).focus();
  }

  function renderClock() {
    const seconds = controller.getRemainingSeconds();
    const clock = query('#turn-time');
    clock.hidden = seconds === null;
    if (seconds !== null) {
      clock.textContent = seconds;
      clock.dataset.urgent = seconds <= 5;
      clock.setAttribute('aria-label', `剩余${seconds}秒`);
    }
    if (laneDialog.open) query('#lane-warning-clock').textContent = `剩余${seconds ?? 0}秒，确认期间倒计时继续。`;
  }

  function closeLaneDialog(restore = true) {
    laneConfirmation = null;
    if (!laneDialog.open) return;
    laneDialog.close();
    if (restore) query('#primary-action').focus();
  }

  function commitHero() {
    const result = controller.commit();
    if (result.code !== 'LANE_CONFIRM_REQUIRED') return;
    const state = controller.getState();
    const hero = byId.get(state.candidateId);
    laneConfirmation = { matchId: state.matchId, turnIndex: state.turnIndex, heroId: state.candidateId };
    query('#lane-warning-description').textContent = `你本局负责${getLane(state.humanSeat.laneId).name}，${hero.name}可能不适合该分路，您确定吗？`;
    laneDialog.showModal(); renderClock(); query('#lane-warning-cancel').focus();
  }

  function renderHeroArt(state, immediate) {
    const player = getPlayer(state, state.humanSeat.id);
    const hero = ['pick', 'review'].includes(state.phase)
      ? byId.get(player.heroId ?? state.candidateId) : null;
    const key = hero ? `${state.matchId}:${hero.id}:${player.heroId === null ? 'preview' : 'locked'}` : null;
    if (key !== artKey) poolOpen = false;
    artKey = key;
    const shown = Boolean(hero) && !poolOpen;
    root.dataset.art = shown;
    showLayer(query('#hero-backdrop'), shown, immediate);
    if (query('#hero-cover').dataset.imagePath !== hero?.images.cover) { coverArrival?.cancel(); coverArrival = null; }
    setImage(query('#hero-cover'), hero?.images.cover);
    const art = query('#hero-art');
    art.inert = !shown; art.setAttribute('aria-hidden', String(!shown));
    showLayer(art, shown, immediate);
    const toolbar = query('.pool-toolbar');
    toolbar.hidden = false; toolbar.inert = shown; toolbar.setAttribute('aria-hidden', String(shown));
    query('#hero-grid').setAttribute('aria-hidden', String(shown));
    showLayer(query('#hero-grid'), !shown, immediate);
    query('#show-hero-art').hidden = !hero || shown;
    if (hero) {
      query('#hero-art-name').textContent = hero.name;
      query('#hero-art-title').textContent = hero.title ?? '';
      query('#hero-art-state').textContent = `${player.heroId === null ? '预选中' : '已锁定'} · ${seatName(player)}（你） · ${getLane(player.laneId).name}`;
      query('#hero-art-note').textContent = player.heroId === null ? '确认英雄后点击下方锁定，计时仍在继续。'
        : state.phase === 'review' ? '双方已完成选择，可核对阵容后确认队伍。' : '等待其他玩家完成选择，可继续调整召唤师技能。';
      query('#hero-art-toggle').textContent = player.heroId === null ? '更换英雄' : state.phase === 'review' ? '核对双方阵容' : '查看英雄池';
    }
    return shown;
  }

  function renderPanel(state, artShown) {
    const panel = query('#phase-panel');
    if (state.phase === 'poster') { panel.hidden = true; query('#hero-grid').inert = true; return; }
    const overlay = !['ban', 'pick'].includes(state.phase) && !artShown;
    panel.hidden = !overlay;
    query('#hero-grid').inert = overlay || artShown;
    if (!overlay) return;
    const own = state.humanSeat;
    const key = `${state.matchId}:${state.phase}`;
    const changed = key !== lastPanelKey;
    lastPanelKey = key;
    panel.dataset.team = state.phase === 'ready' ? own.team : '';
    const summary = ['review', 'poster'].includes(state.phase);
    panel.dataset.summary = summary;
    query('#lineup-summary').hidden = !summary;
    if (changed) {
      query('#panel-eyebrow').textContent = state.phase === 'ready' ? '你的本局位置' : summary ? '双方阵容已集结' : '对局提示';
      query('#panel-title').textContent = state.phase === 'ready' ? `${seatName(own)} · ${getLane(own.laneId).name}` : state.phase === 'review' ? '阵容已就绪' : state.phase === 'poster' ? '队伍已确认' : '本轮已停止';
      query('#panel-description').textContent = state.phase === 'ready' ? '本局仅操控这个位置，其余9位玩家自动禁选。' : state.phase === 'review' ? '核对英雄与技能后，点击下方确认。' : state.phase === 'poster' ? '本轮英雄选择已完成，可重新开始新一轮。' : state.error?.message ?? '请重新开始。';
      query('#panel-note').textContent = state.phase === 'ready' ? '每队已分配五条不同分路；跨分路英雄可在提示后确认选择。' : '';
    }
    if (summary) {
      const teams = state.resultSnapshot?.teams ?? state.teams;
      for (const player of [...teams.blue, ...teams.red]) {
        const card = summaryCards.get(player.id);
        const hero = byId.get(player.heroId);
        const skill = getVisibleSkill(state, player);
        const proficiency = getVisibleProficiency(state, player);
        card.label.textContent = `${seatName(player)} · ${getLane(player.laneId).name}${player.isHuman ? ' · 你' : ''}`;
        card.label.dataset.human = player.isHuman;
        card.name.textContent = hero?.name ?? '未选择';
        setImage(card.portrait, hero?.images.avatar);
        setImage(card.skill, skill?.image); card.skill.alt = skill ? `技能：${skill.name}` : ''; card.skill.title = card.skill.alt;
        setImage(card.proficiency, proficiency?.small); card.proficiency.alt = proficiency ? `熟练度：${proficiency.name}` : ''; card.proficiency.title = card.proficiency.alt;
      }
    }
  }

  function render(state, meta = {}) {
    if (meta.type === 'tick') { renderClock(); return; }
    const wasArtShown = root.dataset.art === 'true';
    const immediate = lastMatchId !== state.matchId || ['ready', 'error'].includes(state.phase);
    if (lastMatchId !== state.matchId) { hideFeedback(); lastNoticeKey = null; focusedHeroId = null; }
    lastMatchId = state.matchId;
    root.dataset.phase = state.phase;
    const description = describeDraft(state);
    const activeIds = new Set(getActiveSeats(state).map(seat => seat.id));
    const permissions = getPermissions(state);
    if (laneConfirmation && (meta.closeTransientUi || state.matchId !== laneConfirmation.matchId ||
      state.phase !== 'pick' || !permissions.canSelectHero || state.candidateId !== laneConfirmation.heroId)) closeLaneDialog(false);
    query('#phase-caption').textContent = description.caption;
    query('#turn-title').textContent = description.title;
    query('#turn-detail').textContent = description.detail;
    query('#action-hint').textContent = description.hint;
    query('#my-seat').textContent = `你：${seatName(state.humanSeat)} · ${getLane(state.humanSeat.laneId).name}`;
    const primary = query('#primary-action');
    primary.textContent = description.button;
    primary.disabled = ['ban', 'pick'].includes(state.phase) && !permissions.canCommitHero;
    renderClock();

    for (const team of ['red', 'blue']) {
      const selected = state.bans.filter(ban => ban.team === team);
      query(`#${team}-ban-count`).textContent = `${selected.length} / 5`;
      query(`#${team}-ban-count`).title = `已处理${selected.length}个ban位，其中${selected.filter(ban => ban.heroId === null).length}个超时留空`;
      bans[team].forEach((li, index) => {
        const record = selected[index];
        const hero = byId.get(record?.heroId);
        const skipped = record?.heroId === null && record.source === 'timeout';
        li.dataset.filled = Boolean(hero);
        li.dataset.skipped = skipped;
        setImage(li.querySelector('img'), hero?.images.avatar);
        const label = `${TEAM_NAMES[team]}第${index + 1}个禁用位，${hero ? `已禁用${hero.name}` : skipped ? '超时未禁，空位' : '待禁用'}`;
        li.setAttribute('aria-label', label);
        li.title = label;
      });
    }
    for (const player of [...state.teams.red, ...state.teams.blue]) {
      const node = players.get(player.id);
      const candidate = player.isHuman && state.phase === 'pick' ? state.candidateId : null;
      const hero = byId.get(player.heroId ?? candidate);
      const acting = activeIds.has(player.id);
      node.dataset.human = player.isHuman;
      node.dataset.current = acting;
      node.dataset.locked = player.heroId !== null;
      node.querySelector('.player-nickname').textContent = player.nickname;
      node.querySelector('.player-lane').textContent = getLane(player.laneId).name;
      node.querySelector('.you-tag').hidden = !player.isHuman;
      node.querySelector('.empty-portrait').hidden = Boolean(hero);
      setImage(node.querySelector('.portrait-image'), hero?.images.avatar);
      node.querySelector('.player-hero').textContent = hero ? `${player.heroId === null ? '预选 · ' : ''}${hero.name}` : '等待选择';
      const skill = getVisibleSkill(state, player);
      const skillImg = node.querySelector('.player-skill');
      setImage(skillImg, skill?.image); skillImg.alt = skill ? `${seatName(player)}技能：${skill.name}` : ''; skillImg.title = skillImg.alt;
      node.querySelector('.player-status').textContent = acting
        ? player.isHuman ? state.phase === 'ban' ? '正在禁用英雄' : '正在选择英雄'
          : state.phase === 'ban' ? '思考中 · 禁用英雄' : '思考中 · 选择英雄'
        : player.heroId !== null ? '✓ 已锁定' : player.isHuman ? '你的本局位置' : '等待轮次';
    }
    const banned = getBannedIds(state);
    const picked = getPickedIds(state);
    const visible = new Set(filterHeroes(heroes, state.filter, state.laneFilter).map(hero => hero.id));
    const usableIds = heroes.filter(hero => permissions.canSelectHero && visible.has(hero.id) && !banned.has(hero.id) && !picked.has(hero.id)).map(hero => hero.id);
    focusedHeroId = usableIds.includes(state.candidateId) ? state.candidateId : usableIds.includes(focusedHeroId) ? focusedHeroId : usableIds[0] ?? null;
    const previousFocus = document.activeElement;
    for (const [id, { li, button, label }] of cards) {
      li.hidden = !visible.has(id);
      const status = banned.has(id) ? 'banned' : picked.has(id) ? 'picked' : state.candidateId === id ? 'candidate' : 'available';
      button.dataset.status = status;
      button.disabled = !permissions.canSelectHero || status === 'banned' || status === 'picked';
      button.tabIndex = id === focusedHeroId ? 0 : -1;
      button.setAttribute('aria-pressed', String(status === 'candidate'));
      const text = status === 'banned' ? '已禁用' : status === 'picked' ? '已选择' : status === 'candidate' ? '已预选' : '';
      button.setAttribute('aria-label', `${byId.get(id).name}${text ? `，${text}` : ''}`);
      label.textContent = text;
      label.hidden = text === '';
    }
    if (previousFocus?.dataset.heroId && (previousFocus.disabled || previousFocus.closest('li').hidden)) {
      (cards.get(focusedHeroId)?.button ?? query('#skill-button')).focus();
    }
    for (const [category, button] of tabs) {
      button.setAttribute('aria-pressed', String(category === state.filter));
      button.disabled = !permissions.canBrowse;
    }
    query('#pool-count').textContent = `${visible.size} 位英雄`;
    query('#lane-filter').value = state.laneFilter;
    query('#lane-filter').disabled = !permissions.canBrowse;
    const ownPlayer = getPlayer(state, state.humanSeat.id);
    const candidate = byId.get(state.candidateId ?? (['pick', 'review'].includes(state.phase) ? ownPlayer.heroId : null));
    setImage(query('#candidate-image'), candidate?.images.avatar);
    query('#candidate-name').textContent = candidate?.name ?? (['ban', 'pick'].includes(state.phase) ? '尚未选择' : '英雄集结');
    query('#candidate-label').textContent = state.phase === 'ban' ? '禁用候选' : ownPlayer.heroId !== null ? '已锁定英雄' : '候选英雄';
    query('#candidate-info').hidden = !['ban', 'pick', 'review'].includes(state.phase);
    const ownSkill = SKILLS.find(skill => skill.id === getPlayer(state, state.humanSeat.id).skillId);
    query('#my-skill-name').textContent = ownSkill.name;
    query('#skill-button').disabled = !permissions.canChangeSkill;
    query('#skill-button').setAttribute('aria-label', `${permissions.canChangeSkill ? '选择召唤师技能' : '已确认召唤师技能'}，当前${ownSkill.name}`);
    setImage(query('#my-skill-image'), ownSkill.image);
    const artShown = renderHeroArt(state, immediate);
    renderPanel(state, artShown);
    if (artShown && (previousFocus?.closest('#hero-grid') || previousFocus?.id === 'show-hero-art' || (previousFocus === primary && primary.disabled))) {
      (primary.disabled ? query('#hero-art-toggle') : primary).focus();
    } else if (!artShown && wasArtShown && permissions.canSelectHero && !dialog.open &&
      (previousFocus === primary || previousFocus?.closest('#hero-art'))) {
      cards.get(focusedHeroId)?.button.focus();
    }
    if (meta.closeTransientUi || !permissions.canChangeSkill) closeSkillDialog();
    const noticeKey = meta.notice ? `${state.matchId}:${meta.notice.type}:${meta.notice.seatId}:${meta.notice.heroId}` : null;
    if (meta.type === 'rejected') showFeedback(meta.message, 'warning');
    else if (noticeKey && noticeKey !== lastNoticeKey) {
      lastNoticeKey = noticeKey;
      const prefix = ['timeout', 'ban-timeout'].includes(meta.notice.type) ? `${meta.notice.seatId === state.humanSeat.id ? '你' : seatName(getPlayer(state, meta.notice.seatId))}：` : '';
      showFeedback(prefix + meta.notice.message, 'warning');
    } else if (meta.type === 'change' && meta.action === 'COMMIT_HERO') {
      const player = getPlayer(state, state.humanSeat.id);
      const hero = byId.get(player.heroId);
      const ban = state.bans.find(item => item.seatId === player.id);
      showFeedback(hero ? `已锁定${hero.name}` : `已禁用${byId.get(ban?.heroId)?.name ?? '英雄'}`);
    } else if (meta.type === 'change') query('#announcer').textContent = `${description.title}。${description.detail}`;
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === 'hero-art-toggle' || button.id === 'show-hero-art') {
      poolOpen = button.id === 'hero-art-toggle';
      render(controller.getState(), { type: 'view' });
      const target = poolOpen ? cards.get(focusedHeroId)?.button : query('#primary-action');
      (target && !target.disabled && !target.closest('[inert]') ? target : poolOpen ? query('#show-hero-art') : query('#hero-art-toggle')).focus();
    }
    else if (button.dataset.skillId) chooseSkill(button.dataset.skillId);
    else if (button.id === 'skill-button') openSkillDialog();
    else if (button.id === 'skill-close' || button.id === 'skill-cancel') closeSkillDialog();
    else if (button.id === 'skill-save') {
      const chosen = draftSkillId;
      const result = controller.setSkill(chosen);
      if (result.ok) {
        closeSkillDialog();
        if (getPlayer(result.state, result.state.humanSeat.id).skillId === chosen) {
          showFeedback(`召唤师技能已保存为${SKILLS.find(skill => skill.id === chosen).name}`);
        }
      }
    }
    else if (button.dataset.heroId) { poolOpen = false; controller.select(Number(button.dataset.heroId)); }
    else if (button.dataset.category) controller.setFilter(button.dataset.category);
    else if (button.id === 'lane-warning-cancel') closeLaneDialog();
    else if (button.id === 'lane-warning-confirm') {
      const confirmation = laneConfirmation, state = controller.getState();
      closeLaneDialog(false);
      if (confirmation && state.phase === 'pick' && state.matchId === confirmation.matchId &&
        state.turnIndex === confirmation.turnIndex && state.candidateId === confirmation.heroId && isHumanTurn(state)) {
        controller.commit({ confirmOffLane: true });
      }
    }
    else if (button.id === 'reset-button') controller.reset();
    else if (button.id === 'primary-action') {
      const phase = controller.getState().phase;
      if (phase === 'ready') controller.start();
      else if (phase === 'ban' || phase === 'pick') commitHero();
      else if (phase === 'review') controller.confirm();
      else controller.reset();
    }
  }, { signal: abort.signal });
  query('#lane-filter').addEventListener('change', event => controller.setLaneFilter(event.target.value), { signal: abort.signal });
  laneDialog.addEventListener('cancel', event => { event.preventDefault(); closeLaneDialog(); }, { signal: abort.signal });
  laneDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const first = query('#lane-warning-cancel'), last = query('#lane-warning-confirm');
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, { signal: abort.signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeSkillDialog(); }, { signal: abort.signal });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll('button:not(:disabled)')].filter(node => node.tabIndex >= 0);
    const first = stops[0], last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, { signal: abort.signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSkillDialog();
  }, { signal: abort.signal });
  query('#skill-options').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const ids = SKILLS.map(skill => skill.id);
    const columns = getComputedStyle(query('#skill-options')).gridTemplateColumns.split(' ').length;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key] ?? 0;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1
      : (ids.indexOf(draftSkillId) + offset + ids.length) % ids.length;
    chooseSkill(ids[index]); skillChoices.get(ids[index]).focus();
  }, { signal: abort.signal });
  query('#hero-grid').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const available = [...cards.values()].filter(card => !card.li.hidden && !card.button.disabled);
    const current = available.findIndex(card => card.button === event.target);
    if (current < 0) return;
    event.preventDefault();
    const columns = getComputedStyle(query('#hero-grid')).gridTemplateColumns.split(' ').length;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key] ?? 0;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
      : Math.max(0, Math.min(available.length - 1, current + offset));
    const target = available[index].button;
    focusedHeroId = Number(target.dataset.heroId);
    for (const { button } of cards.values()) button.tabIndex = button === target ? 0 : -1;
    target.focus();
  }, { signal: abort.signal });
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  return { dispose() {
    disposed = true; unsubscribe(); abort.abort(); hideFeedback(); closeSkillDialog(false); closeLaneDialog(false);
    for (const { animation } of layerAnimations.values()) animation.cancel();
    layerAnimations.clear(); coverArrival?.cancel();
    players.clear(); cards.clear(); tabs.clear(); skillChoices.clear(); summaryCards.clear();
  } };
}
