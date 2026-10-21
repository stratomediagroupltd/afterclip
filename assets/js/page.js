// page.js — the page around the scenes: the nav, the FAQ, the film, and
// floating devices that rest while they're off screen.

import { $, $$, reducedMotion, watchVisibility } from "./motion.js";

// ───────── Nav ─────────

function startNav() {
  const nav = $("[data-nav]");
  if (!nav) return;
  const update = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", update, { passive: true });
  update();

  // The link for the section crossing the middle of the screen is current.
  const links = $$("[data-nav-link]", nav);
  const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const link = byId.get(entry.target.id);
      if (link) link.setAttribute("aria-current", String(entry.isIntersecting));
    });
  }, { rootMargin: "-50% 0px -50% 0px" });
  byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
}

// ───────── FAQ: answers that open, not jump ─────────

function startFaq() {
  $$("[data-faq] details").forEach((item) => {
    const summary = $("summary", item);
    const answer = $(".faq__answer", item);
    let running = null;
    let closing = false;
    summary.addEventListener("click", (event) => {
      if (reducedMotion.matches) return;
      event.preventDefault();
      running?.cancel();
      running = null;
      // A click while it closes changes its mind: it stays open.
      if (closing) {
        closing = false;
        return;
      }
      if (item.open) {
        closing = true;
        running = answer.animate(
          [{ height: `${answer.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }],
          { duration: 360, easing: "cubic-bezier(.4, 0, .2, 1)" },
        );
        running.onfinish = () => { item.open = false; closing = false; running = null; };
      } else {
        item.open = true;
        running = answer.animate(
          [{ height: "0px", opacity: 0 }, { height: `${answer.offsetHeight}px`, opacity: 1 }],
          { duration: 520, easing: "cubic-bezier(.16, 1, .3, 1)" },
        );
        running.onfinish = () => { running = null; };
      }
    });
  });
}

// ───────── The film ─────────

const FILM_CLOSES_AFTER_MS = 500;

function startFilm() {
  const film = $("[data-film]");
  if (!film || typeof film.showModal !== "function") {
    $$("[data-film-open]").forEach((button) => { button.hidden = true; });
    return;
  }
  const video = $("[data-film-video]", film);
  const close = () => { video.pause(); if (film.open) film.close(); };
  $$("[data-film-open]").forEach((button) => button.addEventListener("click", () => {
    if (!video.getAttribute("src")) {
      video.poster = video.dataset.poster;
      video.src = video.dataset.src;
    }
    film.showModal();
    video.currentTime = 0;
    video.play().catch(() => { /* The controls are there to start it. */ });
  }));
  $("[data-film-close]", film).addEventListener("click", close);
  film.addEventListener("click", (event) => { if (event.target === film) close(); });
  film.addEventListener("close", () => video.pause());
  video.addEventListener("ended", () => setTimeout(close, FILM_CLOSES_AFTER_MS));
}

// ───────── Nothing floats off screen ─────────

function startFloats() {
  $$(".float").forEach((element) => watchVisibility(element, (visible) => element.classList.toggle("is-away", !visible)));
}

export function startPage() {
  startNav();
  startFloats();
  startFaq();
  startFilm();
}
