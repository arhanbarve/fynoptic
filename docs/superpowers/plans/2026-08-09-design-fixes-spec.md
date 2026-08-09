# Design Fixes — Specification & Implementation Plan

**Branch:** `redesign-react` (worktree at `.claude/worktrees/redesign-react`)
**Date:** 2026-08-09
**Status:** APPROVED 2026-08-09 — no code changes made yet
**Runbook:** `2026-08-09-design-fixes-implementation-plan.md` (execution order, agent
dispatch, verification gates)
**Approved artifact:** https://claude.ai/code/artifact/e8e33bde-6d77-4715-a20a-418aa82b019d

---

## 0. Scope & ground rules

Thirteen user-reported items, delivered as nine commits on `redesign-react`. Nothing merges to
`main`. Every commit runs the full unit + e2e suite, not just its own specs.

### 0.1 Decisions already made (do not re-litigate)

| Decision | Choice |
|---|---|
| Artifact gate | Approved 2026-08-09. §02 and §08 amended (see 0.2). |
| Logo sizing | One fixed box in both themes; plate paints inside it. |
| Nav button shape | Signed-out **and** signed-in both rectangular, 6px radius. |
| Wordmark font | Helvetica, **header and footer** (one token change). |
| Auth dialog | Merge login + signup into one tabbed dialog. Update the tests. |
| Reset-password | Stays a separate dialog behind "Forgot your password?". |
| Rack | Keep the pin, shorten it to ~2.1 screens, pane 100vh → 68vh. |
| Courses animation | Padlock hover-reveal. **No** progress wiring. |
| Flashcards | Redo step 1's unit list only. Keep the 3-step wizard. |
| Unit row colour | One distinct hue per unit (identity); progress shown as a separate bar. |
| Articles controls | Genuinely sticky **and** collapse to a compact bar once stuck. |
| Practice | Redesign all 3 wizard steps as one coherent flow. |
| Capitalization sweep | Approved. Commit the 88 staged strings as-is. |
| Branch strategy | Staged commits on `redesign-react`. Do not merge to `main`. |

### 0.2 Amendments from artifact review (2026-08-09)

1. **§02** — Submit button centred inside the dialog. Already `justify-content:center` in the
   mockup; promoted to an explicit acceptance check (AC-6.4) so it cannot regress.
2. **§08** — The "About Fynoptic" heading **and the mission paragraph are cut entirely.** The
   page opens directly on Meet the Founders. This reverses the earlier "mission paragraph only"
   decision and makes the heading-consistency fix pure CSS rather than a restructure.

### 0.3 Corrections to claims made in the artifact

I measured the running site (Playwright, 1440×900, `localhost:4321`) after publishing the
artifact. Four things I asserted there were wrong. They are corrected below and the corrected
values govern this spec.

| Artifact said | Measured reality | Consequence |
|---|---|---|
| Logo is 26px dark / 34px light | **40px dark / 48px light** | The fix must target `.header .logo img`, not `.logo img` — see 1.1. |
| Header is 56px | **61px dark / 69px light** | `--header-h: 56px` is wrong by 5px and propagates. See 1.4. |
| `.articles-hero` has up to 80px top padding | **0px** — it is clobbered | Root cause is different, and the symptom is the opposite. See §3 and §10. |
| `articles.spec.ts` may need selector updates | Uses ids only | **Zero changes needed.** See 3.5. |

Measurement transcript is reproduced in Appendix A.

---

## 1. Navbar — constant height, rectangular controls, Helvetica wordmark

**Commit 2.** Files: `src/styles/redesign.css`, `tests/e2e/typography.spec.ts`,
`tests/e2e/shell.spec.ts` (new assertions).

### 1.1 Header height shift (the reported bug)

**Measured:** header is **61.0px** in dark and **69.0px** in light. Delta 8.0px.

**Cause chain — two rules, not one:**

1. `legacy.css:3155` — `.header .logo img { height: 40px; width: auto; display: block; }`
2. `redesign.css:85` — `.logo img { width: 26px; height: 26px; ... }`

Rule 1 has specificity (0,2,1); rule 2 has (0,1,1). **Legacy wins**, so the mark renders at 40px,
not the 26px the redesign layer intends. The redesign rule has been dead since it was written.

3. `redesign.css:89-95` — under `[data-theme="light"]` the mark gains `padding: 4px` with
   `box-sizing: content-box`, so the border box becomes 48px. The plate exists for a real reason
   (white F on transparent artwork is invisible on a light bar); the bug is that it *grows the
   box* instead of fitting inside it.

Header height = `nav padding-block (10px × 2)` + tallest child. In dark the tallest child is the
40px mark → 60px + 1px border = 61. In light it is the 48px mark → 68 + 1 = 69.

**Fix.** Replace `redesign.css:85-95` with a single specificity-correct block:

```css
/* Specificity note: legacy.css:3155 is `.header .logo img` (0,2,1) and was
   silently beating the old bare `.logo img` rule here, which is why the mark
   rendered at 40px rather than the 26px this layer asked for. Matching that
   selector is what makes this rule take effect at all.

   The plate is painted INSIDE a fixed border box rather than added around a
   content box: under the old `content-box` + `padding:4px` pairing the light
   theme's mark occupied 48px against dark's 40px, which is the 8px header
   height shift between themes. */
.header .logo img,
.header .logo img:is([src]) {
  width: 32px;
  height: 32px;
  padding: 3px;
  box-sizing: border-box;      /* was content-box — this is the actual fix */
  object-fit: contain;
  display: block;
  background: transparent;      /* dark: no plate, but the same occupied box */
  border-radius: 5px;
}
:is(html[data-theme="light"], body[data-theme="light"]) .header .logo img {
  background: var(--db-plate);  /* light: plate paints inside the same 32px */
}
```

The footer mark (`redesign.css:99-101`) keeps its existing 24px treatment — it is not in a
height-critical bar and was not reported.

**Belt and braces.** Add, so no future child can shift the bar again:

```css
html body .header .nav { min-height: 36px; }   /* 36 + 2×10 padding + 1 border = 57 floor */
```

### 1.2 Sign In button shape

**Measured:** `#user-btn` computed `border-radius: 16px`; `#theme-btn` computed `6px`.

**Cause:** `redesign.css:783` — `html body .header .user-icon[data-modal-open] { border-radius: 16px }`.

