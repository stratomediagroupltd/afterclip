// clips.js: "One moment. One clip." Three steps that play in turn while the
// section is on screen: a save, a second save that would repeat most of the
// first, and the one clip AfterClip makes of the two. Any step can be chosen.

import { $, $$, reducedMotion, watchVisibility } from "./motion.js";

const LAST_STEP = 3;
/** How long each step shows before the next one, in ms (0: before the first). */
const SHOWS_MS = [400, 2600, 3200, 4600];
const PLAYS_WHEN_VISIBLE = 0.5;

export function startClips() {
  const merge = $("[data-merge]");
  if (!merge) return;
  const buttons = $$("[data-merge-go]", merge);
  let step = LAST_STEP;
  let timer = 0;
  let onScreen = false;

  const show = (next) => {
    step = next;
    merge.dataset.step = String(next);
    buttons.forEach((button) => {
      if (Number(button.dataset.mergeGo) === next) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  };
  // Back to the start at once, so the steps never play backwards.
  const reset = () => {
    merge.classList.add("is-resetting");
    show(0);
    void merge.offsetWidth;
    merge.classList.remove("is-resetting");
  };
  const go = (next) => {
    if (next <= step) reset();
    show(next);
  };
  const playOn = () => {
    clearTimeout(timer);
    if (!onScreen || reducedMotion.matches) return;
    timer = setTimeout(() => {
      go(step >= LAST_STEP ? 1 : step + 1);
      playOn();
    }, SHOWS_MS[step]);
  };

  buttons.forEach((button) => button.addEventListener("click", () => {
    go(Number(button.dataset.mergeGo));
    playOn();
  }));

  // Without motion it stays on the outcome, and the steps still answer a click.
  if (reducedMotion.matches) return;
  reset();
  watchVisibility(merge, (visible) => {
    onScreen = visible;
    if (visible) playOn();
    else clearTimeout(timer);
  }, { threshold: PLAYS_WHEN_VISIBLE });
}
