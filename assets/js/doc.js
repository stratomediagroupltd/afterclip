// doc.js — reading pages: the nav turns to glass once you scroll.

const nav = document.querySelector("[data-nav]");
const updateNav = () => nav?.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", updateNav, { passive: true });
updateNav();