**Fix:** `16px` → `6px`. Nothing else in that rule changes; `background-position: 8px center`,
the glyph background-image, and the `padding: 0 12px 0 30px` all stay.

### 1.3 Signed-in avatar shape

**Cause:** `redesign.css` §9 sets `border-radius: 50%` on `#nav-avatar` and `#nav-initials`.

**Fix:** both → `6px`, per the decision to make every nav control rectangular.

> **Flagged once, then dropped:** this square-crops a real profile photo. You chose it knowing
> that. Not raising it again.

### 1.4 `--header-h` is wrong (latent bug found while measuring)

`redesign.css:32` declares `--header-h: 56px`. The header is actually 61px. Three consumers read
that token and are therefore all off by 5px:

| Consumer | Effect of the 5px error |
|---|---|
| `RackFocus.tsx:70-75` `readHeaderHeightPx()` | The pinned pane's `top` sits 5px under the header, so 5px of rack content hides behind the bar. |
| `redesign.css:794` `#progress-sidebar` | The course rail's top offset is 5px high. |
| `legacy.css:1671` `.controls` | Already separately broken — see §3. |

**Fix:** `--header-h: 57px` (matching the `min-height` floor established in 1.1, which becomes the
true stable height once the logo is 32px: `32 + 20 + 1 = 53`, floored to 57 by the `min-height`).

> **Verify empirically before committing this number.** After the 1.1 change lands, measure the
> real height in both themes and set `--header-h` to the measured value. Do not guess.

### 1.5 Wordmark → Helvetica

`redesign.css:27` — `--wordmark-face: var(--editorial-face)` → `var(--display-face)`.

One line. Covers `.logo-text` (`redesign.css:106`) and `.footer .ft-wordmark`
(`redesign.css:703`) simultaneously, which is what "both header and footer" means.

### 1.6 Test impact

| Spec | Change |
|---|---|
| `tests/e2e/typography.spec.ts:12` | **BREAKS.** Asserts `.logo-text` computed font contains `Spectral`. Rewrite to assert `Helvetica`, and rename the test from `logo wordmark renders in Spectral`. |
| `tests/e2e/typography.spec.ts` header comment (lines 3-6) | Update — it documents `--wordmark-face` as "an alias of `--editorial-face`", which stops being true. |
| `tests/e2e/shell.spec.ts` | **NEW test:** header `getBoundingClientRect().height` is identical in light and dark (see AC-1.1). |

### 1.7 Acceptance criteria

- **AC-1.1** `.header` bounding height is byte-identical between `data-theme="light"` and
  `data-theme="dark"` at widths 390 / 900 / 1440. Asserted in `shell.spec.ts`.
- **AC-1.2** `.header .logo img` computed border box is `32×32` in both themes.
- **AC-1.3** In light theme, the mark's computed `background-color` is `--db-plate`, i.e. the
  white F is still legible. In dark it is `transparent`.
- **AC-1.4** `#user-btn`, `#theme-btn`, `#nav-avatar`, `#nav-initials` and the header
  `.btn-primary` all compute `border-radius: 6px`.
- **AC-1.5** `.logo-text` and `.footer .ft-wordmark` computed font-family contains `Helvetica`
  and does not contain `Spectral`.
- **AC-1.6** `getComputedStyle(document.documentElement).getPropertyValue('--header-h')` parsed as
  px equals the measured `.header` height, ±1px, in both themes.

---

## 2. Articles page — sticky containing block, offsets, gaps, collapse

**Commit 3.** Files: `src/pages/articles.astro`, `src/styles/redesign.css`,
`src/components/articles/ArticlesBrowser.tsx` (sentinel only).

### 2.1 The search bar slides under the navbar (the reported bug — CONFIRMED)

**Measured at `scrollY = 1200`:** `.controls` top = **−856.1px**, header bottom = **61px**. The
bar is 856px above the viewport — it did not stick at all, it scrolled away entirely.

**Cause:** `legacy.css:1669` declares `.controls { position: sticky; top: calc(64px + 8px) }`, but
`articles.astro:33` nests `.controls` inside `.articles-hero`. A sticky element cannot leave its
containing block. `.articles-hero` ends 0px after the controls
(measured: hero bottom 278.9, controls bottom 278.9), so the sticky range is zero-length.

**Secondary defect in the same rule:** `top` is hardcoded `calc(64px + 8px)` = 72px against a bar
that is actually 61px. Wrong even when it does stick.

**Fix — structural, in `articles.astro`:**

```
BEFORE                                  AFTER
<section class="articles-hero">         <section class="articles-hero">
  <h1>…</h1>                              <h1>…</h1>
  <p>…</p>                                <p>…</p>
  <div class="controls">…</div>         </section>
</section>                              <div id="controls-sentinel" aria-hidden="true"></div>
<section class="container">             <section class="container" aria-label="Article results">
  <div id="articles-grid">…</div>         <div class="controls">…</div>
</section>                                <div id="articles-grid">…</div>
                                        </section>
```

`.controls` moves into the results section, whose containing block spans all 244 cards
(measured height 33,583px), giving the sticky a real range.

**Fix — CSS, in `redesign.css` (new rule; do not edit `legacy.css:1669` — the redesign layer is
where overrides live):**

```css
html body .controls {
  top: calc(var(--header-h) + 8px) !important;   /* was hardcoded 64px + 8px */
  margin-bottom: 24px;                            /* the missing gap to the grid */
}
```

### 2.2 No gap between the search bar and the grid (CONFIRMED)

**Measured:** grid top 278.9, controls bottom 278.9 → **0px**.

**Fix:** the `margin-bottom: 24px` above.

### 2.3 Collapse-on-stick

A zero-height sentinel `<div id="controls-sentinel">` sits immediately above `.controls`. An
`IntersectionObserver` with `rootMargin: '-{headerH + 8}px 0px 0px 0px'` flips
`data-stuck="true"` on `.controls` when the sentinel leaves the top of the viewport.

Owner: `ArticlesBrowser.tsx` — it already runs `client:load` on this page, already reads the
existing DOM rather than rendering it, and already returns `null`. Adding one observer effect
there fits its established shape exactly. **No new island.**

```css
html body .controls[data-stuck="true"] {
  padding: .45rem .6rem;
  box-shadow: 0 8px 24px rgba(var(--shadow-rgb), .3);
  transition: padding .18s ease, box-shadow .18s ease;
}
html body .controls[data-stuck="true"] .search-wrap { padding: .38rem .65rem; }
html body .controls[data-stuck="true"] .sort select,
html body .controls[data-stuck="true"] .chip { padding-block: .3rem; }
@media (prefers-reduced-motion: reduce) {
  html body .controls { transition: none !important; }
}
```

