import { createDraftView } from './draft-view.js';
import { createPosterView } from './poster-view.js';

export function createMatchView(draftRoot, posterRoot, heroes, controller, { display = {}, ...viewOptions } = {}) {
  const draft = createDraftView(draftRoot, heroes, controller, viewOptions);
  const poster = createPosterView(posterRoot, heroes, controller, display);
  let wasPoster = false;
  function render(state) {
    const shown = state.phase === 'poster';
    draftRoot.hidden = shown; draftRoot.inert = shown;
    posterRoot.hidden = !shown; posterRoot.inert = !shown;
    if (shown !== wasPoster) {
      (shown ? posterRoot.querySelector('#poster-title') : draftRoot.querySelector('#primary-action')).focus();
    }
    wasPoster = shown;
  }
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  return { dispose() { unsubscribe(); poster.dispose(); draft.dispose(); } };
}
