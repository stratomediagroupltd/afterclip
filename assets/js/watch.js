// watch.js: the Apple Watch (tap to focus, hold for AE/AF lock, the Crown
// zooms, the remote saves) and the "any button" devices that light up
// whenever something saves.

import { $, $$, clamp, reducedMotion, scrub, setText, watchVisibility } from "./motion.js";
import { mirror } from "./mirror.js";
import { save } from "./saves.js";

const HOLD_TO_LOCK_MS = 550;
const FOCUS_SHOWS_MS = 1500;
const ZOOM = { min: 1, max: 2.4, perPixel: 0.012, perWheel: 0.004, perKey: 0.2 };
const ZOOM_LABEL_MS = 1100;
/** The remote's shutter in the screenshot keeps 20 seconds. */
const WATCH_SAVE_SECONDS = 20;
const SAVED_SHOWS_MS = 1300;
const DEVICE_LIT_MS = 900;
/** Focus stays on the picture, not its black margins. */
const FOCUS_AREA = { left: 24, right: 76, top: 18, bottom: 82 };

function startViewfinder() {
  const view = $("[data-watch-view]");
  if (!view) return;
  const hit = $("[data-watch-hit]", view);
  const box = $("[data-focus-box]", view);
  const badge = $("[data-lock-badge]", view);
  const video = $("[data-watch-video]", view);
  const zoomLabel = $("[data-watch-zoom]", view);
  const crown = $("[data-crown]");
  // The other watch's remote shows the same live view in its corner.
  const preview = $("[data-watch-preview]");
  const thumbnail = preview ? mirror(video, preview) : null;

  let onScreen = false;
  const update = () => {
    if (onScreen && !document.hidden && !reducedMotion.matches) video.play().catch(() => {});
    else video.pause();
  };
  // Fetch the clip and its poster well before the watch scrolls into view.
  watchVisibility(view, (near) => {
    if (!near || video.getAttribute("src")) return;
    video.poster = video.dataset.poster;
    if (preview) preview.style.backgroundImage = `url("${video.dataset.poster}")`;
    video.src = video.dataset.src;
  }, { rootMargin: "800px 0px" });
  watchVisibility(view, (visible) => { onScreen = visible; update(); });
  document.addEventListener("visibilitychange", update);

  // Tap to focus, hold to lock.
  let hideTimer = 0;
  let holdTimer = 0;
  let pending = null;
  const focusAt = ({ x, y }, lock) => {
    box.style.setProperty("--fx", `${x}%`);
    box.style.setProperty("--fy", `${y}%`);
    box.classList.remove("is-on", "is-locked");
    void box.offsetWidth;
    box.classList.add(lock ? "is-locked" : "is-on");
    badge.classList.toggle("is-on", lock);
    clearTimeout(hideTimer);
    if (!lock) hideTimer = setTimeout(() => box.classList.remove("is-on"), FOCUS_SHOWS_MS);
  };
  const pointAt = (event) => {
    const rect = view.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, FOCUS_AREA.left, FOCUS_AREA.right),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, FOCUS_AREA.top, FOCUS_AREA.bottom),
    };
  };
  hit.addEventListener("pointerdown", (event) => {
    clearTimeout(holdTimer);
    pending = pointAt(event);
    holdTimer = setTimeout(() => {
      if (pending) focusAt(pending, true);
      pending = null;
    }, HOLD_TO_LOCK_MS);
  });
  hit.addEventListener("pointerup", () => {
    clearTimeout(holdTimer);
    if (pending) focusAt(pending, false);
    pending = null;
  });
  ["pointerleave", "pointercancel"].forEach((type) => hit.addEventListener(type, () => { clearTimeout(holdTimer); pending = null; }));
  hit.addEventListener("contextmenu", (event) => event.preventDefault());
  hit.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    focusAt({ x: 50, y: 50 }, event.shiftKey);
  });

  // The Digital Crown zooms the picture (a scrubbed animation: see scrub).
  const magnify = scrub(video, [{ transform: `scale(${ZOOM.min})` }, { transform: `scale(${ZOOM.max})` }]);
  let zoom = ZOOM.min;
  let labelTimer = 0;
  const setZoom = (value) => {
    zoom = clamp(value, ZOOM.min, ZOOM.max);
    const shown = zoom < 1.05 ? "1" : zoom.toFixed(1);
    magnify((zoom - ZOOM.min) / (ZOOM.max - ZOOM.min));
    thumbnail?.setZoom(zoom);
    setText(zoomLabel, `${shown}×`);
    zoomLabel.classList.add("is-on");
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => zoomLabel.classList.remove("is-on"), ZOOM_LABEL_MS);
    crown.setAttribute("aria-valuenow", zoom.toFixed(1));
    crown.setAttribute("aria-valuetext", `${shown} times`);
  };
  let lastY = null;
  crown.addEventListener("pointerdown", (event) => { crown.setPointerCapture(event.pointerId); lastY = event.clientY; });
  crown.addEventListener("pointermove", (event) => {
    if (lastY === null) return;
    setZoom(zoom + (lastY - event.clientY) * ZOOM.perPixel);
    lastY = event.clientY;
  });
  ["pointerup", "pointercancel"].forEach((type) => crown.addEventListener(type, () => { lastY = null; }));
  crown.addEventListener("wheel", (event) => { event.preventDefault(); setZoom(zoom - event.deltaY * ZOOM.perWheel); }, { passive: false });
  crown.addEventListener("keydown", (event) => {
    const moves = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
    if (event.key in moves) setZoom(zoom + moves[event.key] * ZOOM.perKey);
    else if (event.key === "Home") setZoom(ZOOM.min);
    else if (event.key === "End") setZoom(ZOOM.max);
    else return;
    event.preventDefault();
  });
}

function startRemote() {
  const shutter = $("[data-watch-shutter]");
  const saved = $("[data-watch-saved]");
  if (!shutter || !saved) return;
  let timer = 0;
  shutter.addEventListener("click", () => {
    saved.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(() => saved.classList.remove("is-on"), SAVED_SHOWS_MS);
    save({ seconds: WATCH_SAVE_SECONDS, source: "watch", label: "Apple Watch" });
  });
}

const DEVICE_NAMES = {
  volume: "Volume Down",
  camera: "Camera Control",
  remote: "Bluetooth remote",
  keyboard: "Keyboard",
  controller: "Game controller",
  watch: "Apple Watch",
};

function startDevices() {
  const devices = $$("[data-device]");
  const timers = new Map();
  devices.forEach((device) => device.addEventListener("click", () => {
    save({ source: device.dataset.device, label: DEVICE_NAMES[device.dataset.device] });
  }));
  document.addEventListener("afterclip:save", (event) => {
    const device = devices.find((candidate) => candidate.dataset.device === event.detail.source);
    if (!device) return;
    device.classList.remove("is-hit");
    void device.offsetWidth;
    device.classList.add("is-hit");
    clearTimeout(timers.get(device));
    timers.set(device, setTimeout(() => device.classList.remove("is-hit"), DEVICE_LIT_MS));
  });
}

export function startWatch() {
  startViewfinder();
  startRemote();
  startDevices();
}