Transition is on `padding` and `box-shadow` only — both compositor-cheap and neither triggers a
grid reflow of 244 cards.

### 2.4 The heading gap — RESOLVED 2026-08-09

**Reported:** "the gap between Articles & Guides and the navbar is too big."
**Measured:** the gap is **0px** — the heading sits flush against the bar. Confirmed in both
themes at 1440×900 (`scratchpad/articles-dark.png`, `articles-light.png`).

**Resolution (user, 2026-08-09):** *"it needs a gap."* So the intent was that the spacing is
wrong, not that it is oversized. Add one.

**Cause.** `legacy.css:1653` sets `.articles-hero { padding: min(7vh,5rem) 0 1rem }`, which would
give ~63px at a 900px viewport. But `.articles-hero` is `class="articles-hero container"`, and
`legacy.css:5825` — **4,172 lines later** — redeclares `.container { … padding: 0 var(--gutter) }`
as a *shorthand*. Equal specificity (one class each), later source order, so the shorthand resets
`padding-block` to zero and silently discards the hero's intended vertical rhythm.

This is the same duplicate-rule pathology the redesign layer exists to contain: two `.container`
declarations 4,000 lines apart in one 6,800-line sheet.

**Fix** — in `redesign.css`, not `legacy.css`. Use `padding-block` (a longhand) so a future
`.container` *shorthand* cannot silently clobber it the way it clobbered the original:

```css
/* legacy.css:1653 asks for min(7vh,5rem) of top padding here and never gets it:
   `.articles-hero` is also `.container`, and legacy.css:5825 redeclares
   `.container { padding: 0 var(--gutter) }` as a SHORTHAND 4,172 lines later,
   which resets padding-block to 0 at equal specificity. Result was a heading
   flush against the nav bar. Longhand + the redesign layer's precedence so the
   same collision cannot recur. Bottom padding is smaller than legacy's because
   `.controls` no longer lives inside this section (see 2.1). */
html body .articles-hero {
  padding-block: clamp(2rem, 4.5vh, 3rem) 1.5rem !important;
}
```

At 900px viewport height this resolves to **40.5px** above the h1 — roughly one line of body copy,
matching the breathing room `.hero` gets on the homepage (`redesign.css:229`).

**Do not** instead delete or edit `legacy.css:5825`. That rule is load-bearing for every
`.container` on the site and this is not the commit to find out how.

### 2.5 Test impact

`tests/e2e/articles.spec.ts` was audited line by line. Every selector it uses is an **id** or the
`.article-card` class:

```
#search-input   #sort-select   #result-count   #empty-state
#clear-filters  #load-more     .article-card   [data-title]
```

None of these move, change, or are re-parented by 2.1. **`articles.spec.ts` needs zero changes.**
This corrects the warning I gave in the artifact.

`tests/e2e/articles-read.spec.ts` — same audit, same result, no changes.

**NEW test** in `articles.spec.ts`: at `scrollY = 1200`, `.controls`'s bounding rect `top` is
`>= .header`'s bounding rect `bottom`. That is the regression guard for the actual bug.

### 2.6 Acceptance criteria

- **AC-2.1** At `scrollY ∈ {600, 1200, 5000}`, `.controls.top >= .header.bottom`. Never overlaps.
- **AC-2.2** `.controls` remains visible (in-viewport) at all three scroll positions.
- **AC-2.3** Gap between `.controls.bottom` and `#articles-grid.top` is 24px ±1 at rest.
- **AC-2.4** `data-stuck` is absent at `scrollY = 0` and present at `scrollY = 1200`.
- **AC-2.5** All existing `articles.spec.ts` and `articles-read.spec.ts` tests pass **unmodified**.
- **AC-2.6** Gap between `.header.bottom` and `.articles-hero h1`'s `top` is **≥ 32px** at 1440×900
  in both themes (0px today). Asserted in `articles.spec.ts`.

---

## 3. Courses page — row gap, centred lock text, padlock hover

**Commit 4.** Files: `src/pages/courses.astro`, `src/styles/redesign.css`.

### 3.1 Row gap (CONFIRMED)

**Measured:** grid 1 bottom = 1098.6, grid 2 top = 1098.6 → **0px**.

**Cause:** `courses.astro:112` and `courses.astro:220` are two sibling `.courses-grid` elements.
`legacy.css:2440`'s `gap: 1.5rem` applies *within* a grid, never between two of them.

**Fix:** in `redesign.css`:

```css
html body .courses-grid + .courses-grid { margin-top: 2rem; }
```

Adjacent-sibling selector rather than a class on the second grid, so it stays correct if a third
row is ever added.

### 3.2 Lock text centring (CONFIRMED)

**Cause:** `legacy.css:2570` — `.course-card--soon .soon-mask` sets `display: grid` +
`place-items: center`, which centres the *box*. It never sets `text-align`, so the string wraps to
two lines and those lines align to `start`.

**Fix:** restructure the mask to a flex column and centre the text:

```css
html body .course-card--soon .soon-mask {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;          /* the actual fix */
  padding: 14px;
}
```

### 3.3 Padlock hover-reveal

`courses.astro` — each of the 7 `.soon-mask` elements gains a padlock SVG and a hint span:

```html
<div class="soon-mask" aria-hidden="true">
  <svg class="soon-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.7" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/>
    <path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/>
  </svg>
  <span>Available After Completing Course 1</span>
  <span class="soon-hint">Course 1 not started</span>
</div>
```

```css
html body .soon-lock { width: 26px; height: 26px; transition: transform .3s ease; }
html body .soon-hint {
  font-size: .68rem; font-weight: 500; letter-spacing: .02em; text-transform: none;
  color: var(--text-300);
  opacity: 0; transform: translateY(6px);
  transition: opacity .28s ease, transform .28s ease;
}
html body .course-card--soon:hover .soon-mask { /* mask lightens ~18% */ }
html body .course-card--soon:hover .soon-lock  { animation: soon-shake .5s ease; }
html body .course-card--soon:hover .soon-hint  { opacity: 1; transform: translateY(0); }

@keyframes soon-shake {
  0%,100% { transform: rotate(0) }   18% { transform: rotate(-9deg) }
  38% { transform: rotate(8deg) }    58% { transform: rotate(-5deg) }
  78% { transform: rotate(3deg) }
}
```

