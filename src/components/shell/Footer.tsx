// Static site footer — no state, no hydration. Rendered by Base.astro as
// plain `<Footer />` (no client:* directive): the markup below is exactly
// what ships in the HTML response.
//
// Four columns per the Direction B spec (§6.4): brand + tagline · Learn ·
// Topics · Fynoptic.
//
// Column-head font trap: `redesign.css` has an unscoped
//   h1, h2, h3, .slab-title, ... { font-family: var(--display-face) !important; }
// which applies everywhere, including here, and carries !important. A plain
// `.s-label` class (0 ids, 1 class, 0 elements) cannot out-rank that rule —
// !important beats non-!important regardless of specificity, and even a
// second !important rule would still need >= specificity to win. The heads
// below are matched by `.footer h2.s-label` (0 ids, 2 classes, 1 element),
// which is specific enough that the scoped !important override in
// redesign.css wins. See the "Footer column heads" block there.
//
// h2, not h3: pages whose only own heading is an <h1> (e.g. /bot, which is
// just "Fix-it Bot" + the chat UI) would otherwise jump straight from h1 to
// h3 here, skipping a level — a real axe `heading-order` violation caught by
// a11y.spec.ts. h2 keeps the footer's own internal levels (this + Topics +
// Fynoptic below) sequential no matter what heading level the page's main
// content last left off at, since decreasing by any amount is always valid
// and increasing by more than one from <h1> is the only thing that isn't.
//
// Links preserved from the old Footer.astro (courses, articles, flashcard,
// practice, the contact line) — see that file's history — plus About and
// the Fix-it Bot, which existed in the nav but never in the footer.
// /accessibility and /privacy (Phase 9) sit in this same "Fynoptic" column,
// alongside About and the contact line — the standard placement for
// legal/meta pages in a site footer.
export function Footer() {
  return (
    <footer className="footer">
      <div className="ft-grid">
        <div className="ft-col ft-brand">
          <a href="/" className="ft-wordmark" aria-label="Fynoptic Home">
            <img src="/assets/img/fynopticlogo.png" alt="Fynoptic logo" className="footer-logo" />
            <span>Fynoptic</span>
          </a>
          <p className="footer-tagline">
            Helping people identify and avoid junk fees, dark patterns, and subscription traps.
          </p>
        </div>

        <div className="ft-col">
          <h2 className="s-label">Learn</h2>
          <ul className="footer-links">
            <li><a href="/courses">Course</a></li>
            <li><a href="/articles">Articles</a></li>
            <li><a href="/flashcard">Flashcards</a></li>
            <li><a href="/practice">Practice</a></li>
          </ul>
        </div>

        <div className="ft-col">
          <h2 className="s-label">Topics</h2>
          <ul className="footer-links">
            <li><a href="/courseone#m1-title">Foundations</a></li>
            <li><a href="/courseone#m2-title">Pattern Families</a></li>
            <li><a href="/courseone#m3-title">Counter-Moves</a></li>
            <li><a href="/courseone#m4-title">Documentation &amp; Evidence</a></li>
          </ul>
        </div>

        <div className="ft-col">
          <h2 className="s-label">Fynoptic</h2>
          <ul className="footer-links">
            <li><a href="/about">About</a></li>
            <li><a href="/bot">Fix-it Bot</a></li>
            <li><a href="/accessibility">Accessibility</a></li>
            <li><a href="/privacy">Privacy</a></li>
          </ul>
          <p className="footer-contact">info@fynoptic.org</p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2026 Fynoptic. Educational content; examples are illustrative, not legal advice.</p>
      </div>
    </footer>
  );
}
