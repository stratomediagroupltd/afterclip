// match.js — "The whole match. Except the goal." Two phones play the same
// penalty: one clip, which the Camera's screen draws from AfterClip's
// (mirror.js), so the two are always on the same frame. The one filming everything has been recording for 89:40 when its
// storage runs out, a beat before the kick: the Camera stops while the game
// goes on. AfterClip keeps only the last minute, so it has room, and a tap on
// its shutter saves the goal.

import { $, clamp, reducedMotion, scrub, setText, watchVisibility } from "./motion.js";
import { mirror } from "./mirror.js";
import { savedToast, showToast } from "./saves.js";

// Moments in the clip, in seconds. The defaults fit clips cut so the moment
// lands at about 7.0 s (assets/video/match.mp4: the ball is in the net); a
// page can set its own on [data-match]: data-full-at, data-tap-at,
// data-saved-at, data-end, and data-recorded for the Camera's clock.
const STORY = {
  /** Just before the moment: storage runs out here. */
  fullAt: 6.0,
  /** After the moment, someone taps AfterClip's shutter. */
  tapAt: 7.35,
  savedAt: 7.7,
  end: 9.3,
  /** The Camera has been recording this long when the story starts. */
  recorded: 89 * 60 + 40,
};
/** Used storage climbs to the point where iOS refuses to record any more. */
const USED_FROM_GB = 247;
const USED_TO_GB = 255.94;
/** Photos is drawn at its final size and scaled; the rest of the bar moves along. */
const PHOTOS_TO_GB = 214.54;
const REST_GB = 41.4;
const GROWTH_GB = USED_TO_GB - USED_FROM_GB;
/** AfterClip's buffer is a minute; it fills at the start, then just rolls. */
const BUFFER_SECONDS = 60;
const BUFFER_FILLS_IN_S = 3;
const SAVED_SECONDS = 15;
const TOAST_SHOWS_MS = 2600;
const PLAYS_WHEN_VISIBLE = 0.55;

const clock = (seconds) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  .map((part) => String(part).padStart(2, "0")).join(":");
/** The app's own way: 45 → "45s", 60 → "1:00". */
const buffered = (seconds) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);

/** The story's moments, with any the page sets in place of the defaults. */
const storyOf = (match) => Object.fromEntries(Object.entries(STORY).map(([key, fallback]) => {
  const value = Number.parseFloat(match.dataset[key]);
  return [key, Number.isFinite(value) && value >= 0 ? value : fallback];
}));

