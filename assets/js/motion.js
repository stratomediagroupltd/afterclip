// motion.js: the shared motion kit: maths, a damped scroll value every
// scene reads from, scene progress, and the one-shot reveals.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
export const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
/** Where `value` sits between `start` and `end`, as 0…1. */
export const progress = (value, start, end) => clamp((value - start) / (end - start));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const smooth = (t) => t * t * (3 - 2 * t);

// ───────── The damped scroll value ─────────
//
// Scenes don't read scrollY directly: they read a copy that eases towards
// it, which is what makes scroll-driven motion glide instead of stepping.
// The loop runs only while the two differ.

/** How quickly the damped value catches up, as a time constant in ms. */
const SCROLL_LAG_MS = 85;
const SETTLED_PX = 0.25;

/**
 * The screen's height as the page lays out to it: index.html's --vh × 100. A
 * browser toolbar sliding in or out changes innerHeight but not this, so a
 * pinned scene's progress doesn't jump under the finger.
 */
const stageHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vh")) * 100 || innerHeight;

const scroll = { target: scrollY, current: scrollY, height: stageHeight(), width: innerWidth };
const subscribers = new Set();
const resizers = new Set();
let running = false;
let lastFrame = 0;

/** One scene that throws mustn't stop the others, or the loop. */
function renderSafely(render) {
  try {
    render(scroll.current, scroll);
  } catch (error) {
    subscribers.delete(render);
    console.error("AfterClip: a scene stopped", error);
  }
}

function tick(now) {
  const elapsed = Math.min(64, now - (lastFrame || now - 16));
  lastFrame = now;
  const catchUp = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / SCROLL_LAG_MS);
  scroll.current = lerp(scroll.current, scroll.target, catchUp);
  if (Math.abs(scroll.target - scroll.current) < SETTLED_PX) scroll.current = scroll.target;
  subscribers.forEach((render) => renderSafely(render));
  if (scroll.current !== scroll.target) {
    requestAnimationFrame(tick);
  } else {
    running = false;
    lastFrame = 0;
  }
}

export function kick() {
  if (running) return;
  running = true;
  requestAnimationFrame(tick);
}

/** Calls `render(y, scroll)` on every frame the damped scroll moves, and once now. */
export function onScroll(render) {
  subscribers.add(render);
  render(scroll.current, scroll);
  return () => subscribers.delete(render);
}

/** Calls `measure()` now and after every resize (debounced). */
export function onResize(measure) {
  resizers.add(measure);
  measure(scroll);
}

let resizeTimer = 0;
let measuredLayout = "";
/** Scenes measure again only when the layout changed, not on every resize event. */
function remeasure() {
  scroll.height = stageHeight();
  scroll.width = innerWidth;
  scroll.target = scrollY;
  const layout = `${scroll.width} ${scroll.height} ${document.documentElement.scrollHeight}`;
  if (layout !== measuredLayout) {
    measuredLayout = layout;
    resizers.forEach((measure) => measure(scroll));
  }
  subscribers.forEach((render) => renderSafely(render));
}

export function startScroll() {
  addEventListener("scroll", () => { scroll.target = scrollY; kick(); }, { passive: true });
  const later = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(remeasure, 120); };
  addEventListener("resize", later);
  // Sections below render as they come near (content-visibility), and the
  // page grows or shrinks a little each time: scenes measure again.
  new ResizeObserver(later).observe(document.body);
}

export const scrollState = scroll;

/** A tall element's place on the page, for scene progress. */
export function sceneBox(element) {
  const box = { top: 0, height: 1 };
  onResize(() => {
    const rect = element.getBoundingClientRect();
    box.top = rect.top + scrollY;
    box.height = rect.height;
  });
  return box;
}

/** 0 when a pinned scene starts sticking, 1 when it lets go. */
export const pinnedProgress = (y, box, viewport) => clamp((y - box.top) / Math.max(1, box.height - viewport));

/** 0 when the element's top enters at the bottom of the screen, 1 when its bottom leaves at the top. */
export const passProgress = (y, box, viewport) => clamp((y + viewport - box.top) / (box.height + viewport));

// ───────── Motion that follows a number ─────────
//
// Everything that moves with the scroll, a drag or a clip's clock is a paused
// Web Animation that `seek` moves along. Seeking changes neither the DOM nor
// a stylesheet, so nothing watching the page (extensions, password managers,
// an open DevTools) is woken up sixty times a second.

const SCRUB_LENGTH = 1000;

/**
 * A paused animation of `element` through `keyframes`; the function it
 * returns puts it at `share` (0…1) of the way.
 */
export function scrub(element, keyframes, options = {}) {
  const animation = element.animate(keyframes, { duration: SCRUB_LENGTH, fill: "both", ...options });
  animation.pause();
  let at = -1;
  const seek = (share) => {
    const time = clamp(share) * SCRUB_LENGTH;
    if (time === at) return;
    at = time;
    animation.currentTime = time;
  };
  seek.cancel = () => animation.cancel();
  return seek;
}

/** Sets `element`'s text only when it changes: no mutation for nothing. */
export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

// ───────── Visibility ─────────

/** Calls `change(isVisible, entry)` as `element` enters and leaves the screen. */
export function watchVisibility(element, change, options = {}) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => change(entry.isIntersecting, entry));
  }, options);
  observer.observe(element);
  return observer;
}

// ───────── One-shot reveals ─────────

/** Splits a [data-wipe] title at its <br>s into lines that rise in turn. */
function splitLines(title) {
  const lines = title.innerHTML.split(/<br\s*\/?>/i);
  title.innerHTML = lines
    .map((line, index) => `<span class="line" style="--i:${index}"><span>${line.trim()}</span></span>`)
    .join("");
}

export function startReveals() {
  const targets = [...$$("[data-wipe]"), ...$$("[data-reveal]"), ...$$(".privacy__lock")];
  $$("[data-wipe]").forEach(splitLines);

  const STAGGER_MS = 80;
  const observer = new IntersectionObserver((entries) => {
    // Whatever arrives together comes in one after another.
    entries.filter((entry) => entry.isIntersecting).forEach((entry, index) => {
      entry.target.style.setProperty("--d", `${Math.min(index, 6) * STAGGER_MS}ms`);
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
  targets.forEach((element) => observer.observe(element));
}
