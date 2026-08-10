# Direction B + Full React Rebuild — Spec & Implementation Plan

Date: 2026-08-08
Status: **awaiting approval — no code written**
Branch: `redesign-react` (worktree), staged commits, merged to `main` when fully green

---

## 1. Goal

Two things land together in one changeset:

1. **Design.** Rebuild the homepage as Direction B ("Optical Bench") from the 7 Aug audit, plus the navbar and footer site-wide, plus a site-wide type change.
2. **Architecture.** Convert every remaining vanilla-TS island to React, so the whole interactive layer is one stack.

Testing is the only gate. There is no PR review and no second reviewer, so the test suite is the sole thing standing between a change and production.

### Non-goals

- No content authoring beyond the new sections, the two new pages, and the capitalization sweep.
- No change to Firebase project config, hosting, or the Vercel deployment path.
- No folder reorganisation (audit item 7) and no git-history media purge (audit item 8).
- No redesign of `/courses`, `/courseone`, `/flashcard`, `/practice`, `/profile`, `/bot`, `/about` beyond what the shared shell and type tokens change automatically.

---

## 2. Decisions register

Every one of these was decided explicitly. Recorded so nothing gets silently re-litigated mid-build.

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D1 | Heading face | Helvetica Neue | Replaces Sora + Spectral on headings site-wide |
| D2 | Body face | Inter, unchanged | Matches what the hero subhead renders today |
| D3 | Serif survivors | `.reader-title`, `.reader-body h2/h3`, `.logo-text` | Reading surface stays editorial; browse/UI goes sans |
| D4 | `.art-title` (browse cards) | Helvetica | It's UI, not reading |
| D5 | Island architecture | Everything React | All 6 vanilla islands converted |
| D6 | Sequencing | One changeset, tests written first | Test net precedes the rewrite |
| D7 | Cross-island state | Framework-agnostic modules + `useSyncExternalStore` | No new dep; all 253 pages stay static |
| D8 | Test net | Playwright E2E + Vitest + visual regression | All three wired into CI |
| D9 | Auth in tests | Firebase Auth Emulator | New `firebase.json`, `firebase-tools` dev dep |
| D10 | Panel copy numbers | Use the site's existing figures (3,000+ / 10,000+) | See R1 |
| D11 | Capitalization | Sweep everywhere, Title Case / sentence case rule | Full before/after table produced for veto |
| D12 | Delivery | Staged commits on a branch, no PRs | Merge to main when green |
| D13 | Footer legal pages | Build real `/accessibility` and `/privacy` | Full text authored |
| D14 | Partner label | Keep "In Partnership With" | Unchanged |
| D15 | Hero tests | Update and strengthen | Rotation test rewritten to be stricter |
| D16 | Ticket motion | Focus advances on hero scroll; click takes over | No second pinned section |
| D17 | Final CTA band | Deleted | Homepage ends hero → rack → footer |
| D18 | Rack end behaviour | Pin releases, page continues | No loop, no scroll trap |

---

## 3. Findings register

Discovered while investigating. Each is a real defect or fact that shapes the work.

| # | Finding | Evidence | Action |
|---|---|---|---|
| F1 | `.sr-only` is globally `display:none !important` | `legacy.css:1827-1828` | **Fix.** `display:none` removes elements from the accessibility tree — every screen-reader-only label on the site is currently unreadable by assistive tech. Restore proper clip-based `.sr-only` and reinstate the skip link. Blocking for D13. |
| F2 | `worktree-site-qa` is stale and destructive | 0 commits ahead of `main`, sits at `b8cd47d` which predates the hero-redesign merge; diff shows 5,314 deletions incl. `Hero.tsx`, `button.tsx`, `globals.css`, `hero.spec.ts` | Delete the worktree and branch before starting |
| F3 | CI never runs tests | `.github/workflows/ci.yml` runs only `astro check` + `astro build` | Add test jobs (D8) |
| F4 | `visual-diff.mjs` has no diff mode | Its own header: "that logic is not implemented yet" | Build the comparator |
| F5 | Practice banks 2of6–6of6 do not exist | `public/data/` has only `pf_bank_modules_1of6.json` | Tracked separately; not blocking |
| F6 | `practice.ts` retries one path three times | `loadPF()` — `tryPaths` is the same string ×3, ported as a known copy-paste leftover | Fix during conversion |
| F7 | Flashcard data is 611 cards / 12 units | Parsed `flashcard-units.ts`: 50–55 per unit | See R1 |
| F8 | Practice data is 1,286 questions | 390 (`pf_bank…1of6`) + 896 (`econ_grouped…`) | See R1 |
| F9 | `track.ts` only `console.log`s | No analytics sink; Firebase Analytics never initialised despite `measurementId` in config | Privacy page must say so accurately |
| F10 | a11y toggles are page-local | `ff_a11y_hc` / `ff_a11y_dys` wired only in `course-one.ts` | Promote to a site-wide setting so `/accessibility` can describe them truthfully |
| F11 | Three hero tests break | CTA strings ×2 (capitalization), rotation test's `.first()` vs odometer | D15 |
| F12 | Article titles already Title Case | Sampled `ARTICLE_META` | Excluded from D11 sweep |

