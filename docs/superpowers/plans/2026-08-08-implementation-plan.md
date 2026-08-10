# Implementation Plan — Direction B + Full React Rebuild

Companion to `2026-08-08-direction-b-react-rebuild.md` (the spec). That document says *what* and *why*; this one says *how*, in order, with the verification gate for each step.

Date: 2026-08-08
Status: **awaiting approval — no code written**

---

## How to use this document

- Phases are strictly ordered. A phase does not begin until the previous phase's **Gate** passes.
- Every phase lists **Files**, **Work**, **Gate**. The Gate is a command plus an observable result, never "looks right".
- Each phase is one or more commits on `redesign-react`. Phase 10 is deliberately one commit per island.
- Line references are to `main` at `1917dff`.

### Standing invariants

These hold at every commit. If any breaks, stop and fix before continuing.

| # | Invariant | How it's checked |
|---|---|---|
| I1 | `npm run build` produces 253 pages, 0 errors, 0 warnings | Phase gate on every phase |
| I2 | No page scrolls horizontally at 390 / 768 / 1024 / 1280 / 1440, both themes | Playwright `a11y.spec.ts` |
| I3 | Every legacy class name the old JS toggled is still emitted | Appendix D checklist |
| I4 | localStorage and cookie shapes are byte-compatible with what shipped | Appendix B contracts + unit tests |
| I5 | No module with an import-time `window` access is imported by an SSR'd component | `astro check` + build |
| I6 | Nothing is hidden by default and revealed only by animation | `a11y.spec.ts` reduced-motion pass |

### Correction to the spec

The spec's §8.2 lists "read-marking" as an articles behavior to characterize. **It does not exist.** There is no read/unread feature anywhere — `Entry.read` in `articles-browser.ts:17` is reading-time in minutes, not read state, and no storage key backs it. Read-marking is dropped from the test plan; if it is wanted it is a new feature, tracked separately as O4.

---

## Phase 0 — Hygiene

**Work**

1. Delete the stale worktree and branch (F2). It has 0 commits ahead of `main` and merging it would revert the hero redesign.
   ```
   git worktree remove .claude/worktrees/site-qa
   git branch -D worktree-site-qa
   ```
2. Create the working branch.
   ```
   git worktree add .claude/worktrees/redesign-react -b redesign-react
   ```
3. Record a baseline: `npm run build` output, page count, and the current `hero.spec.ts` result.

**Gate** — `git worktree list` shows only the main checkout and `redesign-react`. `npm run build` succeeds. `npx playwright test` shows 6 passed.

---

## Phase 1 — Test infrastructure and characterization

The largest phase and the whole safety argument. Everything here is written against the **current vanilla site** and must be green *before* a single line of application code changes.

### 1a — Runners and CI

**Files:** `package.json`, `vitest.config.ts` (new), `firebase.json` (new), `.firebaserc` (new), `.github/workflows/ci.yml`, `playwright.config.ts`

**Work**
- Add dev deps: `vitest`, `@vitest/coverage-v8`, `jsdom`, `firebase-tools`, `pixelmatch`, `pngjs`.
- `vitest.config.ts`: `environment: 'node'` by default, `jsdom` only for the two specs that need it. Include `tests/unit/**/*.test.ts`.
- Scripts: `test:unit`, `test:unit:watch`, `test:e2e`, `test:visual:capture`, `test:visual:diff`, `test:all`.
- `firebase.json` with the auth emulator on a fixed port; `.firebaserc` pointing at `financefirst-ee059` (emulator does not contact it, but the project id must resolve).
- `playwright.config.ts`: keep `webServer`, add `retries: process.env.CI ? 1 : 0`, add a `reducedMotion` project so those specs run in a dedicated project rather than per-test emulation.
- `ci.yml`: `check` → `build` → `test:unit` → emulator start → `test:e2e` → `test:visual:diff`. All blocking.

**Gate** — `npm run test:unit` runs (0 tests, exits 0). `firebase emulators:start --only auth` boots. CI green on a no-op commit.

### 1b — Auth emulator seam

**Files:** `src/lib/auth.ts`

The one production file this phase touches. Additive only.

**Work** — after `getAuth(app)` at `:48`, connect to the emulator when `PUBLIC_AUTH_EMULATOR` is set:
```ts
if (import.meta.env.PUBLIC_AUTH_EMULATOR) {
  connectAuthEmulator(auth, import.meta.env.PUBLIC_AUTH_EMULATOR, { disableWarnings: true });
}
```
Guarded so production is byte-identical when the var is absent.

**Gate** — with the var set, a Playwright spec creates a user and signs in against the emulator. With it unset, `npm run build` output for `auth.ts` is unchanged apart from the guard.

### 1c — Unit tests: extract-free

Logic already pure. No production code moves in this step; tests import the module directly where possible, otherwise they are written now and wired in Phase 10 when the function is extracted.

| Test file | Target | Cases |
|---|---|---|
| `tests/unit/shuffle.test.ts` | `lib/shuffle.ts:5` | Returns a new array; input not mutated; same multiset; length preserved |
| `tests/unit/article-summary.test.ts` | `lib/article-summary.ts:28,34` | 225 wpm; floor of 3 min; blurb cuts at 160 on a word boundary; entity decoding (`&nbsp; &amp; &lt; &gt; &#8217; &rsquo;`); `<script>`/`<style>` stripped |
| `tests/unit/storage.test.ts` | `lib/storage.ts` | zod fallbacks on corrupt JSON; `getTheme` reads a raw string not JSON; write swallows quota errors; all four key names exact |
| `tests/unit/md-to-html.test.ts` | `course-one.ts:190` | Every supported syntax (Appendix C); confirms links/images/tables/ordered lists are **not** supported so the rewrite can't silently "improve" it |

