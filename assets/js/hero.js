// hero.js — the opening screen: AfterClip running on an iPhone, and a
// shutter that really saves.

import { $, reducedMotion, watchVisibility } from "./motion.js";
import { onSave, save, savedToast, showToast } from "./saves.js";

const CLIP_LIFETIME_MS = 3600;
/** The flying clip replays from this far before the tap. */
const REPLAY_LEAD_S = 3;

export function startHero() {
  const hero = $("[data-hero]");
  if (!hero) return;
  const device = $("[data-hero-device]", hero);
  const iphone = $("[data-iphone]", hero);
  const video = $("[data-hero-video]", hero);

  startVideo(video, hero);
  startShutter(device, iphone, video);
}

// ───────── The live view ─────────

/** Runs `work` once the page has loaded and the browser has a moment. */
function afterLoad(work) {
  const later = () => ("requestIdleCallback" in window ? requestIdleCallback(work, { timeout: 1500 }) : setTimeout(work, 200));
  if (document.readyState === "complete") later();
  else addEventListener("load", later, { once: true });
}

/** A visitor who hasn't touched, scrolled or pointed by now gets the clip anyway. */
const ENGAGED_AFTER_MS = 4000;
const ENGAGING = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"];

/** Runs `work` once the visitor does something, or after a few seconds. */
function whenEngaged(work) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    ENGAGING.forEach((type) => removeEventListener(type, go));
    work();
  };
  const timer = setTimeout(go, ENGAGED_AFTER_MS);
  ENGAGING.forEach((type) => addEventListener(type, go, { passive: true }));
}

// The poster (the clip's first frame) is what loads first. The clip follows
// once the page has loaded and the visitor is there: it never competes with
// the first paint, the page has settled before anything moves, and a visitor
// who leaves at once doesn't download its 1.6 MB.
function startVideo(video, hero) {
  if (reducedMotion.matches) return;
  let ready = false;
  let onScreen = false;
  const update = () => {
    if (!ready) return;
    if (!onScreen || document.hidden) {
      video.pause();
      return;
    }
    video.play().catch(() => { /* Low Power Mode and friends: the poster stays. */ });
  };
  afterLoad(() => whenEngaged(() => {
    video.src = video.dataset.src;
    ready = true;
    update();
  }));
  watchVisibility(hero, (visible) => { onScreen = visible; update(); });
  document.addEventListener("visibilitychange", update);
}

// ───────── The shutter ─────────

function startShutter(device, iphone, video) {
  const shutter = $("[data-shutter]", iphone);
  const ring = $("[data-shutter-ring]", iphone);
  const toasts = $("[data-phone-toasts]", iphone);
  let onScreen = false;
  watchVisibility(iphone, (visible) => { onScreen = visible; }, { threshold: 0.5 });

  shutter.addEventListener("click", () => save({ source: "shutter" }));

  onSave((detail) => {
    if (!onScreen) return false;
    if (!reducedMotion.matches) {
      ring.animate(
        [{ opacity: 1, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.55)" }],
        { duration: 700, easing: "cubic-bezier(.2, .8, .2, 1)" },
      );
    }
    showToast(toasts, savedToast({ seconds: detail.seconds }));
    flyClip(device, iphone, video, detail.seconds);
    return true;
  });
}

/** A little card that leaves the phone and plays the seconds before the tap. */
function flyClip(device, iphone, video, seconds) {
  if (reducedMotion.matches) return;
  $(".flyclip", device)?.remove();

  const card = document.createElement("figure");
  card.className = "flyclip";
  card.setAttribute("aria-hidden", "true");
  const clip = document.createElement("video");
  clip.muted = true;
  clip.playsInline = true;
  clip.src = video.currentSrc || video.dataset.src;
  const caption = document.createElement("p");
  const detail = document.createElement("span");
  caption.textContent = "In Photos";
  detail.textContent = `Starts ${seconds}s before your tap`;
  caption.append(detail);
  card.append(clip, caption);
  device.append(card);

  const area = device.getBoundingClientRect();
  const phone = iphone.getBoundingClientRect();
  const cardWidth = card.offsetWidth;
  const cardHeight = card.offsetHeight;
  const roomRight = innerWidth - phone.right > cardWidth + 40;
  const endX = roomRight ? phone.right - area.left + 28 : phone.right - area.left - cardWidth * 0.85;
  const endY = roomRight ? phone.top - area.top + phone.height * 0.42 : phone.bottom - area.top - cardHeight - 40;
  const startX = phone.left - area.left + phone.width / 2 - cardWidth / 2;
  const startY = phone.top - area.top + phone.height * 0.4 - cardHeight / 2;
  card.style.left = `${endX}px`;
  card.style.top = `${endY}px`;
  const dx = startX - endX;
  const dy = startY - endY;

  clip.addEventListener("loadedmetadata", () => {
    clip.currentTime = Math.max(0, video.currentTime - REPLAY_LEAD_S);
    clip.play().catch(() => {});
  }, { once: true });
  card.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(1.7)`, opacity: 0 },
    { transform: `translate(${dx}px, ${dy}px) scale(1.3)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(1.06) rotate(-5deg)`, offset: 0.62 },
    { transform: "none" },
  ], { duration: 950, easing: "cubic-bezier(.3, .7, .2, 1)" });

  setTimeout(() => {
    const out = card.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(12px) scale(0.94)" }], { duration: 420, fill: "forwards" });
    out.onfinish = () => card.remove();
  }, CLIP_LIFETIME_MS);
}
