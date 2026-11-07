import { createHeroLoader } from './data-loader.js';
import { createDraftController } from './draft-controller.js';
import { createMatchView } from './match-view.js';
import { loadHeroDisplay } from './hero-display.js';

const loader = createHeroLoader();
const app = document.querySelector('#app');
const status = document.querySelector('#resource-status');
const title = document.querySelector('#status-title');
const detail = document.querySelector('#status-detail');
const retry = document.querySelector('#retry-button');
const stage = document.querySelector('#draft-root');
const posterStage = document.querySelector('#poster-root');
let resourceEpoch = 0;
let draftController = null;
let draftView = null;

export function getDraftController() { return draftController; }

async function loadResources() {
  const epoch = ++resourceEpoch;
  draftView?.dispose();
  draftView = null;
  draftController?.dispose();
  draftController = null;
  // 清理动态节点，重试不重复创建列表或监听器。
  for (const id of ['red-bans', 'blue-bans', 'red-players', 'blue-players', 'profession-tabs', 'hero-grid', 'skill-options', 'lineup-summary']) {
    document.getElementById(id).replaceChildren();
  }
  app.dataset.phase = 'loading';
  status.hidden = false;
  status.setAttribute('aria-busy', 'true');
  title.textContent = '正在准备英雄资料';
  detail.textContent = '正在读取本地资源，请稍候。';
  stage.hidden = true;
  posterStage.hidden = true;
  retry.hidden = true;
  const result = await loader.load();
  if (result.status === 'stale') return;
  status.setAttribute('aria-busy', 'false');
  if (result.status === 'error') {
    app.dataset.phase = 'error';
    title.textContent = '英雄资料未能加载';
    detail.textContent = result.message;
    retry.hidden = false;
    return;
  }
  try {
    const display = await loadHeroDisplay(result.data.heroes.map(hero => hero.id));
    if (epoch !== resourceEpoch) return;
    draftController = createDraftController(result.data.heroes);
    draftView = createMatchView(stage, posterStage, result.data.heroes, draftController, { display });
    if (document.visibilityState === 'hidden') draftController.suspend();
    status.hidden = true;
    stage.hidden = false;
    app.dataset.phase = 'ready';
  } catch (error) {
    draftView?.dispose();
    draftController?.dispose();
    draftController = null;
    app.dataset.phase = 'error';
    title.textContent = '对局未能初始化';
    detail.textContent = error instanceof Error ? error.message : '请重新加载。';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadResources);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') draftController?.suspend();
  else draftController?.resume();
});
window.addEventListener('pagehide', () => { loader.dispose(); draftController?.suspend(); });
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (draftController) draftController.resume();
  else loadResources();
});
loadResources();