### 1d — Unit tests: the adaptive algorithm

The highest-value tests in the suite. `maybeAdapt` (`practice.ts:377-395`) is already DOM-free and lifts out unchanged.

**File:** `tests/unit/practice-adaptive.test.ts`

| # | Case | Setup | Expect |
|---|---|---|---|
| 1 | Promotion boundary, at | N=10, 9/10 correct, tier `medium`, hard pool non-empty | → `hard` |
| 2 | Promotion boundary, just under | N=10, 8/10 (0.80) | no change |
| 3 | Promotion exact threshold | acc exactly 0.85 (N=20, 17 correct) | promotes (inclusive) |
| 4 | Demotion boundary, at | N=10, 5/10 (0.50), tier `medium`, easy non-empty | → `easy` (inclusive) |
| 5 | Demotion, just above | N=10, 6/10 (0.60) | no change |
| 6 | Dead band | 0.5 < acc < 0.85 | no change |
| 7 | Ceiling | tier `hard`, acc 1.0 | stays `hard` |
| 8 | Floor | tier `easy`, acc 0.0 | stays `easy` |
| 9 | **Blocked by drained pool** | tier `medium`, acc 0.9, `byDiff.hard = []` | stays `medium` |
| 10 | Blocked checks *remaining* not original | hard pool started at 20, all `shift()`ed out | stays `medium` |
| 11 | One tier per call | tier `easy`, acc 1.0, medium+hard non-empty | → `medium`, never `hard` |
| 12 | Rolling window | history length 25, N=10 | uses last 10 only |
| 13 | Empty history | `history = []` | early return, no change |
| 14 | Non-adaptive | `adaptive: false` | early return |
| 15 | N=15 promote | 13/15 ≈ 0.8667 | promotes |
| 16 | N=15 no-promote | 12/15 = 0.80 | no change |

Plus `createSession` (`:330-375`): bucketing flattens topics into one pool per tier; missing topic silently skipped; non-array tier silently skipped; start tier is `medium` → `easy` → `hard`; all-empty returns `null`.

Plus `drawQuestion` (`:418-432`) — **the second, hidden writer of `currentDiff`**: fallback order is `current → medium → easy → hard`; drawing from a fallback tier reassigns `currentDiff`; this happens even when `adaptive === false`; `shift()` consumes permanently so no question repeats.

Plus `normalizeQuestion` (`:397-408`): `answer` is a **string** matched against `choices`; a non-matching answer silently yields `answerIndex = 0`; `explanation` is always `''`; choices are copied but not shuffled.

### 1e — Unit tests: flashcard logic

**File:** `tests/unit/flashcard-logic.test.ts`

- Answer comparison (`flashcard.ts:756-764`): input is `.trim()`ed, **target is not**; both lowercased; exact equality otherwise. Pin the failure cases explicitly — a trailing period fails, internal double spaces fail, `"Certificate of deposit (CD)"` needs its parentheses. These are current behavior; the rewrite must not "fix" them silently.
- Case-insensitivity is **unconditional** today because `#case-insensitive` does not exist in the markup (`els.caseInsensitive` is permanently `null`, so `:762` always yields `true`). Test pins `caseInsensitive = true` as the shipped behavior.
- Deck id format is exactly `` `${unit}::${term}` `` (`:586`) — this is the localStorage key and a compatibility contract.
- `buildDeck` preserves unit-selection order then source order within a unit.
- MC distractors: built from a `Set`, so duplicate values collapse and **fewer than 4 options is possible**; the correct value is always present; rebuilt (re-randomized) on every render.

### 1f — Unit tests: course state

**File:** `tests/unit/course-state.test.ts`

- `parseStoredState` / `loadState` precedence: cookie `ff_dp_state_v2` first, then `localStorage.ff_dp_state`, then defaults.
- `saveState` writes **both** sinks; cookie is 180 days, path `/`, samesite lax.
- **Cross-page contract**: `profile.ts:104-133` derives m1 = `video && article`, m2 = `video && article && idExercise`, m3 = `video && article`, m4 = `article && auditSubmitted`, total 4. Test both modules against one fixture so a shape change fails loudly.
- Legacy fallback: `ARR6` vs `DP4` comparison picks `DP4` on ties (`count4 >= count6`).

### 1g — Characterization E2E

Written against the current site. Each spec is the behavioral contract for its island.

| Spec | Covers |
|---|---|
| `tests/e2e/shell.spec.ts` | Theme toggle persists across navigation and sets `data-theme` on **both** `<html>` and `<body>`; mobile drawer open/close via toggle, link tap, Escape, close button; scroll lock adds `no-scroll` + fixed body and restores scroll position; toast appears and self-removes after 3.5s |
| `tests/e2e/auth.spec.ts` | (emulator) Sign up, sign in, sign out, reset. Error copy for wrong password is the shared `"That email or password isn't right."`. Reset of an unknown email reports **success** (enumeration guard). Nav swaps to avatar/initials and `#user-btn` loses `data-modal-open` when signed in. Submit lock disables the button and sets `aria-busy` |
| `tests/e2e/practice.spec.ts` | Wizard steps 1→2→3 with back-nav; "select at least one unit" toast; category change clears topic selection; session runs; right-click and Alt-click eliminate a choice; Enter submits; prev/next navigation restores prior answers and eliminations; finish summary; end-session modal via × resets, **via Escape does not** (documented asymmetry) |
| `tests/e2e/flashcards.spec.ts` | Unit selection, select-all, clear-all; both modes; answer-target toggle is independent per mode; flip; prev/next wraps modulo; restart; progress persists across reload under `fynoptic.flashcards.v1`; reset-progress clears it; summary modal |
| `tests/e2e/course.spec.ts` | Pre-quiz gates module 1; mark-read unlocks on scroll-to-bottom; video anti-skip (seek forward snaps back, playbackRate forced to 1); ID exercise all-or-nothing; audit form output; post-quiz 80% pass gate; retake resets; progress rail and sidebar update; state survives reload |
| `tests/e2e/articles.spec.ts` | Search filters and debounces; all five sorts; load-more reveals 12 more and focuses the first new card; `/` focuses search; arrow keys move card focus; clear-filters resets everything |
| `tests/e2e/profile.spec.ts` | (emulator) Redirects to `/` when signed out; renders name, email, provider chip, joined/last-login, progress ring and bar; sign out redirects |
| `tests/e2e/bot.spec.ts` | (mocked route) User bubble appears, typing bubble appears then is replaced by the reply, error path, abort path. Asserts the reply is inserted as **text** — a `<script>` in the response must not execute |
| `tests/e2e/a11y.spec.ts` | axe on all 11 pages × 2 themes; skip link present and focusable; no horizontal scroll at 5 widths; reduced-motion pass asserts **nothing is stuck at opacity 0** |