`redesign.css:352` already carries a global
`@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`, so the shake is
suppressed for free. The opacity/transform transitions on `.soon-hint` are **not** covered by that
rule — add an explicit `transition: none` under the same media query.

**Hint text.** You chose no progress wiring. Course 1's card is the only one with a real
`data-course-id`, so:
- Cards 2–8 render a static hint naming their prerequisite ("Course 1 not started").
- **Card 2 only** may read the existing `useCourseProgress` store to render
  "N of 6 sections done" — *if* that can be done without introducing new state. If it cannot be
  done cleanly, all 7 render the static string. This is the one place where "no wiring" and
  "useful hint" trade off; static is the fallback and needs no approval.

### 3.4 Capitalization

Per the approved D11 rule, the mask string becomes Title Case: "Available after completing course
1" → **"Available After Completing Course 1"**. This is already in the staged Phase 12 sweep — do
not double-apply. Verify against `docs/superpowers/plans/capitalization-changes.md` before editing.

### 3.5 Test impact

`tests/e2e/course.spec.ts` — audited, does not assert on `.soon-mask`, `.courses-grid`, or lock
text. No changes.

### 3.6 Acceptance criteria

- **AC-3.1** Vertical gap between the two `.courses-grid` elements is 32px ±1 at ≥1100px.
- **AC-3.2** `.soon-mask` computed `text-align` is `center`; the two-line string is optically
  centred at 390px width (where it wraps hardest).
- **AC-3.3** On hover, `.soon-hint` reaches `opacity: 1`.
- **AC-3.4** Under `prefers-reduced-motion: reduce`, `.soon-lock` runs no animation **and**
  `.soon-hint` has no transition. Asserted in `a11y-reduced-motion.spec.ts`.

---

## 4. Rack section — shorter pin, tighter pane

**Commit 5.** File: `src/components/rack/RackFocus.tsx`.

### 4.1 Measured baseline

| Metric | Now | Target |
|---|---|---|
| `[data-rack-track]` offsetHeight @ 900vh | **3173px** | ~1930px |
| Screens of scroll | **3.53** | **~2.14** |
| Pinned pane height | `100vh − var(--header-h)` | `68vh` |
| Section padding | `py-16` (Tailwind, 64px) | `py-10` (40px) |

### 4.2 Changes

**`RackFocus.tsx:298`** — track height:

```diff
- height: `calc((100vh - var(--header-h, 56px)) + (100vh - var(--header-h, 56px)) * 0.92 * ${segments})`,
+ height: `calc(68vh + 68vh * 0.38 * ${segments})`,
```

**`RackFocus.tsx:305`** — pinned pane height:

```diff
- height: 'calc(100vh - var(--header-h, 56px))',
+ height: '68vh',
```

**`RackFocus.tsx:496`** — section padding: `py-16` → `py-10`.

### 4.3 What must NOT change

- `dwellEase()` (`:41`) — the 0.30 / 0.80 plateau boundaries are what make each item sit sharp.
  Untouched.
- `focusFromProgress()` (`:49`), `progressForItem()` (`:63`) — pure functions of `p` and
  `segments`, both dimensionless. Untouched.
- `useTrackProgress()` (`:87`) — reads `rect.height` live each frame, so it adapts to the new
  height with no edit.
- Keyboard nav, click-to-jump, the reduced-motion and <900px `RackTabs` fallback. All untouched.

### 4.4 Test impact

`tests/e2e/rack.spec.ts` — audited. `scrollToTrackFraction()` (`:30`) computes
`pinStartDoc + f * (track.offsetHeight - innerHeight)` — i.e. **everything is expressed as a
fraction of whatever the track height is**. Shortening the track is transparent to it.

One risk: at `68vh` pane height with a 900px viewport the pane is 612px. Verify the 4 names plus
the panel still fit without clipping at the **shortest** tested viewport. If they do not, raise
68vh rather than reintroducing scroll length.

**No spec changes expected.** If any rack test fails, that is a signal the change broke behaviour,
not that the test needs updating.

### 4.5 Acceptance criteria

- **AC-4.1** `[data-rack-track].offsetHeight / window.innerHeight` is between 2.0 and 2.3.
- **AC-4.2** All 227 lines of `rack.spec.ts` pass **unmodified**.
- **AC-4.3** No clipping: at 1280×720 and 1440×900, the 4th name's bottom edge is inside the
  pinned pane's box.
- **AC-4.4** The pinned pane's top edge never intersects `.header`'s bottom edge (this is what
  the `--header-h` fix in 1.4 buys).

---

## 5. Sign-in dialog — tabs, centred submit, polish

**Commit 6.** Files: `src/components/auth/AuthDialog.tsx`, `src/styles/redesign.css`,
`tests/e2e/auth.spec.ts`, `tests/e2e/profile.spec.ts`, `tests/e2e/profile-settings.spec.ts`.

**This is the highest-risk commit in the batch.** It touches live authentication.

### 5.1 Structure

`LoginModal` and `SignupModal` (currently two `<Modal>` instances,
`AuthDialog.tsx:130` and `:260`) merge into one `AuthModal` with `id="auth-modal"`.
`ResetModal` is **unchanged and stays separate**.

```
<Modal id="auth-modal" title={tab === 'login' ? 'Sign in' : 'Sign up'}>
  <ModalClose />
  <header class="auth-head">      ← mark, title, subtitle
  <div role="tablist" class="auth-tabs">
    <button role="tab" id="auth-tab-login"  aria-selected aria-controls="auth-panel-login">
    <button role="tab" id="auth-tab-signup" aria-selected aria-controls="auth-panel-signup">
  </div>
  <button id="google-login" class="btn btn-ghost auth-google">   ← promoted above the divider
  <div class="divider">or use your email</div>
  <div role="tabpanel" id="auth-panel-login">  <form id="login-form">  …
  <div role="tabpanel" id="auth-panel-signup"> <form id="signup-form"> …
  <p class="auth-link">Forgot your password?</p>
</Modal>
```

### 5.2 Ids: what survives, what changes

**Survives unchanged — every field and submit id:**

```
#login-email  #login-password  #login-submit  #login-error   #login-form
#signup-email #signup-password #signup-confirm #signup-submit #signup-error #signup-form
#google-login #google-signup
```

