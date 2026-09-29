/* ShieldTX "Fresh account" stepper. The section pins while the user scrolls through
   the steps that have content; the active step opens. hero-shader.js reads:
   graphics   — each step's graphic (data-graphic: wallet, shield, wallets)
   position() — where we are between them (0 = first step … n-1 = last), holding on
                each step and handing over across the middle of each change. */
(() => {
  const section = document.querySelector(".helps");
  if (!section) return;
  const stage = section.querySelector(".helps__stage");
  const steps = [...section.querySelectorAll(".step")].filter(s => s.querySelector(".step__body"));
  if (!steps.length) return;
  section.style.setProperty("--step-changes", Math.max(1, steps.length - 1));

  const clamp01 = t => Math.min(1, Math.max(0, t));

  function progress() {
    const distance = section.offsetHeight - stage.offsetHeight;
    return distance > 0 ? clamp01((scrollY - section.offsetTop) / distance) : 0;
  }

  function position() {
    const n = steps.length;
    if (n < 2) return 0;
    const g = Math.min(n - 1, Math.max(0, progress() * n - 0.5));
    const i = Math.min(n - 2, Math.floor(g));
    return i + clamp01((g - i - 0.1) / 0.8); // hold 10% at each end of a change
  }
  window.ShieldTXSteps = { graphics: steps.map(s => s.dataset.graphic || "wallet"), position, progress };

  let active = -1;
  function setActive(i) {
    if (i === active) return;
    active = i;
    steps.forEach((step, j) => {
      step.classList.toggle("is-open", j === i);
      step.querySelector(".step__btn").setAttribute("aria-expanded", j === i);
    });
  }

  function render() {
    setActive(Math.min(steps.length - 1, Math.floor(progress() * steps.length)));
  }

  // Clicking a step scrolls to where it's active.
  steps.forEach((step, i) => {
    step.querySelector(".step__btn").addEventListener("click", () => {
      const distance = section.offsetHeight - stage.offsetHeight;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: section.offsetTop + distance * (i + 0.5) / steps.length, behavior: reduce ? "auto" : "smooth" });
    });
  });

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
