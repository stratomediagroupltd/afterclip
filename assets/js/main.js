// main.js: starts the page. The order matters: titles split into lines
// before any scene measures where it sits.

import { startScroll, startReveals } from "./motion.js";
import { startSaves } from "./saves.js";
import { startHero } from "./hero.js";
import { startScenes } from "./scenes.js";
import { startClips } from "./clips.js";
import { startMatch } from "./match.js";
import { startSpecs } from "./specs.js";
import { startDemos } from "./demos.js";
import { startWatch } from "./watch.js";
import { startPage } from "./page.js";

window.__afterclip = true;
// Now the page has painted, the hero's recording dot can start pulsing (base.css).
requestAnimationFrame(() => document.documentElement.classList.add("is-live"));
// If the page's 3-second fallback gave up on us (a slow network), switch the
// motion styles back on: the script is here now.
document.documentElement.classList.add("js");

const parts = [startReveals, startHero, startScenes, startClips, startMatch, startSpecs, startDemos, startWatch, startSaves, startPage, startScroll];
parts.forEach((start) => {
  // One broken part shouldn't take the rest of the page with it.
  try {
    start();
  } catch (error) {
    console.error(`AfterClip: ${start.name} failed`, error);
  }
});