**Changes:** `#login-modal` and `#signup-modal` → a single `#auth-modal`.

**Consequence:** any assertion of the form `expect(page.locator('#login-modal')).toBeVisible()`
must become "the dialog is open **and** the login tab is selected".

### 5.3 State ownership

The existing `authDialogStore` (`src/lib/auth-dialog.ts`) already carries a mode
(`'login' | 'signup' | 'reset'`). **Reuse it as the tab state.** `openAuthDialog('signup')`
opens the dialog with the signup tab pre-selected. Clicking a tab calls
`openAuthDialog(mode)`. No new store, no new hook.

This preserves every existing entry point:
- `Nav.tsx:156` `openAuthDialog('login')` → dialog opens on the login tab.
- The "Create an account" text link becomes the signup tab; the call it makes is identical.

### 5.4 Behaviour that must NOT change

| Behaviour | Source | Why it matters |
|---|---|---|
| `waitForAuthReady()` 8s race | `AuthDialog.tsx:32` | A stalled Firebase load must not hang a submit forever. |
| `useSubmitLock()` **per button** | `AuthDialog.tsx:53` | Google and email submits must not share a busy flag. Two locks per panel, four total — do not consolidate. |
| `setError('')` on every open/close | `:76`, `:202` | Stale errors must never survive. **Must now also clear on tab switch.** |
| `noValidate` on both forms | `:133`, `:263` | Inline `role="alert"` errors replace native bubbles. |
| Exact error strings | `:103`, `:107`, `:229`, `:233`, `:237` | `auth.spec.ts:126` asserts `"That email or password isn't right."` byte-for-byte. |
| `track('login_success')` / `track('signup_success')` | `:121`, `:251` | Analytics contract. |
| `aria-busy` during submit | `:163`, `:304` | `auth.spec.ts:170-181` depends on it. |

### 5.5 Visual changes

| Element | Change |
|---|---|
| Header | Fynoptic mark (32px, on `--db-plate`), title, one-line subtitle. Centred. |
| Tabs | Segmented control, `--surface-2` track, active pill `--surface-0`. |
| Google | Moved **above** the divider, full width, with the Google mark. |
| Divider | "or" → "or use your email". |
| Inputs | 40px height, 7px radius, leading icon, `:focus-visible` ring (3px, `--db-optic` @ 22%). |
| Password | Show/hide toggle button, `aria-pressed`, `aria-label="Show password"`. |
| Error | Bordered alert row with icon. **Text, `id`, `role` and `aria-live` unchanged.** |
| Submit | **Centred**, auto width with 34px horizontal padding — was full-width. |

### 5.6 Test rewrite (the agreed cost)

| File:line | Now | Becomes |
|---|---|---|
| `auth.spec.ts:25` | `#signup-modal` hidden | `#auth-modal` hidden |
| `auth.spec.ts:64` | `#login-modal` visible | `#auth-modal` visible **and** `#auth-tab-login[aria-selected=true]` |
| `auth.spec.ts:66` | `#signup-modal` visible | click `#auth-tab-signup`, assert `aria-selected=true` |
| `auth.spec.ts:74` | `#signup-modal` hidden | `#auth-modal` hidden |
| `auth.spec.ts:101` | `#login-modal` visible | as `:64` |
| `auth.spec.ts:107` | `#login-modal` hidden | `#auth-modal` hidden |
| `auth.spec.ts:184` | `#login-modal` hidden | `#auth-modal` hidden |
| `profile.spec.ts:26` | `#signup-modal` hidden | `#auth-modal` hidden |
| `profile-settings.spec.ts:~56` | `#signup-modal` hidden | `#auth-modal` hidden |

`auth.spec.ts:133,139` (`#reset-modal`) — **unchanged**, reset stays its own dialog.

**NEW tests:**
- Tab switch swaps the visible panel and moves `aria-selected`.
- Tab switch clears a displayed error.
- `#login-submit` is horizontally centred within `.dialog` (AC-6.4).
- The password show/hide toggle flips `input[type]` between `password` and `text`.

### 5.7 Verification protocol

Run against the **Firebase Auth emulator**, via `npm run test:e2e`, which bakes
`PUBLIC_AUTH_EMULATOR` into the script (`8982c0a`).

> **Do not run a bare `npm run build` + Playwright.** Vite inlines env vars at build time; without
> `PUBLIC_AUTH_EMULATOR` set, `connectAuthEmulator()` is dead-code-eliminated and the suite hits
> **real production Firebase and creates real accounts.** This has already happened once in this
> project. It is the single most important operational note in this document.

### 5.8 Acceptance criteria

- **AC-6.1** All rewritten auth/profile/profile-settings specs pass against the emulator.
- **AC-6.2** Every field id in 5.2 resolves after the merge.
- **AC-6.3** Error strings are byte-identical to the current implementation.
- **AC-6.4** `#login-submit`'s horizontal centre is within 2px of `.dialog`'s horizontal centre.
  Same for `#signup-submit`.
- **AC-6.5** `#reset-modal` opens from "Forgot your password?" and still works end to end.
- **AC-6.6** Keyboard: Tab order is tabs → Google → fields → submit → forgot link. Arrow keys move
  between tabs. Escape closes. Focus returns to `#user-btn` on close.
- **AC-6.7** Zero real-Firebase accounts created. Confirm the emulator was live by asserting the
  suite's auth base URL before the run.

---

## 6. Flashcards — unit picker table

**Commit 7.** Files: `src/components/flashcards/FlashcardWizard.tsx`,
`src/hooks/useFlashcardDeck.ts` (export one helper), `src/styles/flashcards.css`.

### 6.1 Data — all of it already exists

| Fact | Source |
|---|---|
| 12 units | `src/data/flashcard-units.ts` |
| 611 terms total | Counted: 50/50/51/50/50/50/50/50/55/54/51/50 |
| Per-card answers | `useFlashcardDeck.ts:183` — `localStorage` key `ff_flashcards`, shape `{answers: {"<unit>::<term>": {correct, attempts, lastAt}}}` |

Per-unit mastery = count of keys with prefix `"<unit>::"` where `correct === true`, over
`FLASHCARD_UNITS[unit].length`. **No new storage, no migration, no schema change.**

Export a pure `unitProgress(answers, unit, cards): {done, correct, total, pct}` from
`useFlashcardDeck.ts` and unit-test it directly (it sits alongside `buildDeck`,
`checkFitbAnswer`, `buildMcOptions`, which `tests/unit/flashcard-logic.test.ts` already imports
this way).