---

## 4. Risk register

**R1 — Panel copy states figures the shipped data contradicts.** Per D10 the new rack panels print "3,000+ terms" and "10,000+ questions". Measured: 611 cards (F7) and 1,286 questions (F8). This was raised twice with evidence and decided by the owner. Recorded here so it is documented rather than buried; revisit if the missing content (F5) lands.

**R2 — 6,400 lines rewritten with no human review.** Mitigated only by D8. If the test net is weak, nothing else catches a regression. This is why the test phase is first and is not allowed to be shortened.

**R3 — Firebase auth is the highest-consequence code in the repo.** `#user-btn`'s children and `data-modal-open` are load-bearing (documented in `Header.astro`). Auth converts last, after everything else is green.

**R4 — Privacy page is not legal advice.** It will describe actual, verified behaviour only (§7.9). It should still be read by a human before it ships.

---

## 5. Type system

### Tokens (`redesign.css`)

```css
:root {
  --display-face:  'Helvetica Neue', Helvetica, Arial, sans-serif;  /* was Spectral */
  --editorial-face:'Spectral', 'Iowan Old Style', Georgia, serif;   /* new */
  --wordmark-face: var(--editorial-face);                            /* new, semantic alias */
  --mono-face:     ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace; /* new role */
}
```

### Rule split

`redesign.css:161-165` currently reads:

```css
h1, h2, h3, .slab-title, .cta-title, .big-statement, .art-title, .reader-title {
  font-family: var(--display-face) !important; ...
}
```

Becomes two rules:

```css
/* sans everywhere */
h1, h2, h3, .slab-title, .cta-title, .big-statement, .art-title { font-family: var(--display-face) !important; ... }
/* editorial reading surface only */
.reader-title, .reader-body h2, .reader-body h3 { font-family: var(--editorial-face) !important; ... }
/* wordmark keeps its own token */
.logo-text { font-family: var(--wordmark-face) !important; }
```

`.reader-title` (0,1,0) already outranks `h1` (0,0,1) at equal `!important`, so ordering is not load-bearing — but the rules are split anyway so intent is legible.

### Font loading

- **Drop** `@fontsource-variable/sora` entirely (`Base.astro:16`) — no remaining consumer.
- **Reduce** Spectral to 600 weight, latin subset only. Currently 400/500/600/400-italic (`Base.astro:17-20`).
- **Keep** Inter variable, latin.
- Helvetica Neue is a system face — zero bytes.

Net: two fewer font downloads on every page.

### Verification
- Computed `font-family` asserted on: hero h1, hero subhead, wordmark, `.reader-title`, an in-prose `.reader-body h3`, an `.art-title` card, a nav link, a button.
- Network assertion: no request for a Sora file on any page.

---

## 6. Design spec

Palette is already correct in the repo (`--db-optic: #94ABFF` dark / `#2440C0` light). No colour changes.

### 6.1 Navbar

Structure: logo lockup · nav links · spacer · theme icon · Sign In · Start the Free Course.

- Wordmark keeps Spectral 600 at 1.2rem (D3).
- `#theme-btn` becomes a 32×32 icon button (sun/moon), keeping its id and `aria-pressed`.
- `#user-btn` keeps its id, its two children (`#nav-avatar`, `#nav-initials`) and `data-modal-open` — restyled as a text button reading "Sign In" when signed out, avatar/initials when signed in. **Never** `innerHTML`. (R3)
- Height 56px, matching `--header-h`. Already `position:sticky; top:0`.
- Below 900px: links collapse to the existing `#mobile-menu`; the *nav* CTA hides, the hero CTA does not.

### 6.2 Hero

Two columns, `1.04fr / .96fr`, `align-items:start`, both children `min-width:0`.

**Left:** h1 with rotating word · subhead · two CTAs · fine print · partner strip.
**Right:** checkout ticket.

