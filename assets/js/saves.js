// saves.js: "Save" from anywhere: the shutter, a key, a game controller,
// a device chip or the watch. Each save goes to whoever shows it best (the
// hero phone while it's on screen); otherwise a toast drops in at the top.

import { $, reducedMotion, watchVisibility } from "./motion.js";

export const DEFAULT_SECONDS = 15;
const TOAST_MS = 2200;
const MAX_TOASTS = 2;
const PAD_COOLDOWN_MS = 400;
const KEY_COOLDOWN_MS = 350;
const KEY_DOWN_MS = 160;

const handlers = [];

/** `handle(save)` returns true when it showed the save itself. */
export function onSave(handle) {
  handlers.push(handle);
}

export function save({ seconds = DEFAULT_SECONDS, source = "shutter", label = "" } = {}) {
  const detail = { seconds, source, label };
  const shown = handlers.reduce((wasShown, handle) => handle(detail) || wasShown, false);
  if (!shown) showToast($("[data-global-toasts]"), savedToast(detail));
  document.dispatchEvent(new CustomEvent("afterclip:save", { detail }));
}

// ───────── Toasts ─────────

function toast(content) {
  const element = document.createElement("div");
  element.className = "toast";
  element.append(...content);
  return element;
}

function checkMark() {
  const check = document.createElement("span");
  check.className = "toast__check";
  check.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>';
  return check;
}

/** The app's own pill: a green check and "Saved 15s", plus where it came from. */
export function savedToast({ seconds, label }) {
  const parts = [checkMark(), document.createTextNode(`Saved ${seconds}s`)];
  if (label) {
    const meta = document.createElement("span");
    meta.className = "toast__meta";
    meta.textContent = `· ${label}`;
    parts.push(meta);
  }
  return toast(parts);
}

export function messageToast(text) {
  return toast([document.createTextNode(text)]);
}

export function showToast(container, element, lifetime = TOAST_MS) {
  if (!container) return;
  while (container.children.length >= MAX_TOASTS) container.firstElementChild.remove();
  container.append(element);
  const still = reducedMotion.matches;
  element.animate(
    [{ opacity: 0, transform: still ? "none" : "translateY(-14px) scale(0.9)" }, { opacity: 1, transform: "none" }],
    { duration: still ? 1 : 520, easing: "cubic-bezier(.2, 1.3, .4, 1)" },
  );
  setTimeout(() => {
    const out = element.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: still ? "none" : "translateY(-10px) scale(0.96)" }],
      { duration: still ? 1 : 280, easing: "ease-in", fill: "forwards" },
    );
    out.onfinish = () => element.remove();
  }, lifetime);
}

export const showMessage = (text, lifetime) => showToast($("[data-global-toasts]"), messageToast(text), lifetime);

// ───────── A key is a shutter ─────────
//
// Single letters save only while the hero or the buttons section is on
// screen, so the page never steals keys elsewhere, and the "Keys save"
// switch turns them off altogether (WCAG 2.1.4).

function keyZones() {
  const live = new Set();
  [$("[data-hero]"), $("[data-buttons]")].filter(Boolean).forEach((zone) => {
    watchVisibility(zone, (visible) => (visible ? live.add(zone) : live.delete(zone)), { threshold: 0.3 });
  });
  return live;
}

function isTyping(target) {
  return Boolean(target.closest?.("input, textarea, select, [contenteditable], dialog[open]"));
}

function pressKeycap(letter) {
  const keycap = $("[data-keycap]");
  if (!keycap) return;
  keycap.textContent = letter;
  keycap.classList.add("is-down");
  setTimeout(() => keycap.classList.remove("is-down"), KEY_DOWN_MS);
}

function startKeys() {
  const live = keyZones();
  const toggle = $("[data-keys-toggle]");
  let lastSave = 0;
  addEventListener("keydown", (event) => {
    if (!live.size || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (toggle && !toggle.checked) return;
    if (!/^[a-z0-9]$/i.test(event.key) || isTyping(event.target)) return;
    if (event.timeStamp - lastSave < KEY_COOLDOWN_MS) return;
    lastSave = event.timeStamp;
    const letter = event.key.toUpperCase();
    pressKeycap(letter);
    save({ source: "keyboard", label: `${letter} key` });
  });
}

// ───────── A game controller is a shutter ─────────

function startGamepads() {
  if (!("getGamepads" in navigator)) return;
  const wasPressed = new Map();
  let polling = false;
  let lastSave = 0;

  const poll = (now) => {
    const pads = [...navigator.getGamepads()].filter(Boolean);
    let pressed = false;
    pads.forEach((pad) => {
      const before = wasPressed.get(pad.index) ?? [];
      pad.buttons.forEach((button, index) => { if (button.pressed && !before[index]) pressed = true; });
      wasPressed.set(pad.index, pad.buttons.map((button) => button.pressed));
    });
    if (pressed && now - lastSave > PAD_COOLDOWN_MS) {
      lastSave = now;
      save({ source: "controller", label: "Game controller" });
    }
    polling = pads.length > 0;
    if (polling) requestAnimationFrame(poll);
  };

  addEventListener("gamepadconnected", () => {
    showMessage("Controller connected. Press any button to save.", 3200);
    if (!polling) {
      polling = true;
      requestAnimationFrame(poll);
    }
  });
}

export function startSaves() {
  startKeys();
  startGamepads();
}
