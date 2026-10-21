// demos.js — the hands-on bits: the buffer ring and the dial that sizes it,
// and the privacy section's zeros.

import { $, $$, clamp, reducedMotion, scrub, setText, watchVisibility } from "./motion.js";

// ───────── Shared helpers ─────────

/** A critically damped spring from `from` to `to`, calling `apply` each frame. */
function spring(from, to, apply, done) {
  const STIFFNESS = 180;
  const DAMPING = 26;
  let position = from;
  let velocity = 0;
  let last = performance.now();
  let frame = 0;
  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    velocity += (-STIFFNESS * (position - to) - DAMPING * velocity) * dt;
    position += velocity * dt;
    if (Math.abs(position - to) < 0.2 && Math.abs(velocity) < 2) {
      apply(to);
      done?.();
      return;
    }
    apply(position);
    frame = requestAnimationFrame(step);
  };
  if (reducedMotion.matches) apply(to);
  else frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

// ───────── The buffer: a ring buffer and the dial that sizes it ─────────

const STOPS = [10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800];
const LABELS = ["10s", "15s", "30s", "1m", "2m", "5m", "10m", "15m", "20m", "30m"];
const START_STOP = 3;
/** About this much space per minute of buffer at 1080p and 30 fps (the app's own estimate). */
const MB_PER_MINUTE = 70;
/** Projects a flick this far ahead before snapping. */
const FLICK_MS = 180;

const spoken = (seconds) => (seconds < 60 ? `${seconds} seconds`
  : seconds === 60 ? "1 minute" : `${seconds / 60} minutes`);
const space = (seconds) => {
  const megabytes = (seconds / 60) * MB_PER_MINUTE;
  return megabytes < 1000 ? `${Math.round(megabytes)} MB` : `${(megabytes / 1000).toFixed(1)} GB`;
};
/** One lap of the ring per buffer, slowed down for long ones so it stays watchable. */
const lapSeconds = (seconds) => 2.2 + Math.log2(seconds / 10) * 0.9;

