// Scroll-triggered "arrive late" reveal animations. The legacy inline copies
// (index.html, three near-duplicates around lines 294/298/334, plus js/app.js
// ~278) used `threshold: 0.6` (or 0.45/0.1), which never fires for a section
// taller than the viewport since it can never reach 60% visibility. This
// version uses `threshold: 0` so any intersection at all reveals the section.
const SELECTOR =
  '.fade-up, .reveal, .reveal-up, .reveal-card, .reveal-section, .reveal-prism, .reveal-cta, .reveal-in';

export function initReveal(): void {
  const els = document.querySelectorAll<HTMLElement>(SELECTOR);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    },
    { threshold: 0, rootMargin: '0px 0px -10% 0px' }
  );

  els.forEach((el) => io.observe(el));
}