#### Rotating word — odometer

Current bug: an invisible copy of the longest word ("setup") holds the line width, so the full stop parks at *setup*'s right edge and short words leave a gap.

Replacement:
- All words absolutely stacked in an `inline-block` container with `overflow:hidden`, height `1.08em`.
- Container width animates to the **measured width of the live word** over 380ms `cubic-bezier(.22,.61,.36,1)` — the same curve as the word swap, so the period travels with the word's right edge.
- Words enter from `translateY(102%)` and exit to `-102%`. `overflow:hidden` clips the travel, giving a mechanical odometer roll rather than a crossfade.
- Widths measured once from a hidden span in the identical face/weight/size; re-measured on resize and after `document.fonts.ready`.
- SSR renders the current fixed-width markup for one frame (widths can't be measured before mount), then switches post-hydration — no mismatch.
- `prefers-reduced-motion`: first word only, natural width, no transitions.

#### Checkout ticket (D16)

Seven rows, each a `role="tab"` button with its own note panel:

| Row | Amount | Note focus |
|---|---|---|
| Advertised — 2 × $42.00 | $84.00 | The number you actually compared against |
| Service fee | $9.60 | Percentage of price, per ticket, for no nameable service |
| Order processing fee | $4.99 | Per *order*, not per ticket — vanishes from per-ticket comparisons |
| Facility charge | $6.00 | Paid to the venue, collected by the seller, shown only at checkout |
| Delivery — mobile ticket | $2.50 | Delivery fee for a barcode; nothing is printed or shipped |
| Sales tax | $2.87 | The only line set by law — and it's calculated on the fees too |
| **Total charged** | **$109.96** | $25.96 over the advertised price |

Arithmetic verified: 84.00 + 9.60 + 4.99 + 6.00 + 2.50 + 2.87 = 109.96.

Behaviour:
- Focus walks the rows as the hero scrolls, driven by the hero's own scroll progress. No pinning, no added page length.
- Clicking any row takes manual control and stops the scroll-driven advance for the session.
- SCAN / ALL SHARP still toggles whether non-focused rows are defocused.
- Keyboard: arrow keys move between rows; `role="tablist"` / `role="tabpanel"`.

### 6.3 Rack focus section

Replaces three deleted sections: `.statement`, `.why-slab`, `.final-cta` (all homepage-only).

Copy: "One skill. Four places to build it." + intro, then Course / Articles / Flashcards / Practice.

**Mechanism**
- Heading and intro sit in normal flow, *outside* the pin. Only the grid pins — this is what lets the pinned block fit a 768px laptop without clipping.
- Track height = `pinH + step × 3`, where `pinH = viewport − 56` and `step = pinH × 0.92`.
- Scroll progress `p ∈ [0,1]` → focus position `f ∈ [0,3]`.
- Per item: `d = min(1, |f − i|)` drives blur `d × 3.4px`, opacity `1 − d × 0.5`, scale `1 − d × 0.05`, and an ink mix from muted to full via `color-mix`.
- **Dwell easing:** within each unit segment, hold below `t=0.30`, ease `0.30→0.80` (cubic in-out), hold above. Roughly half travel, half settle — without it nothing is ever sharp for long.
- **Panel:** cross-racks through depth. Outgoing blurs and scales *up* to 1.03 (toward the viewer); incoming resolves from 0.97. Rows stagger-clear on a 0.07 offset.
- **Barrel scale:** hairline + 4 ticks on the far left, fill tracks `f`. Pinned sections are disorienting without a progress cue.
- After Practice the pin releases (D18).

**Degradation**
- `prefers-reduced-motion` **or** container width < 900px → real tab set. No pin, no blur, arrow-key operable, panel below the list. Nothing is ever hidden by default (the audit found 10/14 elements on `/courses` stuck at `opacity:0` under reduced motion precisely because a reveal animation was the only thing that raised them).

**Cost control** — blur is this direction's stated risk:
- At most 4 names + 2 panels carry a filter; caps 3.4px / 5px.
- One `requestAnimationFrame` write per frame sets `--f`; every other value is CSS `calc()` off it.
- `will-change` toggled by IntersectionObserver, on only while the section is on screen.

### 6.4 Footer

Four columns: brand + tagline · Learn · Topics · Fynoptic. Bottom bar with © 2026 and the examples disclaimer. Column heads are `h3.s-label` — must be scoped `.site .s-label` so they don't lose the mono face to `.site h3` on specificity.

### 6.5 Spacing and alignment fixes

From direct review of the prototype:

| # | Issue | Fix |
|---|---|---|
| S1 | Gap between rack heading and the list too large | Pin was `align-items:center`, pushing the grid ~120px down. Switch to `flex-start` with `padding-top: clamp(16px,2vw,26px)`; lead gets `padding-bottom: clamp(14px,2vw,22px)`. Gap goes ~120px → ~30px. |
| S2 | Gap below the hero too large | Reduce `.s-hero` bottom padding from `clamp(30px,5vw,54px)` to `clamp(20px,3vw,36px)`. |
| S3 | `611 TERMS · 12 UNITS` separator too tight | Split the head into discrete spans with an explicit separator carrying `margin: 0 .5em`, instead of a single letter-spaced string. |
| S4 | Rule under the panel head starts too early | `.rk-phead` padding-bottom 11px → 14px, plus 2px top. |
| S5 | Hero fine print misaligned / bad wrap | `max-width:46ch` forced an orphaned "to everyone." Remove the cap (the column already constrains it), raise to .75rem, margin-top 14px → 18px. |
| S6 | Everything else | Full spacing pass: one vertical rhythm scale, every box's padding and gap vetted against it, at 1440 / 1280 / 1024 / 768 / 390, both themes. |

### 6.6 New pages (D13)

**`/accessibility`** — describes what is actually true after F1 and F10 are fixed: keyboard operation, skip link, reduced-motion support, the high-contrast and dyslexia-font toggles (promoted site-wide), contrast targets, and how to report a barrier. Nothing claimed that isn't implemented.

**`/privacy`** — grounded strictly in verified behaviour (F9):
- Account data via Firebase Auth: email, display name, optional avatar (uploaded to Firebase Storage from `/profile`).
- Local-only, never transmitted: `ff_course_progress`, `ff_fixit_history`, `ff_reports`, `fynoptic-theme`, `fynoptic.flashcards.v1`, `ff_a11y_hc`, `ff_a11y_dys`.
- **No analytics.** `track.ts` only writes to the console; Firebase Analytics is never initialised despite a `measurementId` sitting in the config.
- No third-party ad or tracking scripts.
- Per R4: to be read by a human before shipping.

---

## 7. Architecture

### 7.1 State model (D7)

`auth.ts`, `storage.ts`, `theme` and `toast` stay framework-agnostic modules and each gains `subscribe(cb): () => void` plus a `getSnapshot()`. React reads them through `useSyncExternalStore`. This works across island boundaries, needs no dependency, and keeps every page statically rendered.

Thin hooks wrap each: `useAuth()`, `useTheme()`, `useToasts()`, `useCourseProgress()`.

### 7.2 Island inventory

| Current | Lines | DOM queries | Becomes | Hydration |
|---|---|---|---|---|
| `islands/course-one.ts` | 1,407 | 47 | `components/course/CourseOne.tsx` + subcomponents | `client:load` |
| `islands/flashcard.ts` | 904 | 59 | `components/flashcards/Flashcards.tsx` | `client:load` |
| `islands/practice.ts` | 820 | 24 | `components/practice/Practice.tsx` | `client:load` |
| `islands/profile.ts` | 341 | 7 | `components/profile/Profile.tsx` | `client:load` |
| `islands/articles-browser.ts` | 150 | 13 | `components/articles/ArticlesBrowser.tsx` | `client:visible` |
| `islands/bot.ts` | 86 | 5 | `components/bot/Bot.tsx` | `client:visible` |
| `lib/nav.ts` | 52 | 7 | `components/shell/Nav.tsx` | `client:load` |
| `lib/modal.ts` | 147 | 8 | `components/ui/Modal.tsx` | as needed |
| `lib/auth-ui.ts` | 298 | 11 | `components/auth/AuthDialog.tsx` | `client:load` |
| `lib/reveal.ts` | 86 | 7 | `hooks/useReveal.ts` | — |
| `lib/toast.ts`, `theme.ts`, `back-to-top.ts` | 76 | 6 | store + hooks | — |

Pure and reusable as-is, no conversion: `storage.ts`, `shuffle.ts`, `track.ts`, `utils.ts`, `article-summary.ts`, `auth.ts` (service layer only).

Because React owns the DOM, the corresponding markup in the 10 Astro pages (~1,678 lines) is rewritten into those components. Each page keeps a thin Astro shell for `<Base>`, SEO, and JSON-LD.

### 7.3 Dead code removed with the old sections
`splitRevealWords()` (only consumer was `[data-reveal-words]` on the deleted statement) and `staggerSlabItems()` (only consumer was `.slab-item`). `useReveal` survives for the partner strip.

---

## 8. Test plan (D8)

### 8.1 Vitest — pure logic
`practice` adaptive tier transitions (easy/medium/hard promotion and demotion, accuracy windowing) · `parsePfBank` and the econ parser · `course-one`'s markdown transform · `shuffle` determinism under a seed · `storage` zod fallbacks on corrupt values · the Title/sentence-case helper.

### 8.2 Playwright — characterization, written against the CURRENT vanilla site first
Each spec is authored and green **before** any conversion, then must stay green through it.

- **Practice:** select category → units → count → session runs → difficulty adapts → end session → summary.
- **Flashcards:** unit selection, both modes (Answer with Term / Answer with Definition), progress persists to `fynoptic.flashcards.v1`, restart deck.
- **Course:** module completion writes `ff_course_progress`, progress rail updates, assessment gate, certificate name flow.
- **Articles:** search, filter, sort, load-more, read-marking; reader page renders body and summary.
- **Auth (emulator, D9):** sign up, sign in, sign out, reset, error surfaces, nav avatar/initials reflect state across a navigation.
- **Profile:** display-name save, avatar upload.
- **Shell:** theme toggle persists across pages, mobile menu, modals, toasts.
- **Hero (updated, D15/F11):** CTA strings retargeted; rotation test rewritten to assert *exactly one word visible at a time* rather than reading `.first()`.
- **Rack:** all three modes — scroll-driven focus at sampled progress points, reduced-motion tabs, narrow tabs, click-to-jump landing in the dwell plateau, keyboard traversal.
- **Ticket:** scroll advances focus, click takes over, SCAN/ALL SHARP, per-row notes.
- **A11y (F1):** skip link present and focusable; `.sr-only` content reachable in the accessibility tree; axe pass on all pages, both themes.

### 8.3 Visual regression
Finish the comparator in `visual-diff.mjs` (F4). Baselines captured **after** the redesign is approved, then enforced through the React conversion — so the conversion must not change a single pixel. That is the strongest possible signal for a rewrite of this size.

Matrix: 11 pages × 2 themes × 3 viewports.

### 8.4 CI (F3)
`ci.yml` gains: `astro check` → `build` → `vitest` → Firebase emulator boot → `playwright test` → visual diff. All blocking.

---

## 9. Implementation phases

Each phase is one or more commits and does not start until the previous phase's verification passes.

| # | Phase | Verification |
|---|---|---|
| 0 | Delete stale `worktree-site-qa` (F2); create `redesign-react` worktree | `git worktree list` clean |
| 1 | Vitest + emulator + CI wiring; **all** characterization specs written against current site | Full suite green on unmodified code |
| 2 | Fix F1 (`.sr-only`, skip link); promote a11y toggles site-wide (F10) | axe pass; a11y spec green |
| 3 | Type tokens + rule split; drop Sora; trim Spectral | Font assertions; no Sora request; suite green |
| 4 | Shell to React: Nav, Footer, Modal, AuthDialog, toasts, theme + `useSyncExternalStore` stores | Shell + auth specs green on all 11 pages |
| 5 | Hero: two-column, odometer rotating word, ticket with per-row notes and scroll focus | Hero + ticket specs; period alignment asserted at every word |
| 6 | Rack focus section; delete the three old sections and their dead reveal helpers | Rack spec, all three modes |
| 7 | Spacing/alignment pass S1–S6 | Visual baselines captured here |
| 8 | `/accessibility` and `/privacy` | Content review by a human (R4) |
| 9 | Islands to React, one commit each, easiest → hardest: bot → articles-browser → profile → practice → flashcards → course-one | Per-island spec green + zero visual diff after each |
| 10 | Auth service last (R3) | Full suite; manual sign-in against the real project |
| 11 | Capitalization sweep (D11) with full before/after table | Suite green; table presented for veto |
| 12 | Merge to `main` | Full suite + build + manual pass on all 11 pages, both themes |

**Rollback:** every phase is its own commit, so any phase reverts independently. Phase 9 is deliberately one commit per island for exactly this reason.

---

## 10. Open items

- **O1** — Missing practice banks 2of6–6of6 and the flashcard shortfall (F5, F7, F8). Not blocking; raise the numbers when content lands.
- **O2** — Privacy page needs a human read before shipping (R4).
- **O3** — Partner agreements: label kept per D14; if the agreements aren't documented, revisit the wording.