function startRing() {
  const ring = $("[data-ring]");
  if (!ring) return;
  const dial = $("[data-dial]", ring);
  const tape = $("[data-dial-tape]", ring);
  const value = $("[data-ring-value]", ring);
  const unit = $("[data-ring-unit]", ring);
  const note = $("[data-ring-note]", ring);
  const spin = $("[data-ring-spin]", ring);

  const step = parseFloat(getComputedStyle(dial).getPropertyValue("--step")) || 66;
  const labels = LABELS.map((text, index) => {
    const label = document.createElement("span");
    label.textContent = text;
    label.style.left = `${index * step}px`;
    tape.append(label);
    return label;
  });

  // The ring turns only while it's on screen, at a pace set when the dial settles.
  const lap = spin.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 1000, iterations: Infinity });
  lap.pause();
  if (!reducedMotion.matches) watchVisibility(ring, (visible) => (visible ? lap.play() : lap.pause()));
  let lapFor = -1;
  const settle = () => {
    const seconds = STOPS[index];
    if (seconds === lapFor) return;
    lapFor = seconds;
    lap.updatePlaybackRate(1 / lapSeconds(seconds));
    if (!reducedMotion.matches) {
      value.animate([{ opacity: 0.2, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
    }
  };

  let offset = START_STOP * step;
  let index = -1;
  let cancelSpring = () => {};
  const maxOffset = (STOPS.length - 1) * step;
  // The tape slides along a scrubbed animation (see scrub), a little past
  // either end for the rubber band.
  const overshoot = step * 0.4;
  const slide = scrub(tape, [
    { transform: `translate3d(${overshoot}px, 0, 0)` },
    { transform: `translate3d(${-(maxOffset + overshoot)}px, 0, 0)` },
  ]);
  const place = (px) => { offset = px; slide((px + overshoot) / (maxOffset + overshoot * 2)); };

  const show = (next) => {
    if (next === index || !STOPS[next]) return;
    labels[index]?.classList.remove("is-on");
    index = next;
    labels[index].classList.add("is-on");
    const seconds = STOPS[index];
    setText(value, String(seconds < 60 ? seconds : seconds / 60));
    setText(unit, seconds < 60 ? "seconds back" : seconds === 60 ? "minute back" : "minutes back");
    setText(note, `About ${space(seconds)} of space, at 1080p and 30 fps.`);
    dial.setAttribute("aria-valuenow", index);
    dial.setAttribute("aria-valuetext", spoken(seconds));
  };
  const goTo = (next) => {
    if (!Number.isFinite(next)) return;
    const target = clamp(Math.round(next), 0, STOPS.length - 1);
    show(target);
    settle();
    cancelSpring();
    cancelSpring = spring(offset, target * step, place);
  };

  place(offset);
  show(START_STOP);
  settle();

  // Drag, with a flick and a snap.
  let drag = null;
  dial.addEventListener("pointerdown", (event) => {
    cancelSpring();
    dial.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, from: offset, moved: 0, samples: [{ x: event.clientX, t: event.timeStamp }] };
  });
  let moveFrame = 0;
  let latestX = 0;
  dial.addEventListener("pointermove", (event) => {
    if (!drag) return;
    latestX = event.clientX;
    drag.moved = Math.max(drag.moved, Math.abs(latestX - drag.x));
    drag.samples.push({ x: latestX, t: event.timeStamp });
    if (drag.samples.length > 5) drag.samples.shift();
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (!drag) return;
      place(clamp(drag.from - (latestX - drag.x), -step * 0.4, maxOffset + step * 0.4));
      show(clamp(Math.round(offset / step), 0, STOPS.length - 1));
    });
  });
  const release = (event) => {
    if (!drag) return;
    const { samples, moved } = drag;
    drag = null;
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    if (moved < 4) {
      const centre = dial.getBoundingClientRect();
      goTo(Math.round((offset + event.clientX - (centre.left + centre.width / 2)) / step));
      return;
    }
    const first = samples[0];
    const lastSample = samples.at(-1);
    const velocity = (lastSample.x - first.x) / Math.max(1, lastSample.t - first.t);
    goTo(Math.round((offset - velocity * FLICK_MS) / step));
  };
  dial.addEventListener("pointerup", release);
  // A vertical swipe that starts on the dial scrolls the page instead: stay put.
  dial.addEventListener("pointercancel", () => {
    if (!drag) return;
    drag = null;
    goTo(index);
  });

  dial.addEventListener("keydown", (event) => {
    const moves = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 };
    if (event.key in moves) goTo(index + moves[event.key]);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(STOPS.length - 1);
    else return;
    event.preventDefault();
  });

  // A sideways swipe on a trackpad turns it too; up and down still scroll the page.
  let wheelTimer = 0;
  dial.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    cancelSpring();
    place(clamp(offset + event.deltaX, 0, maxOffset));
    show(Math.round(offset / step));
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => goTo(Math.round(offset / step)), 140);
  }, { passive: false });
}

// ───────── Privacy: zeros that try to count ─────────

const COUNT_MS = 1100;

function startZeros() {
  $$("[data-count]").forEach((digit) => {
    if (reducedMotion.matches) return;
    watchVisibility(digit, (visible) => {
      if (!visible || digit.dataset.count === "done") return;
      digit.dataset.count = "done";
      const start = performance.now();
      const roll = (now) => {
        const t = (now - start) / COUNT_MS;
        digit.textContent = t < 1 ? String(Math.floor(Math.random() * 10)) : "0";
        if (t < 1) setTimeout(() => requestAnimationFrame(roll), 40 + t * 120);
      };
      requestAnimationFrame(roll);
    }, { threshold: 0.8 });
  });
}

export function startDemos() {
  startRing();
  startZeros();
}
