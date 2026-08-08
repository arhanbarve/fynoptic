/**
 * Partner logo marquee — relocated from index.astro's full-width `.partners`
 * section (below the hero content, spanning the whole container) into the
 * hero's left column. Markup, classnames, images/alts, and the seamless
 * duplicate-logo-track loop are unchanged from the original; only the
 * surrounding width changed, from the full `.hero-content` container to
 * whatever the left grid column (`1.04fr` of the hero grid) leaves it.
 *
 * `.partners` / `.logo-card` etc. are styled in legacy.css (base marquee
 * mechanics) and redesign.css §6 (left-aligned kicker, opaque logo plates).
 * Both are unlayered `!important` rules keyed off these exact classnames —
 * renaming anything here would silently drop that styling. Nothing here
 * needs new CSS: redesign.css already removed `.partners`' old centered
 * `max-width: 1100px` cap in favor of filling its parent's width, and now
 * that parent is the narrower left column instead of the full container.
 *
 * `reveal-up delay-3` is unaffected by rendering inside a hydrated React
 * island: index.astro's `initReveal()` (`src/lib/reveal.ts`) finds this
 * element via `document.querySelectorAll` against the SSR'd HTML, which
 * exists as soon as the page parses regardless of hydration timing.
 */
export function PartnerStrip() {
  return (
    <div className="partners reveal-up delay-3">
      <div className="partners-head">
        <span className="partners-kicker">In partnership with</span>
      </div>

      <div className="logo-ticker" role="region" aria-label="Partner organizations">
        <div className="logo-track">
          <div className="logo-card">
            <img src="/assets/img/invesco.webp" alt="Invesco" />
          </div>
          <div className="logo-card">
            <img
              src="/assets/img/national-personal-finance-challenge-logo.webp"
              alt="National Personal Finance Challenge"
            />
          </div>
          <div className="logo-card">
            <img
              src="/assets/img/national-economic-challenge-logo.webp"
              alt="National Economic Challenge"
            />
          </div>
          <div className="logo-card">
            <img src="/assets/img/emory.webp" alt="Emory University" />
          </div>
          <div className="logo-card">
            <img src="/assets/img/gcee-logo.webp" alt="Partner organisation logo" />
          </div>

          {/* Duplicate once for seamless loop */}
          <div className="logo-card">
            <img src="/assets/img/invesco.webp" alt="Invesco" />
          </div>
          <div className="logo-card">
            <img
              src="/assets/img/national-personal-finance-challenge-logo.webp"
              alt="National Personal Finance Challenge"
            />
          </div>
          <div className="logo-card">
            <img
              src="/assets/img/national-economic-challenge-logo.webp"
              alt="National Economic Challenge"
            />
          </div>
          <div className="logo-card">
            <img src="/assets/img/emory.webp" alt="Emory University" />
          </div>
          <div className="logo-card">
            <img src="/assets/img/gcee-logo.webp" alt="Partner organisation logo" />
          </div>
        </div>
        <div className="ticker-glow" aria-hidden="true" />
      </div>
    </div>
  );
}

export default PartnerStrip;
