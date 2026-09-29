/* ShieldTX text entrances.
   [data-reveal="load"] plays once the page is on screen; [data-reveal="view"] plays
   when the block scrolls into view. Inside a block:
   .dither  — characters switch on in a random order with a short flicker, line by line
   .reveal  — fades up out of a slight blur
   data-delay (ms) offsets either one. */
(() => {
  const LINE_STAGGER = 260;
  const SPREAD = 520;     // window each line's characters land in
  const CHAR_MS = 420;    // char-in duration (styles.css)
  const FADE_MS = 900;    // fade-up duration (styles.css)

  const blocks = document.querySelectorAll("[data-reveal]");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    blocks.forEach(b => b.classList.add("is-in"));
    return;
  }

  function splitChars(el, start) {
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
    const lines = el.querySelectorAll(".line");
    const targets = lines.length ? [...lines] : [el];
    targets.forEach((line, li) => {
      const words = line.textContent.trim().split(/\s+/);
      line.textContent = "";
      line.setAttribute("aria-hidden", "true");
      words.forEach((word, wi) => {
        if (wi) line.append(" ");
        const w = document.createElement("span");
        w.className = "word";
        for (const ch of word) {
          const c = document.createElement("span");
          c.className = "char";
          c.textContent = ch;
          c.style.animationDelay = `${start + li * LINE_STAGGER + Math.random() * SPREAD}ms`;
          w.append(c);
        }
        line.append(w);
      });
    });
    return start + (targets.length - 1) * LINE_STAGGER + SPREAD + CHAR_MS;
  }

  function prepare(block) {
    let end = 0;
    block.querySelectorAll(".dither").forEach(el => {
      end = Math.max(end, splitChars(el, +(el.dataset.delay || 0)));
    });
    block.querySelectorAll(".reveal").forEach(el => {
      const d = +(el.dataset.delay || 0);
      el.style.animationDelay = `${d}ms`;
      end = Math.max(end, d + FADE_MS);
    });
    return end;
  }

  function play(block, end) {
    block.classList.add("is-playing");
    // Always settle to fully visible afterwards.
    setTimeout(() => {
      block.classList.remove("is-playing");
      block.classList.add("is-in");
    }, end + 200);
  }

  const inView = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      inView.unobserve(e.target);
      play(e.target, e.target._revealEnd);
    });
  }, { threshold: 0.35 });

  const whenVisible = fn => {
    if (document.visibilityState === "visible") return fn();
    document.addEventListener("visibilitychange", function once() {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", once);
      fn();
    });
  };

  blocks.forEach(block => {
    const end = prepare(block);
    if (block.dataset.reveal === "load") whenVisible(() => play(block, end));
    else { block._revealEnd = end; inView.observe(block); }
  });
})();