**Two specs must be written to fail first**, because they encode the fixed behavior rather than the current behavior. They are marked `test.fixme` in Phase 1 and un-fixmed in Phase 2:
- skip link present (currently `display:none !important`)
- `.sr-only` content reachable in the accessibility tree (currently removed from it)

### 1h — Visual regression comparator

**Files:** `scripts/visual-diff.mjs`

`--capture-baseline` exists; the diff half does not (F4).

**Work** — add `--diff` mode: re-capture, compare with `pixelmatch` at threshold 0.1, write `tests/visual-diff/<name>.png` for any pair over 0.1% differing pixels, exit non-zero on failure. Extend `PAGES` to the 11 current routes (the list still names `.html` files from the pre-Astro layout) plus `/articles/<first-id>`. Mask the rotating hero word and the partner marquee — both animate and would false-positive every run.

**Gate for Phase 1** — `npm run test:unit` and `npx playwright test` fully green against **unmodified application code**, except the two `test.fixme`s. `npm run test:visual:capture` then `npm run test:visual:diff` reports zero diffs against itself. CI green.

---

## Phase 2 — Accessibility fixes

**Files:** `src/styles/legacy.css`, `src/layouts/Base.astro`, `src/components/Header.astro`

**Work**

1. **F1 — the serious one.** `legacy.css:1827-1828`:
   ```css
   /* remove skip-to-content everywhere */
   .skip-link, .sr-only { display: none !important; }
   ```
   `display:none` removes a node from the accessibility tree, so every visually-hidden label on the site is currently invisible to screen readers, not just to sighted users. Replace with a proper clip-based utility and restore the skip link as visible-on-focus. Delete the `!important` override entirely.
2. **F10** — promote the high-contrast and dyslexia-font toggles out of `course-one.ts` (where they are dead wiring against `#toggle-hc` / `#toggle-dys`, elements that exist nowhere) into a site-wide preferences store, applied in `Base.astro`. Keys `ff_a11y_hc` / `ff_a11y_dys` and the `body.hc` / `body.dyslexia` classes are preserved exactly.
3. Add a pre-paint inline theme script in `<head>`. Today `initTheme()` runs at `DOMContentLoaded` and `<html>` carries no `data-theme` until then, so a stored `light` preference flashes dark on every navigation.

**Gate** — the two `test.fixme` specs un-fixmed and passing. axe clean on all 11 pages, both themes. Manual: Tab from a cold load reveals the skip link and it moves focus to `#main`. Visual diff shows changes **only** to the skip link's focus state.

---

## Phase 3 — Type system

**Files:** `src/styles/redesign.css`, `src/layouts/Base.astro`, `package.json`

**Work**

1. `redesign.css:25` — replace the single `--display-face` with three tokens:
   ```css
   --display-face:  'Helvetica Neue', Helvetica, Arial, sans-serif;
   --editorial-face:'Spectral', 'Iowan Old Style', Georgia, 'Times New Roman', serif;
   --wordmark-face: var(--editorial-face);
   --mono-face:     ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
   ```
2. Split the rule at `redesign.css:161-165` in three (spec §5). `.art-title` moves to the sans list (it is a browse-card title, not reading). `.reader-title` and `.reader-body h2, .reader-body h3` take `--editorial-face`. `.logo-text` at `:103` takes `--wordmark-face`.
3. `Base.astro:16` — drop `@fontsource-variable/sora`. Remove the package.
4. `Base.astro:17-20` — reduce Spectral from 400/500/600/400-italic to **600 only**.

**Gate** — Playwright asserts computed `font-family`: hero h1 = Helvetica, hero subhead = Inter, `.logo-text` = Spectral, `.reader-title` = Spectral, a `.reader-body h3` = Spectral, an `.art-title` = Helvetica, nav link = Inter. Network assertion: zero requests matching `/sora/i` on any page. `npm run build` clean. Visual diff expected to change on every page — **capture new baselines at the end of Phase 8, not here.** Until then visual diff is advisory.

---

## Phase 4 — State substrate

No UI change. Builds the seam every later phase depends on.

**Files:** `src/lib/store.ts` (new), `src/lib/theme.ts`, `src/lib/toast.ts`, `src/lib/storage.ts`, `src/lib/auth.ts`, `src/hooks/*.ts` (new)

**Context:** none of the 13 lib modules exposes a subscribe seam today. Shared state lives in the DOM — `data-theme` attributes, `hidden`, class names — and is read back with `getElementById` at the moment of use. The only cross-module signals are two untyped window events: `auth-ready` and `avatar-updated`.

**Work**