### 6.2 Markup — the critical constraint

`tests/e2e/flashcards.spec.ts` drives step 1 through these selectors:

```
#unit-list          .unit-chip          .unit-chip.is-active
#select-all         #clear-all          #confirm-units        #block-units
```

**All seven must survive.** The row becomes a `<label class="chip unit-chip">` exactly as today —
only its *internal* layout and CSS change. `#unit-list` stays the container, `is-active` stays the
selected-state class.

This keeps **8 assertions across 4 tests** green with zero spec edits, and is the reason the
redesign is CSS-led rather than a rewrite.

```html
<div id="unit-list" class="unit-list is-table" aria-live="polite">
  <label class="chip unit-chip is-active" style="--unit-hue:#5B8CFF">
    <input type="checkbox" class="sr-only" />
    <span class="unit-box" aria-hidden="true">✓</span>
    <span class="unit-name">Banking</span>
    <span class="unit-count">50 cards</span>
    <span class="unit-bar"><span class="unit-fill" style="width:72%"></span></span>
    <span class="unit-pct">72%</span>
  </label>
  …
</div>
<p class="unit-total">3 units · 150 cards</p>
```

### 6.3 CSS — `flashcards.css`

`.unit-list` currently resolves to `display:flex; flex-wrap:wrap` from **three** competing
legacy rules (`legacy.css:3481`, `:5078`, `:5206`). Override once, with a co-class for
specificity:

```css
.unit-list.is-table {
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  gap: 7px !important;
}
.unit-list.is-table .unit-chip {
  display: grid;
  grid-template-columns: 22px 1fr 84px 1fr 34px;
  gap: 12px;
  align-items: center;
  text-align: left !important;          /* undoes the inline centring at FlashcardWizard.tsx:129 */
  padding: 9px 13px;
  border-left: 3px solid var(--unit-hue);
  background: color-mix(in oklab, var(--unit-hue) 9%, var(--surface-1));
  transform: none !important;            /* kills legacy.css:5220's hover lift — wrong for a row */
}
@media (max-width: 640px) {
  .unit-list.is-table .unit-chip { grid-template-columns: 22px 1fr 68px; }
  .unit-list.is-table .unit-bar,
  .unit-list.is-table .unit-pct { display: none; }
}
```

### 6.4 The 12 hues

| Unit | Hue | | Unit | Hue |
|---|---|---|---|---|
| Banking | `#5B8CFF` | | Borrowing Basics | `#F97316` |
| Financial Decisions | `#8B5CF6` | | Credit Cards | `#EF4444` |
| Making the Most of Your Income | `#06B6D4` | | Protecting Your Money and Identity | `#EC4899` |
| Spending & Saving Plan | `#10B981` | | Buying a Car | `#A855F7` |
| Saving Goals and Future | `#84CC16` | | Paying for College | `#14B8A6` |
| Building Your Credit History | `#EAB308` | | Investing Basics | `#6366F1` |

Colour is **identity only**. Progress is carried by the bar and the percentage — never by hue —
so the row reads the same whether you have studied it or not. Contrast: the hue is a 3px rail and
a 9% background tint, never a text colour, so it never carries meaning alone (WCAG 1.4.1).

### 6.5 Steps 2 and 3

**Untouched.** Not in scope.

### 6.6 Acceptance criteria

- **AC-7.1** All existing `flashcards.spec.ts` tests pass **unmodified**.
- **AC-7.2** `#unit-list` computed `flex-direction` is `column` at every width; exactly 12
  `.unit-chip` children.
- **AC-7.3** Counts render `50, 50, 51, 50, 50, 50, 50, 50, 55, 54, 51, 50`.
- **AC-7.4** After answering N cards in one unit, that row's `.unit-pct` equals
  `round(correct / total × 100)`. Unit-tested on the pure helper, e2e-tested once end to end.
- **AC-7.5** `.unit-total` updates live as rows are toggled.
- **AC-7.6** At 390px the bar and percentage are hidden and the name is not truncated mid-word.

---

## 7. Practice wizard — all three steps

**Commit 8.** Files: `src/components/practice/PracticeWizard.tsx`, `src/styles/practice.css`,
`tests/e2e/practice.spec.ts`.

### 7.1 Real data (read from the shipped banks)

| Bank | Topics | Questions |
|---|---|---|
| Economics | 10 | **896** |
| Personal Finance | 6 | **390** |

Per-topic counts (Economics): 89, 86, 100, 82, 96, 75, 97, 100, 100, 71.
Per-topic counts (Personal Finance): 53, 61, 55, 55, 96, 70.

Structure is `bank[category][topic][difficulty] = Question[]`, so a topic count is the sum over
its three difficulty buckets.

### 7.2 Correction: there are no raw slugs

`PracticeWizard.tsx:22-24` claims topic chips show raw slugs like `cash_flow` and that this was
preserved deliberately. **I read the actual banks — the keys are already human-readable**
("Macroeconomic Theory", "Fixed Income & Bonds"). The comment is stale and describes a bank that
is no longer shipped.

There is therefore **no prettification to do.** What gets added instead is the per-topic question
count. Update the stale comment as part of this commit.

### 7.3 Step 1 — bank cards

Replace `<select id="category">` with two selectable cards. **`#category` must survive as a
visually-hidden `<select>`**, because:
- `practice.spec.ts` calls `page.selectOption('#category', …)` at lines 76 and 87;
- `body[data-cat]` is driven off it (`PracticeWizard.tsx:76`) and `legacy.css` keys off that
  attribute (contract I3).

Keeping the select as the source of truth and letting the cards drive it is strictly safer than
replacing it. The cards call the same `handleCategoryChange()`.

`#question-count` and the adapt-every control become segmented pill groups; both keep their
underlying `<select>` elements visually hidden for the same reason
(`practice.spec.ts:25` uses `selectOption('#question-count', …)`).

> **Decision:** keep the hidden selects. It preserves 4 spec call sites and the `data-cat`
> contract at the cost of a little markup. Do **not** delete them to be tidy.

Add a 3-step indicator across the top, driven by the existing `data-step` attribute.

### 7.4 Step 2 — topics with counts

Existing selectors that must survive: `#topics-list`, `.topic-btn`, `.topic-btn.is-selected`,
`#topics-select-all`, `#wiz-next-2`, `#wiz-back-2`.

