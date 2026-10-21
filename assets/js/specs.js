// specs.js — the camera section. The phone stays put while the list goes by
// (on small screens, while you swipe its cards), and shows the app's own
// screen for whichever spec you're reading.

import { $, $$ } from "./motion.js";

const NARROW = matchMedia("(max-width: 899px)");

export function startSpecs() {
  const section = $("[data-specs]");
  if (!section) return;
  const specs = $$(".spec", section);
  const shots = $$("[data-shot]", section);
  const list = $("[data-specs-list]", section);

  let current = 0;
  const choose = (index) => {
    if (index === current || index < 0) return;
    current = index;
    specs.forEach((spec, at) => spec.classList.toggle("is-on", at === index));
    shots.forEach((shot, at) => shot.classList.toggle("is-on", at === index));
  };

  // The spec crossing the middle of the screen (or of the card row) is the one.
  let observer = null;
  const watch = () => {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) choose(specs.indexOf(entry.target)); });
    }, NARROW.matches ? { root: list, threshold: 0.6 } : { rootMargin: "-48% 0px -48% 0px" });
    specs.forEach((spec) => observer.observe(spec));
  };
  watch();
  NARROW.addEventListener("change", watch);
}
