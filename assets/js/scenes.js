// scenes.js: the scroll-driven stories: the manifesto lit word by word,
// the film tape where scrolling is time, and two saves melting into one clip.

import { $, $$, onScroll, onResize, sceneBox, pinnedProgress, progress, scrub, watchVisibility } from "./motion.js";

// ───────── Manifesto ─────────

/** Wraps every word in a span, keeping inline markup such as <strong>. */
function splitWords(root) {
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        return;
      }
      if (child.nodeType !== Node.TEXT_NODE) return;
      const fragment = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.append(" ");
          return;
        }
        const word = document.createElement("span");
        word.className = "w";
        word.textContent = part;
        fragment.append(word);
        words.push(word);
      });
      child.replaceWith(fragment);
    });
  };
  walk(root);
  return words;
}

function startManifesto() {
  const text = $("[data-words]");
  if (!text) return;
  const words = splitWords(text);
  const box = sceneBox(text);
  let lit = -1;
  onScroll((y, { height }) => {
    // Lights up as the paragraph rises from the bottom to above the middle.
    const reading = progress(y, box.top - height * 0.82, box.top + box.height - height * 0.42);
    const count = Math.round(reading * words.length);
    if (count === lit) return;
    words.forEach((word, index) => word.classList.toggle("is-lit", index < count));
    lit = count;
  });
}

// ───────── How it works: the tape ─────────
//
// Time is measured in frames of the strip. The film moves left past "Now";
// whatever is in the window is what a tap would keep. It starts with the
// moment next in line: one frame of scrolling records it (step two), two
// more bring the save (step three), on a frame boundary with the moment
// still inside the window, and one more shows the tape rolling on.

const TAPE = {
  startFrame: 14,
  spanFrames: 4,
  momentFrame: 14,
  saveAt: 3 / 4,
  stepsAt: [0, 1 / 4, 3 / 4],
  /** How much of the scene the saved clip takes to lift out. */
  lift: 0.15,
};

function startTape() {
  const how = $("[data-how]");
  if (!how) return;
  const steps = $$("[data-step]", how);
  const dots = $$("[data-dot]", how);
  const tape = $("[data-tape]", how);
  const rec = $("[data-tape-rec]", tape);
  const film = $("[data-tape-film]", tape);
  const moment = $("[data-tape-moment]", tape);
  const windowBox = $("[data-tape-window]", tape);
  const clip = $("[data-tape-clip]", tape);
  const clipFilm = $("[data-tape-clip-film]", tape);
  const clipLabel = $(".tape__clip-label", tape);
  const shutter = $("[data-tape-shutter]", tape);

  tape.style.setProperty("--km", TAPE.momentFrame);
  // The strip downloads as the tape comes near, not with the page.
  watchVisibility(tape, (near) => { if (near) tape.classList.add("is-near"); }, { rootMargin: "1200px 0px" });
  const savedMoment = moment.cloneNode(true);
  savedMoment.removeAttribute("data-tape-moment");
  clipFilm.append(savedMoment);

  const box = sceneBox(how);
  const size = { frame: 100, frameHeight: 177, window: 6, now: 600 };
  // The film, the saved clip and its label each follow the scroll along a
  // scrubbed animation (see scrub), rebuilt whenever the tape changes size.
  const end = TAPE.saveAt + TAPE.lift;
  let seekFilm = () => {};
  let seekClip = () => {};
  const seekLabel = scrub(clipLabel, [
    { offset: 0, opacity: 0 }, { offset: TAPE.saveAt + 0.05, opacity: 0 }, { offset: end, opacity: 1 }, { offset: 1, opacity: 1 },
  ]);
  let step = 0;
  let last = -1;
  onResize(() => {
    last = -1;
    size.frame = moment.offsetWidth;
    size.frameHeight = moment.offsetHeight;
    size.window = Math.round(windowBox.offsetWidth / size.frame);
    size.now = rec.offsetWidth;
    const savedFrame = TAPE.startFrame + TAPE.saveAt * TAPE.spanFrames;
    const firstKept = savedFrame - size.window;
    clipFilm.style.backgroundPosition = `${-firstKept * size.frame}px 0`;
    savedMoment.style.left = `${(TAPE.momentFrame - firstKept) * size.frame}px`;
    // First in the card, the moment takes the card's rounded left corners.
    savedMoment.classList.toggle("is-first", TAPE.momentFrame === firstKept);

    seekFilm.cancel?.();
    seekClip.cancel?.();
    const from = size.now - TAPE.startFrame * size.frame;
    seekFilm = scrub(film, [
      { transform: `translate3d(${from}px, 0, 0)` },
      { transform: `translate3d(${from - TAPE.spanFrames * size.frame}px, 0, 0)` },
    ]);
    // Saved, the window's frames lift out as a clip, straight up, into the
    // room home.css keeps above the tape.
    const lifted = `translate3d(0, ${-(size.frameHeight * 0.4 + 44)}px, 0)`;
    seekClip = scrub(clip, [
      { offset: 0, opacity: 0, transform: "none" },
      { offset: TAPE.saveAt - 0.0001, opacity: 0, transform: "none" },
      { offset: TAPE.saveAt, opacity: 1, transform: "none", easing: "ease-in-out" },
      { offset: end, opacity: 1, transform: lifted },
      { offset: 1, opacity: 1, transform: lifted },
    ]);
  });

  onScroll((y, { height }) => {
    const q = pinnedProgress(y, box, height);
    // Before and after the pin, nothing on the tape moves: leave it be.
    if (q === last) return;
    last = q;
    seekFilm(q);
    seekClip(q);
    seekLabel(q);

    const nextStep = TAPE.stepsAt.filter((start) => q >= start).length - 1;
    if (nextStep !== step) {
      steps.forEach((element, index) => element.classList.toggle("is-on", index === nextStep));
      dots.forEach((element, index) => element.classList.toggle("is-on", index === nextStep));
      tape.classList.toggle("is-moment", nextStep >= 1);
      step = nextStep;
    }

    shutter.classList.toggle("is-pressed", q > TAPE.saveAt - 0.006 && q < TAPE.saveAt + 0.04);
  });
}

export function startScenes() {
  startManifesto();
  startTape();
}