Each chip gains a trailing count span. Add a "Clear" next to the existing select-all.

> `PracticeWizard.tsx:25-26` notes `role="checkbox"` + `aria-pressed` is the original's own
> mismatch (`aria-checked` is correct) and was kept as shipped. **Fix it in this commit** —
> `aria-pressed` → `aria-checked`. It is a genuine a11y defect and this is the one commit that
> touches these elements. `practice.spec.ts` asserts on `.is-selected`, not on the ARIA attribute,
> so nothing breaks.

### 7.5 Step 3 — summary card

`#wiz-summary` must survive (`practice.spec.ts:56` asserts it is non-empty). It stays, as the
accessible text summary, and gains a structured card around it:

```
Bank            Economics
Topics          3 of 10
Drawing from    272 questions
Session length  20 questions
Adaptive        On · adjusts every 10
                  [ Start Practice ]
```

`#start-btn`, `#wiz-back-3`, `#reset-btn` all survive.

### 7.6 Behaviour that must NOT change

- Category change clears topic selection (`PracticeWizard.tsx:79-82`) — replicates the original's
  side effect of rebuilding the `<select>`'s options.
- The "select at least one unit" gate lives on **step 2 → 3**, not on Start, and its toast string
  is byte-identical: `'Please select at least one unit.'` (`practice.spec.ts:65` asserts it).
- `body[data-cat]` updates on every category change.
- `#reset-btn` ships disabled while the wizard shows.

### 7.7 Test impact

| File:line | Change |
|---|---|
| `practice.spec.ts:25` | `selectOption('#question-count')` — **survives** (hidden select kept). |
| `practice.spec.ts:76,87` | `selectOption('#category')` — **survives** (hidden select kept). |
| everything else | Audited; no changes. |

**NEW tests:** clicking a bank card updates `body[data-cat]`; topic chips show counts;
`aria-checked` replaces `aria-pressed`.

### 7.8 Acceptance criteria

- **AC-8.1** All existing `practice.spec.ts` tests pass **unmodified**.
- **AC-8.2** Clicking the Economics card sets `body[data-cat="Economics"]` and clears topics.
- **AC-8.3** Bank cards show 10/896 and 6/390.
- **AC-8.4** Topic chips show the counts in 7.1.
- **AC-8.5** Step 3 "Drawing from" equals the sum of selected topics' counts.
- **AC-8.6** `.topic-btn` uses `aria-checked`, not `aria-pressed`.

---

## 8. About page

**Commit 9.** Files: `src/pages/about.astro`, `src/styles/about.css`.

**Amended per your review: the "About Fynoptic" heading and the mission paragraph are cut.
The page opens on Meet the Founders.**

### 8.1 Partner logos invisible in light mode (CONFIRMED)

**Measured:** `.partner-cell` computed `background-color: rgba(255, 255, 255, 0.03)`.

All five partner images are white artwork on transparent PNGs. At 3% white on a white ground they
are effectively invisible. The homepage marquee solved this at `redesign.css:255` with a fixed
dark plate (`--db-plate`); About never received it.