export function startMatch() {
  const match = $("[data-match]");
  if (!match) return;
  const { fullAt: STORAGE_FULL_AT, tapAt: TAP_AT, savedAt: SAVED_AT, end: STORY_END, recorded: RECORDING_BEFORE_S } = storyOf(match);
  const cameraFeed = $("[data-match-mirror]", match);
  const afterclip = $('[data-match-video="afterclip"]', match);
  mirror(afterclip, cameraFeed);
  const parts = {
    cam: $("[data-cam]", match),
    thumb: $(".cam__thumb", match),
    timer: $("[data-match-clock]", match),
    used: $("[data-storage-used]", match),
    seconds: $("[data-hud-seconds]", match),
    shade: $("[data-hud-shade]", match),
    touch: $("[data-hud-touch]", match),
    ring: $("[data-hud-ring]", match),
    toasts: $("[data-match-toasts]", match),
    replay: $("[data-match-replay]", match),
  };
  const duel = $(".duel", match);
  // Everything that moves with the clips is a scrubbed animation (see scrub).
  const seekPhotos = scrub($("[data-storage-photos]", match), [
    { transform: `scaleX(${((PHOTOS_TO_GB - GROWTH_GB) / PHOTOS_TO_GB).toFixed(5)})` }, { transform: "none" },
  ]);
  const seekRest = scrub($("[data-storage-rest]", match), [
    { transform: `translateX(${(-(GROWTH_GB / REST_GB) * 100).toFixed(3)}%)` }, { transform: "none" },
  ]);
  const seekFill = scrub($("[data-hud-fill]", match), [{ transform: "translateX(-100%)" }, { transform: "none" }]);

  // The phone filming everything: its clock runs on, its storage fills up.
  const showRecording = (time) => {
    const share = clamp(time / STORAGE_FULL_AT);
    setText(parts.timer, clock(RECORDING_BEFORE_S + Math.floor(Math.min(time, STORAGE_FULL_AT))));
    seekPhotos(share);
    seekRest(share);
    setText(parts.used, `${(USED_FROM_GB + share * GROWTH_GB).toFixed(2)} GB`);
  };
  // AfterClip: its buffer fills to a minute, then just keeps rolling.
  const showBuffer = (time) => {
    const share = clamp(time / BUFFER_FILLS_IN_S);
    setText(parts.seconds, buffered(Math.round(share * BUFFER_SECONDS)));
    seekFill(share);
  };
  const setFull = (full) => parts.cam.classList.toggle("is-full", full);

  // A tap on the shutter: the touch, the face darkening, the ring, the toast.
  const tap = () => {
    if (reducedMotion.matches) return;
    const at = { transform: "translate(-50%, -50%)" };
    parts.touch.animate([
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
      { opacity: 1, ...at, offset: 0.3 },
      { opacity: 1, ...at, offset: 0.7 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.1)" },
    ], { duration: 520, easing: "ease-out" });
    parts.shade.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
  };
  const flash = () => {
    if (!reducedMotion.matches) {
      parts.ring.animate(
        [{ opacity: 1, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.55)" }],
        { duration: 700, easing: "cubic-bezier(.2, .8, .2, 1)" },
      );
    }
    showToast(parts.toasts, savedToast({ seconds: SAVED_SECONDS }), TOAST_SHOWS_MS);
  };

  let state = "idle";
  let full = false;
  let tapped = false;
  let saved = false;
  let frame = 0;

  // Both clips play on to the end; only the Camera's recording stops.
  const tick = () => {
    if (state !== "playing") return;
    const time = afterclip.currentTime;
    if (!full && time >= STORAGE_FULL_AT) {
      full = true;
      setFull(true);
    }
    showRecording(full ? STORAGE_FULL_AT : time);
    showBuffer(time);
    if (!tapped && time >= TAP_AT) {
      tapped = true;
      tap();
    }
    if (!saved && time >= SAVED_AT) {
      saved = true;
      flash();
    }
    if (time >= STORY_END || afterclip.ended) {
      // A clip that ends early still gets its storage-full and its save.
      if (!full) {
        full = true;
        setFull(true);
        showRecording(STORAGE_FULL_AT);
      }
      if (!tapped) tap();
      if (!saved) flash();
      tapped = true;
      saved = true;
      afterclip.pause();
      state = "done";
      parts.replay.hidden = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const load = () => {
    // The Camera's last recording, in its corner: this page's own clip.
    const poster = `url("${cameraFeed.dataset.poster}")`;
    if (!parts.thumb.style.backgroundImage) parts.thumb.style.backgroundImage = poster;
    if (!cameraFeed.style.backgroundImage) cameraFeed.style.backgroundImage = poster;
    if (afterclip.dataset.poster && !afterclip.getAttribute("poster")) afterclip.poster = afterclip.dataset.poster;
    if (afterclip.getAttribute("src")) return;
    // Buffering starts now, before the phones are on screen.
    afterclip.preload = "auto";
    afterclip.src = afterclip.dataset.src;
  };

  const run = () => {
    state = "playing";
    afterclip.play().then(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    }).catch(showOutcome);
  };

  const restart = () => {
    load();
    full = false;
    tapped = false;
    saved = false;
    setFull(false);
    parts.replay.hidden = true;
    afterclip.currentTime = 0;
    showRecording(0);
    showBuffer(0);
    run();
  };

  // Without motion (or if the clips can't play), show how it ends.
  function showOutcome() {
    state = "done";
    load();
    showRecording(STORAGE_FULL_AT);
    showBuffer(BUFFER_FILLS_IN_S);
    setFull(true);
    if (!parts.toasts.children.length) parts.toasts.append(savedToast({ seconds: SAVED_SECONDS }));
    const settle = () => { afterclip.currentTime = STORY_END; };
    if (afterclip.readyState >= 1) settle();
    else afterclip.addEventListener("loadedmetadata", settle, { once: true });
  }

  showRecording(0);
  showBuffer(0);
  if (reducedMotion.matches) {
    watchVisibility(duel, (visible) => { if (visible && state === "idle") showOutcome(); });
    return;
  }

  // Fetch the clip well before it's needed; play while it's on screen.
  watchVisibility(duel, (near) => { if (near) load(); }, { rootMargin: "800px 0px" });
  watchVisibility(duel, (visible) => {
    if (visible) {
      if (state === "idle") restart();
      else if (state === "paused") run();
      return;
    }
    if (state === "playing") {
      state = "paused";
      cancelAnimationFrame(frame);
      afterclip.pause();
    }
  }, { threshold: PLAYS_WHEN_VISIBLE });
  parts.replay.addEventListener("click", restart);
}
