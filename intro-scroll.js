/* ShieldTX intro — scroll progress through the pinned hero, and the copy handoff.
   0 = top of page, 1 = zoomed into the shield. hero-shader.js reads progress()
   to drive the zoom; this file fades the hero copy out and the next heading in. */
(() => {
  const intro = document.querySelector(".intro");
  if (!intro) return;
  const copy = intro.querySelector(".hero__content");
  const next = intro.querySelector(".hero__zoom");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const clamp01 = t => Math.min(1, Math.max(0, t));
  const range = (p, a, b) => clamp01((p - a) / (b - a));
  const ease = t => 1 - Math.pow(1 - t, 3);

  function progress() {
    const distance = intro.offsetHeight - intro.querySelector(".hero").offsetHeight;
    return distance > 0 ? clamp01((scrollY - intro.offsetTop) / distance) : 0;
  }
  // 0 → 1 while the section after the intro scrolls up to the top of the screen.
  const nextSection = intro.nextElementSibling;
  function after() {
    if (!nextSection) return 0;
    return clamp01(1 - nextSection.getBoundingClientRect().top / innerHeight);
  }
  window.ShieldTXIntro = { progress, after };

  function render() {
    const p = progress();
    const still = reduceMotion.matches;

    const out = ease(range(p, 0, 0.22));        // hero copy leaves
    copy.style.opacity = 1 - out;
    copy.style.transform = still ? "" : `translateY(${-48 * out}px)`;
    copy.style.visibility = out >= 1 ? "hidden" : "";

    const inn = ease(range(p, 0.62, 0.9));      // next heading arrives as the zoom settles
    next.style.opacity = inn;
    next.style.transform = still ? "" : `scale(${0.94 + 0.06 * inn})`;
    next.style.filter = still || inn >= 1 ? "" : `blur(${(1 - inn) * 10}px)`;
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  render();
})();