**Fix** — in `about.css` (which is currently a 13-line comment saying "this file exists as the
place to put About-only overrides in future"; this is that future):

```css
.partner-cell {
  background: var(--db-plate);
  border-color: var(--db-rule);
}
.partner-cell img { opacity: 1; filter: none; }   /* undoes legacy's grayscale(10%) + .9 opacity */
```

The plate is deliberately dark in **both** themes — same reasoning as `redesign.css:44`: the
artwork is white and recolouring a third party's mark is not an option.

### 8.2 Retired visual language (CONFIRMED)

`legacy.css:6475` paints `.founders-slab` and `.partners-slab` with blue/teal radial-gradient
orbs that `redesign.css:50-54` deleted everywhere else. About is the last page still wearing the
pre-redesign look.

```css
.founders-slab,
.partners-slab {
  background: none;
  border-top: 1px solid var(--db-rule);
  border-bottom: 1px solid var(--db-rule);
  padding-block: clamp(2.5rem, 5vw, 4rem);   /* matches redesign.css:498-501 rhythm */
}
```

### 8.3 Heading consistency (CONFIRMED)

**Measured:** `#founders-title` is an `H1` at **36px**; `#partners-title` is an `H2` at
**24.48px**. Two sibling section headers at visibly different sizes.

Because the "About Fynoptic" h1 is cut, "Meet the Founders" **remains the page's `h1`** — which is
correct for document outline (a page needs exactly one h1, and this page's subject is its
founders). The fix is purely visual:

```css
.founders-slab .slab-title,
.partners-slab .slab-title {
  font-size: clamp(1.5rem, 2vw, 1.9rem);
  line-height: 1.15;
  letter-spacing: -.018em;
  margin: 0 0 1rem;
}
```

`redesign.css:164` already routes `.slab-title` to `--display-face` at weight 600, so the face and
weight are already consistent — only size was wrong.

**Text:** "Meet the founders" → **"Meet the Founders"**; "Our partners" → **"Our Partners"**.
Check `docs/superpowers/plans/capitalization-changes.md` first — if the staged sweep already
covers these, do not double-apply.

### 8.4 Alt text (CONFIRMED)

`about.astro:61-65`:

| Now | Becomes |
|---|---|
| `alt="Partner 1"` | `alt="Emory University"` |
| `alt="Partner 2"` | `alt="Invesco"` |
| `alt="Partner 3"` | `alt="Georgia Council on Economic Education"` |
| `alt="Partner 4"` | `alt="National Economic Challenge"` |
| `alt="Partner 5"` | `alt="National Personal Finance Challenge"` |

### 8.5 Acceptance criteria

- **AC-9.1** In light theme, `.partner-cell` background is `--db-plate` and each logo's contrast
  against it is ≥ 3:1.
- **AC-9.2** `.founders-slab` and `.partners-slab` compute `background-image: none`.
- **AC-9.3** `#founders-title` and `#partners-title` compute the **same** `font-size` at 1440,
  900 and 390px.
- **AC-9.4** Page has exactly one `<h1>`, and it is "Meet the Founders".
- **AC-9.5** No partner `<img>` has alt text matching `/^Partner \d+$/`.
- **AC-9.6** No "About Fynoptic" heading and no mission paragraph exist on the page.

---

## 9. Commit sequence

| # | Commit | Files | Risk |
|---|---|---|---|
| 1 | Capitalization sweep (staged, approved) | 21 src + 4 spec | none — pre-tested |
| 2 | Navbar: constant height, rectangular controls, Helvetica wordmark | `redesign.css`, `typography.spec.ts`, `shell.spec.ts` | low |
| 3 | Articles: sticky containing block, offsets, gaps, collapse | `articles.astro`, `redesign.css`, `ArticlesBrowser.tsx`, `articles.spec.ts` | **medium — DOM move** |
| 4 | Courses: row gap, centred lock text, padlock hover | `courses.astro`, `redesign.css` | low |
| 5 | Rack: 2.14-screen track, 68vh pane | `RackFocus.tsx` | low |
| 6 | Auth dialog: tabs, centred submit, polish | `AuthDialog.tsx`, `redesign.css`, 3 spec files | **HIGH — live auth** |
| 7 | Flashcards: unit table | `FlashcardWizard.tsx`, `useFlashcardDeck.ts`, `flashcards.css` | low |
| 8 | Practice: three-step redesign | `PracticeWizard.tsx`, `practice.css`, `practice.spec.ts` | medium |
| 9 | About: plate, flat ground, headings, alt text | `about.astro`, `about.css` | low |

**Ordering rationale.** Commit 2 lands first because it corrects `--header-h`, which commits 3
and 5 both consume. Commit 6 is sequenced late so a rollback there does not strand the low-risk
work behind it.

### 9.1 Parallelisation

Commits 4, 7, 8 and 9 touch **disjoint** files and can run as parallel subagents. Commits 2, 3
and 5 share `redesign.css` / `--header-h` and must be serial. Commit 6 runs alone.

Two agents must never touch the same file — the rule that held for all 13 prior phases.

### 9.2 Verification per commit

1. `npm run test:unit`
2. `npm run test:e2e` — **full** suite, with `PUBLIC_AUTH_EMULATOR` baked in by the script
3. `node scripts/visual-diff.mjs --diff` — 0.1% pixelmatch threshold, **blocking**
4. Playwright screenshot pass: both themes × {390, 900, 1440}
5. `npm run build` — 253 pages must build clean

### 9.3 Rollback

Each commit is independently revertible. Commit 3 (DOM move) and commit 6 (auth) are the two
worth calling out: revert commit 3 restores the original `articles.astro` structure wholesale;
revert commit 6 restores three separate dialogs and their three spec files together, since the
spec edits ship in the same commit as the component change.

---

## 10. CLOSED — was the only blocking question

**Resolved 2026-08-09.** User: *"it needs a gap."* Implemented as §2.4 above. The record of the
investigation is kept below because the root cause (a duplicate `.container` shorthand 4,172 lines
later) is a live hazard for any future `.articles-hero`-style rule.

### Original question (answered)

**You said:** "The gap between Articles and Guides and the navbar on the page is too big."

**Measured (1440×900, dark and light):**

```
.header      bottom  61.0px
h1           top     61.0px     →  gap = 0.0px
```

There is **no gap at all.** The heading sits flush against the navbar — see
`scratchpad/articles-dark.png` and `articles-light.png`. The complaint and the render disagree.

**Why it is zero.** `legacy.css:1653` sets `.articles-hero { padding: min(7vh,5rem) 0 1rem }`,
which would give ~63px. But `.articles-hero` is `class="articles-hero container"`, and
`legacy.css:5825` — **4,172 lines later** — redeclares `.container { … padding: 0 var(--gutter) }`
as a shorthand. Same specificity, later source order, so it resets the vertical padding to zero.
This is the same duplicate-rule pathology that caused the drift this whole redesign exists to fix.

Three readings were put to the user:

- **(a)** cramped, wants a proper gap → restore ~40px above the h1. ← **CHOSEN**
- **(b)** the total run from navbar to first card (218px) is too long → compress the hero block.
- **(c)** a different viewport renders differently from the 1440×900 capture → re-measure there.

Answer: **(a)**. Nothing in this spec is blocked. See §2.4 for the implementation.

---

## 11. Out of scope — flagged, not touched

Four claims on the live site do not match the data. These are marketing copy, not defects, and
changing them is your call.

| Claim | Where | Reality |
|---|---|---|
| "3,000+ vocabulary words" | `index.astro:91` | **611** terms in `flashcard-units.ts` |
| "10,000+ challenging practice questions" | `index.astro:99` | **1,286** (896 Economics + 390 Personal Finance) |
| "8 Courses Available" | `courses.astro:71` | 8 cards; **1** real course, 7 locked placeholders |
| "over 240 insightful articles" | `index.astro:83` | **244** — this one is accurate |

Also unchanged: the two human gates still blocking the merge to `main` — the real-Firebase manual
auth pass, and your read of `/privacy` (specifically the line promising manual handling of
account-deletion requests, which no code backs).

---

## Appendix A — measurement transcript

Captured 2026-08-09 against `localhost:4321` (dev server, task `bdm941sn7`), Playwright Chromium,
viewport 1440×900.

```json
{
  "nav": {
    "dark":  { "headerH": 61, "logoBox": [42.1, 40], "logoPad": "0px",
               "logoBoxSizing": "content-box", "userBtnRadius": "16px",
               "themeBtnRadius": "6px", "wordmarkFont": "Spectral" },
    "light": { "headerH": 69, "logoBox": [50.1, 48], "logoPad": "4px",
               "logoBoxSizing": "content-box", "userBtnRadius": "16px",
               "themeBtnRadius": "6px", "wordmarkFont": "Spectral" }
  },
  "rack": { "trackH": 3173, "vh": 900, "screens": 3.53 },
  "articles": {
    "rest":     { "headerH": 61.0, "heroPad": "0px / 0px", "h1": {"top": 61.0, "bottom": 101.3},
                  "ctrlTopCSS": "72px", "ctrlParent": "articles-hero container",
                  "gapHeaderToH1": 0, "gapCtrlToGrid": 0 },
    "scrolled": { "ctrlTop": -856.1, "headerBottom": 61, "overlaps": true }
  },
  "courses": { "grid1": {"top": 160.1, "bottom": 1098.6},
               "grid2": {"top": 1098.6, "bottom": 1953.9}, "gap": 0 },
  "about":   { "foundersTag": "H1", "foundersSize": "36px",
               "partnersTag": "H2", "partnersSize": "24.48px",
               "partnerCellBg": "rgba(255, 255, 255, 0.03)" }
}
```