1. `store.ts` — a ~30-line `createStore<T>(initial)` returning `{ get, set, subscribe }` with `subscribe` returning an unsubscribe. This is the `useSyncExternalStore` contract and nothing more.
2. Convert to stores, keeping every existing exported function working unchanged:
   - `themeStore` — `'dark' | 'light'`. Writes `data-theme` to both `<html>` and `<body>` (both, as today) and persists via `storage.setTheme`.
   - `toastStore` — array of `{ id, message, variant }`. `showToast` keeps its exact signature and pushes to the store.
   - `authStore` — `{ user, status: 'loading' | 'in' | 'out' }`, fed by a single `onAuthStateChanged`. **Replaces the `avatar-updated` window event and the second subscription on `/profile`** (today `/profile` runs its own `onAuthStateChanged` alongside `initAuthWatcher`'s).
   - `progressStore` — wraps `ff_course_progress` and the `CourseState` cookie/localStorage pair.
   - `prefsStore` — theme-adjacent a11y prefs from Phase 2.
3. Hooks in `src/hooks/`: `useTheme`, `useToasts`, `useAuth`, `useCourseProgress`, `usePrefs` — each a `useSyncExternalStore` one-liner over its store, with an SSR snapshot that never touches `window`.
4. **`auth.ts` SSR hazard.** Its module-level async IIFE (`:119-135`) awaits persistence, drains `getRedirectResult`, and dispatches a `window` event — at import time. Any React component that statically imports it breaks SSR. Move the IIFE behind an idempotent `ensureAuthReady()` called from a client effect, and keep `auth.ts` out of every server-rendered import graph.

**Gate** — `npm run test:unit` gains `tests/unit/store.test.ts` (subscribe/unsubscribe, no double-notify, snapshot stability under repeated `get`). All Phase 1 E2E still green — the old imperative inits still run and still work. Nothing visual changed; visual diff clean.

---

## Phase 5 — Shell to React

**Files:** `src/components/shell/*` (new), `src/components/auth/*` (new), `src/components/ui/Modal.tsx` (new), `src/layouts/Base.astro`, `src/components/Header.astro` → deleted, `src/components/Footer.astro` → deleted

**Work**

1. `Nav.tsx` — Direction B navbar. **`#user-btn` keeps its id, its two children (`#nav-avatar`, `#nav-initials`) and `data-modal-open`.** Today `initAuthWatcher` assigns `btn.onclick` directly (`auth.ts:199`); a React `onClick` on the same node would be clobbered, so the imperative watcher must be fully retired in this phase, not left running alongside.
2. `Footer.tsx` — four columns. Column heads are `h3` with the mono label class; the CSS must be scoped `.site .s-label` or `.site h3` wins on specificity and they render in the heading face.
3. `Modal.tsx` on Radix Dialog — replaces `modal.ts`'s hand-rolled focus trap, scroll lock, Escape and backdrop handling. This also resolves the standing `no-scroll` conflict between `modal.ts` and `nav.ts`, where both write the same class and inline body styles and both bind a global Escape.
4. `AuthDialog.tsx` — replaces `auth-ui.ts` including `injectAuthModals`, which today builds all three auth modals from a template literal and appends them to `document.body` at runtime. **No `.astro` file contains this markup**, so it moves wholesale into JSX. Preserve: `novalidate` semantics, the 6-character minimum, the password-match check, the shared wrong-credential string, the reset enumeration guard, submit locking with `aria-busy`, and the 8s `auth-ready` timeout with its "Sign-in is unavailable right now" fallback.
5. `Toaster.tsx` — renders `toastStore`. Keep the `.toast-container` / `.toast` class names and the 3.5s dismissal.
6. `Base.astro` — replace the six imperative inits with `<Nav client:load />`, `<Toaster client:load />`, `<AuthDialog client:load />`, `<Footer />`. Retire `initNav`, `initModals`, `initAuthWatcher`, `initAuthUI`, `initToasts`; `initTheme` becomes the pre-paint script from Phase 2 plus `useTheme`.

**Gate** — `shell.spec.ts` and `auth.spec.ts` green on **all 11 pages**. Escape closes a modal but not while the mobile drawer is open. Scroll position restores correctly after modal and drawer. Sign in on `/practice`, navigate to `/profile`, still signed in. Visual diff advisory only (nav and footer intentionally redesigned).

---

## Phase 6 — Hero

**Files:** `src/components/hero/Hero.tsx`, `src/components/hero/RotatingWord.tsx`, `src/components/hero/Ticket.tsx` (new), `src/components/hero/PartnerStrip.tsx` (new), `src/pages/index.astro`

**Work**

1. Two-column grid, `1.04fr / .96fr`. **Both children need `min-width: 0`** — a grid item defaults to `min-width: auto` and the partner track is `width: max-content`, which otherwise drags the left column past the container and crushes the ticket. (Found and fixed in the prototype.)
2. `RotatingWord.tsx` — odometer per spec §6.2. Measure each word once from a hidden span, re-measure on resize and after `document.fonts.ready`, animate container width on the same 380ms curve as the swap. SSR renders the current fixed-width markup for one frame, then switches post-hydration.
3. `Ticket.tsx` — 7 rows as `role="tab"` buttons with per-row notes (spec §6.2 table). Focus advances with hero scroll; click takes manual control; SCAN / ALL SHARP toggles defocus.
4. `PartnerStrip.tsx` — moves into the left column, no longer full-bleed.
5. **Update `hero.spec.ts` (F11).** Two CTA assertions retarget to the new strings. The rotation test currently does `page.locator('#hero-heading span').filter(...).first()`, which breaks because the odometer keeps all five words mounted — rewrite it to assert **exactly one word is visible at a time** (checking rendered visibility, not DOM presence). That is a stronger guarantee than what it replaces.

**Gate** — `hero.spec.ts` green with the strengthened rotation test. New assertion: the full stop's left edge sits within 2px of the live word's right edge, sampled at **all five** words. Reduced motion shows word one, no animation. Ticket: scroll advances focus, click takes over, each row shows its own note, arrow keys traverse.

---

## Phase 7 — Rack focus section

**Files:** `src/components/rack/RackFocus.tsx` (new), `src/components/rack/rack-data.ts` (new), `src/pages/index.astro`, `src/lib/reveal.ts`

**Work**

1. `RackFocus.tsx` per spec §6.3. Lead outside the pin, grid inside. Three modes: rack / reduced-motion tabs / narrow tabs.
2. Delete from `index.astro`: `.statement` (`:55-63`), `.why-slab` (`:65-103`), `.final-cta` (`:112-130`), and the two `<hr class="section-divider">`.
3. Delete now-dead helpers: `splitRevealWords()` (`index.astro:148-160`, only consumer was `[data-reveal-words]` on the deleted statement) and `staggerSlabItems()` (`:163-167`, only consumer was `.slab-item`). `initReveal` survives for the partner strip.
4. Also delete `initCardReveal` (`reveal.ts:36-86`) — never called from anywhere in the repo.

**Gate** — `rack.spec.ts`: focus position sampled at 11 scroll fractions produces a monotonic 0→3 with visible dwell plateaus at each integer; click-to-jump lands inside the dwell plateau; keyboard traverses; reduced-motion and <900px both render the tab set with nothing blurred and nothing at opacity 0; pin releases after Practice and the footer is reachable. Performance: no more than 4 names + 2 panels carry a filter at any sampled frame.

---

## Phase 8 — Spacing and alignment

**Files:** `src/styles/redesign.css`, the Phase 5–7 components

**Work** — S1–S6 from spec §6.5:

| # | Fix |
|---|---|
| S1 | Pin `align-items: center` → `flex-start` with `padding-top: clamp(16px,2vw,26px)`; lead gets `padding-bottom: clamp(14px,2vw,22px)`. Closes a ~120px gap to ~30px |
| S2 | `.s-hero` bottom padding `clamp(30px,5vw,54px)` → `clamp(20px,3vw,36px)` |
| S3 | Panel-head separator becomes discrete spans with `margin: 0 .5em`, replacing one letter-spaced string |
| S4 | `.rk-phead` padding-bottom 11px → 14px, plus 2px top |
| S5 | Hero fine print: drop the `46ch` cap (the column already constrains it), .72rem → .75rem, margin-top 14px → 18px |
| S6 | Full vertical-rhythm pass: one scale, every box's padding and gap vetted against it, at 1440 / 1280 / 1024 / 768 / 390, both themes |

**Gate** — manual review at all five widths × 2 themes. No horizontal scroll (I2). **Capture new visual baselines here.** From this commit forward, visual diff is blocking.

---

## Phase 9 — Accessibility and privacy pages

**Files:** `src/pages/accessibility.astro` (new), `src/pages/privacy.astro` (new), `src/components/shell/Footer.tsx`

**Work**

`/accessibility` — describes what is true *after* Phase 2: keyboard operation, skip link, reduced-motion support, the high-contrast and dyslexia-font toggles, contrast targets, and how to report a barrier. Nothing claimed that is not implemented.

`/privacy` — grounded strictly in verified behavior:
- Firebase Auth stores email, display name, optional avatar. Avatar files upload to Firebase Storage at `avatars/{uid}/{timestamp}-{filename}`, images only, 3 MB cap.
- Local-only, never transmitted: `ff_course_progress`, `ff_dp_state` / `ff_dp_state_v2`, `ff_user_name`, `ff_risk_audits`, `fynoptic.flashcards.v1`, `fynoptic-theme`, `ff_a11y_hc`, `ff_a11y_dys`.
- **No analytics.** `track.ts` only writes to the console; Firebase Analytics is never initialised despite a `measurementId` sitting in the config. No third-party ad or tracking scripts.
- One external service receives user input: the chat assistant at `fixitbotbackend.onrender.com` (`bot.ts:11`). Messages typed into `/bot` are sent there. This must be disclosed.

**Gate** — both pages build, are linked from the footer, pass axe in both themes, and are in the visual baseline. **R4: a human reads the privacy page before merge.**

---

## Phase 10 — Islands to React

One commit per island, easiest first, so a regression is bisectable to a single conversion. After each: that island's spec green **and zero visual diff**.

### 10a — bot (86 lines)

`Bot.tsx`. Messages become a state array; the seeded intro bubble in `bot.astro:27` becomes the initial message. Preserve: the 60s abort (the backend is a free Render instance that cold-starts 20–50s), the two distinct error strings, and — critically — **`textContent` semantics**. Replies are currently inserted as text and must never become `dangerouslySetInnerHTML`.

Fix while converting: there is no send-lock today, so a double submit produces two typing bubbles and `removeTypingBubble` (a first-match `querySelector`) removes the wrong one.

### 10b — articles-browser (150 lines)

`ArticlesBrowser.tsx`. `matching()` becomes a `useMemo`; `Entry` drops its `el` handle.

**Constraint:** all 244 cards are server-rendered today and `visible` only toggles `hidden`, so the page is fully readable with JS off. Keep the Astro-rendered cards and let React control visibility — do **not** move card rendering into the client, or 244 articles lose their no-JS path and their SSR content.

Fix while converting: `onSearch` currently runs the full filter+sort twice per keystroke batch (once in `render()`, once to count results for `track`).

### 10b-2 — article read-marking (O4, new feature)

Deliberately a **separate commit after** 10b, so the conversion keeps its zero-visual-diff gate and this feature carries its own baseline.

**Files:** `src/lib/storage.ts`, `src/pages/articles/[id].astro`, `src/components/articles/ArticlesBrowser.tsx`

**Work**
- New key `ff_articles_read` — `string[]` of article ids, zod-validated, same read/write helpers as the other four keys in `storage.ts`.
- `articles/[id].astro` is currently a pure static page with no `<script>` at all. Add a minimal client island that records the id on mount. Keep the page server-rendered; do not move the body into React.
- Browse cards get a read affordance and the sort/filter control gains an unread option.
- The mark itself is local-only — it must appear in the privacy page's local-storage list (Phase 9). If Phase 9 has already shipped, amend it in this commit.

**Gate** — new `tests/e2e/articles-read.spec.ts`: visiting an article marks it read; the mark survives reload; browse reflects it; the filter works; clearing storage resets it. Full suite green. New visual baseline for `/articles` captured in this commit and noted in the message.

### 10c — profile (341 lines) + settings panel (O5)

`Profile.tsx`. This island is mostly dead code.

**The audit's "six elements with no markup" is wrong — there are eight.** `profile.astro` contains zero `<form>` and zero `<input>`. Missing: `#settings`, `#edit-open`, `#edit-cancel`, `#settings-form`, `#verify-btn`, `#input-photo-file`, and — omitted even from the file's own header comment — `#input-name` and `#input-photo`. Five of six event handlers never attach.

**O5 resolved — build the panel for real.** The Firebase side already works; only markup was ever missing. Scope:

- **Display name** — text input, saved via `updateProfile({ displayName })`, mirrored to `ff_user_name`. **This is the sole writer of the name the certificate prints (O6).**
- **Avatar upload** — reuse `uploadAvatar()` unchanged: `image/*` only, 3 MB cap, path `avatars/{uid}/{ts}-{filename}`, `cacheControl: public,max-age=31536000`. Add the **progress UI that was never built** — today the `state_changed` callback is an empty body with a comment saying so. Wire `snapshot.bytesTransferred / totalBytes` to a determinate bar, and add a cancel path (`task.cancel()`), which also doesn't exist today.
- **Avatar preview** — local object URL, but revoked on unmount rather than the current bare 5s `setTimeout`.
- **Photo URL** — text input as an alternative to upload; upload wins when both are set (current precedence).
- **Verify email** — button shown only when `!user.emailVerified`, calls `sendEmailVerification`.
- **`#prov`** — bind it. It's a live bug: the Provider tile is never written and permanently renders `—`.

The `avatar-updated` window event disappears — `authStore` replaces it, which also removes the second live `onAuthStateChanged` subscription this page currently runs alongside `initAuthWatcher`'s.

**Gate additions** — `profile.spec.ts` (emulator): save a name and see it in the nav; upload a fixture image and see the progress bar advance then the avatar update; reject a non-image; reject a >3 MB file; cancel mid-upload; verify-email button hidden once verified; `#prov` shows the real provider.

### 10d — practice (820 lines)

`Practice.tsx` + `usePracticeSession`. The extracted pure functions from 1d move here unchanged; their tests must stay green through the move.

Preserve exactly: the two writers of `currentDiff`; destructive `shift()` consumption with empty-tier checks against *remaining* counts; the hidden `<select multiple>` becomes a `Set<string>` but category change still clears topic selection; `answerIndex` fallback to 0.

Fix while converting: the triple-retry of one path in `loadPF` (F6); paths become root-relative; the three divergent accuracy formulas collapse to one helper; `explanation` is always `''` so the dead feedback branches go; `#reset-btn` ships enabled with no session.

**O7 resolved — dismiss only.** Escape, backdrop click and × all just close the summary and leave the session running. Ending a session becomes an explicit labelled button inside the modal (`End Session`, destructive styling). This is a deliberate behavior change from today, where × silently wipes the session: a destructive action should never be what Escape does.

`practice.spec.ts` updates in lockstep — the existing assertion that × resets becomes an assertion that it does *not*, plus a new one for the explicit button.

### 10e — flashcards (904 lines)

`Flashcards.tsx` + subcomponents per the wizard steps.

The single biggest simplification: `setAnswerInteractivity()` mutates six things from one derived boolean and is called from five places — it collapses to one `const locked` passed as props. `is-front` is computed in two duplicated places today (a latent divergence bug) and becomes one derived value.

Preserve exactly: the `${unit}::${term}` id format and the `{answers: {id: {correct, attempts, lastAt}}}` storage shape (I4); the two independent answer-target variables; `data-step` on the container, because `legacy.css:5161-5163` drives step layout off that attribute and conditional unmounting alone will not reproduce it; every toggled class name (Appendix D).

Delete: the import-time `#a11y-live` IIFE (it touches `document.body` at module scope and breaks SSR) and the `announce()` function it exists for, which is `void`-ed and never called. Delete `#empty-state`, which is only ever set to hidden.

Replace: the native `confirm()` on reset-progress with a Radix dialog; the nested `setTimeout` flip animation with framer-motion.

### 10f — course-one (1,407 lines)

The hardest. Convert last.

Split into `CourseOne.tsx`, `PreQuiz.tsx`, `Module.tsx` ×4, `IdExercise.tsx`, `RiskAudit.tsx`, `PostQuiz.tsx`, `Certificate.tsx`, `ProgressSidebar.tsx`, plus `useCourseState`.

`updateLocks()` — called from 12 sites and re-runs lazy loaders, mutates every section, rewrites the sidebar and writes progress — becomes derived render. **The `m1Loaded…postLoaded` latches change meaning under StrictMode double-invocation**; loaders must become idempotent by construction, not by latch.

`mdToHtml` extracts unchanged (pure, tested in 1c) and its output goes through `dangerouslySetInnerHTML`. `enhanceArticle` mutates that same subtree post-render (adds `.lead`, backfills heading ids, prepends a TOC) — it must become part of the transform, not a second pass over React-owned DOM.

Video gating is the most imperative code in the repo: injected overlay button, six listeners, anti-skip via `currentTime` writes, forced `playbackRate`. Encapsulate in `useVideoGate(ref)` and keep the 95% completion threshold.

**O6 resolved — fix and ship the certificate.** `.certificate { display:none }` is unlocked by `.certificate.ready`, and nothing has ever added that class, so the section has never rendered. Work:

- Render the certificate conditionally on `state.postQuiz.pass` instead of the class dance. Keep `.certificate` / `.certificate.ready` in the CSS so print styles still match.
- **Learner name** comes from `ff_user_name`, written by the profile panel (O5), falling back to the account display name, then `"Learner"`. `#learner-name` in the course page has never existed and is not being reintroduced — one writer, in profile.
- `prepareCertificate()` keeps minting `FF-DP-<timestamp>` ids and the ISO date, and keeps setting `certificate.issued`.
- Print-to-PDF and the SVG→canvas→PNG badge export port as-is. Note both `<svg class="badge-svg">` instances define gradients (`#g`, `#g2`) and the export serializes `outerHTML` of the first — the gradient `<defs>` must stay inside that same `<svg>` or the PNG renders unfilled.

**O8 resolved — author the 9 missing items.** `public/data/id-exercise.json` has 1 item; `courseone.astro:216` promises 10. I write 9 more matching the existing shape (prompt, choices, correct index, `countermove`, `rationale`), covering dark-pattern tactics already taught in modules 1–3. **Presented for accuracy review before merge** — this is instructional content, not code.

**Gate additions** — `course.spec.ts`: passing the post-quiz at ≥80% reveals the certificate; it prints the profile-set name; the badge PNG downloads with a non-empty body; failing keeps it hidden; the ID exercise loads 10 items and grades all-or-nothing.

**Gate for each of 10a–10f** — that island's characterization spec green, full suite green, and **zero visual diff**. Zero is the target because the conversion is behavior-preserving by definition; any diff is either a bug or a deliberate change that needs a new baseline and a note in the commit.

---

## Phase 11 — Auth service

**Files:** `src/lib/auth.ts`

Last, per R3. Everything else is green and stable before the riskiest file moves.

**Work** — reduce `auth.ts` to a pure service layer: `auth`, the five action functions, `errorMessage`. Delete `initAuthWatcher` entirely — `Nav.tsx` + `authStore` cover it. Delete the `avatar-updated` listener. `ensureAuthReady()` from Phase 4 replaces the module-level IIFE.

Keep unchanged: the three-tier persistence cascade, the shared wrong-credential string, all 14 error mappings.

**Gate** — `auth.spec.ts` fully green against the emulator. **Then a manual pass against the real project**: Google popup sign-in, email sign-up with a real address, verification email received, password reset received, sign out. The emulator does not exercise the real `authDomain` and this is the one place that matters.

---

## Phase 12 — Capitalization sweep

**Files:** every page and component

**Work** — apply the D11 rule: Title Case for things you click or that label data; sentence case for anything that reads as prose. Article titles are already Title Case and are excluded (F12).

Boundary calls, decided: `Modules Completed` and `Available Courses` are stat/section labels → Title Case. `Copied to clipboard.` and `No questions available for that selection.` are sentences → unchanged. `No results` is a status → unchanged. Quiz answer options are full sentences → unchanged.

Produce `docs/superpowers/plans/capitalization-changes.md`: every changed string, its file:line, before and after. **Present for veto before committing.**

**Gate** — full suite green (several E2E specs assert on button text and will need updating in lockstep). Change table reviewed.

---

## Phase 13 — Merge

**Gate** — the full checklist:

- `npm run build` — 253+ pages, 0 errors, 0 warnings
- `npm run test:unit` — green
- `npx playwright test` — green, including reduced-motion project
- `npm run test:visual:diff` — zero unexplained diffs
- axe clean, 11 pages × 2 themes
- Manual: all 11 pages × 2 themes at 1440 and 390
- Manual: real-Firebase auth pass (Phase 11)
- Privacy page read by a human (R4)
- `git log --oneline redesign-react` reads as a clean phase-by-phase history

Then merge to `main` and push.

---

## Appendix A — Adaptive difficulty, exact specification

Extracted from `practice.ts:377-395` and `:418-432`. This is the contract the unit tests pin.

```
TRIGGER   after every submit, when adaptive && adaptWindow > 0 && asked % adaptWindow === 0
WINDOW    history.slice(-adaptWindow)          // rolling, always full at trigger time
ACCURACY  correctCount / slice.length           // plain float, no rounding or weighting

PROMOTE   acc >= 0.85   easy→medium (if medium remaining > 0)
                        medium→hard (if hard remaining > 0)
                        hard→hard    (ceiling, no branch)
DEMOTE    acc <= 0.50   hard→medium (if medium remaining > 0)
                        medium→easy (if easy remaining > 0)
                        easy→easy    (floor, no branch)
DEADBAND  0.50 < acc < 0.85  → no change

BLOCKING  checked against byDiff[target].length, the REMAINING unconsumed pool.
          A tier that started with 20 questions but has been drained blocks the move.
STEP      exactly one tier per call; easy can never reach hard in one adaptation.

SECOND WRITER — drawQuestion:
  tryOrder = [currentDiff, 'medium', 'easy', 'hard']
  first non-empty tier wins; arr.shift() consumes permanently; currentDiff = that tier.
  Runs even when adaptive === false, so displayed difficulty drifts as pools drain.

START     medium if medium non-empty, else easy if easy non-empty, else hard.
          Immediately overwritten by the first drawQuestion.
DEAD      history[].difficulty is written and never read.
```

## Appendix B — Storage contracts (I4)

| Key | Sink | Shape | Owner |
|---|---|---|---|
| `ff_dp_state` | localStorage | `CourseState` | course-one |
| `ff_dp_state_v2` | cookie, 180d, path `/`, samesite lax | same | course-one |
| `ff_course_progress` | localStorage | `string[]`, zod | storage.ts |
| `ff_user_name` | localStorage | raw string | course-one, profile |
| `ff_risk_audits` | localStorage | append-only array | course-one |
| `fynoptic.flashcards.v1` | localStorage | `{answers: {"unit::term": {correct, attempts, lastAt}}}` | flashcard |
| `fynoptic-theme` | localStorage | raw `'dark'`/`'light'` (not JSON) | storage.ts |
| `ff_a11y_hc`, `ff_a11y_dys` | localStorage | `'1'`/`'0'` | course-one → prefs |
| `ff_fixit_history`, `ff_reports` | localStorage | declared, **no callers** | storage.ts |

`CourseState` is a cross-page contract between `course-one.ts` and `profile.ts:104-133`. Changing its shape breaks the profile progress ring.

## Appendix C — `mdToHtml` supported syntax

Supported: fenced code with language class, `[!TIP]`/`[!NOTE]`/`[!WARNING]` callouts with optional bold title, blockquotes, `---`, `#`/`##`/`###` (h2/h3 get slug ids and anchor links, h1 does not), `-`/`*` unordered lists, `**bold**`, `*italic*`, `` `code` ``, blank-line paragraphs.

**Not supported** — the rewrite must not add these silently: links, images, tables, ordered lists, nested lists, h4+, strikethrough, footnotes.

No sanitization. Output goes to `innerHTML`. Safe only because the source `.md` files are first-party.

## Appendix D — Class names that must keep being emitted (I3)

All defined in `legacy.css`, not in component-local CSS. Emitting different names silently drops the styling.

`is-active`, `is-front`, `is-locked`, `is-correct`, `is-wrong`, `is-selected`, `is-eliminated`, `is-hidden`, `ok`, `bad`, `flip-in`, `flip-out`, `btn-ended`, `ending`, `end-chip`, `in-view`, `hide`, `no-scroll`, `hc`, `dyslexia`, `page-loaded`, `practice-shell`, `flashcards-shell`, `toast`, `toast-container`, `locked-scrim`, `peekable`, plus `data-step` on `.fc-controls` and `#practice-wizard`, and `data-cat` on `<body>`.

## Appendix E — Dead code register

Delete during the phase that touches it; do not port.

| Item | Location | Why |
|---|---|---|
| `initCardReveal` | `reveal.ts:36-86` | Never called |
| `announce` + `#a11y-live` IIFE | `flashcard.ts:266-281` | `void`-ed; breaks SSR |
| `#empty-state` | `flashcard.astro:146` | Only ever hidden |
| `#case-insensitive` reads | `flashcard.ts:214,762` | Element does not exist |
| `explanation` branches | `practice.ts:547-552` | Always `''` |
| `cryptoRandomId` | `practice.ts:410-416` | Unreachable with real data |
| `HistoryEntry.difficulty` | `practice.ts:675` | Written, never read |
| `#fixit-modal`/`#report-modal`/`#writer-modal` | 4 pages | Empty, no opener |
| a11y toggle wiring | `course-one.ts:774-785` | Elements do not exist → moves to prefs |
| `#learner-name`/`#save-name` | `course-one.ts:787-797` | Do not exist |
| stepper wiring | `course-one.ts:730-737,799` | `.stepper-wrap .step` does not exist |
| `#print-audit` | `course-one.ts:1144` | Does not exist |
| `splitRevealWords`, `staggerSlabItems` | `index.astro:148-167` | Consumers deleted in Phase 7 |
| `getFixitHistory`/`setFixitHistory`/`getReports`/`setReports` | `storage.ts:47-62` | No callers |
| `#prov` | `profile.astro:66` | Never written → bind or delete |

## Appendix F — Resolved decisions

All five answered. Each expands its phase; none is open.

| # | Question | Resolution | Phase |
|---|---|---|---|
| O4 | Article read-marking | **Build it.** Sequenced *after* the conversion so 10b keeps its zero-diff gate | 10b-2 |
| O5 | Profile settings panel | **Build for real** — name, avatar upload with progress UI, verify-email, and bind `#prov` | 10c |
| O6 | Certificate | **Fix and ship.** Add `.ready` on an 80% pass; learner name flows from O5 via `ff_user_name` | 10f |
| O7 | End-session modal | **Dismiss only.** Escape, backdrop and × all just close; an explicit labelled button ends the session | 10d |
| O8 | `id-exercise.json` | **Author 9 more items** matching the existing shape, for review before merge | 10f |

Note the O5 → O6 dependency: the certificate needs a real learner name, and the only writer of `ff_user_name` is the profile panel (`#learner-name` in the course page has never existed). **O5 must land before O6.** Phase order already satisfies this — 10c precedes 10f.

## Appendix G — Still tracked, not in this changeset

| # | Item |
|---|---|
| O1 | Practice banks 2of6–6of6 missing (F5); flashcards at 611 vs the claimed 3,000+ (F7); practice at 1,286 vs 10,000+ (F8). Copy uses the site's existing figures per D10 — see R1 |
| O2 | Privacy page needs a human read before merge (R4) |
| O3 | Partner agreements — label kept per D14; revisit wording if the agreements aren't documented |
