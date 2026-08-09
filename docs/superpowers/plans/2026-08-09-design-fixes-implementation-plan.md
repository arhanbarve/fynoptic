# Design Fixes — Implementation Plan (Runbook)

**Branch:** `redesign-react` · **Date:** 2026-08-09 · **Status:** ready to execute
**Spec (what & why):** `2026-08-09-design-fixes-spec.md` — this document is *how & in what order*.

Nothing here restates the spec. Every step cites the spec section that defines its contract.
If this runbook and the spec disagree, **the spec wins** and this file is wrong.

---

## 0. STOP — read before running anything

### 0.1 The dev server must be killed first (HARD BLOCKER)

`playwright.config.ts:29-33` sets `webServer.reuseExistingServer: !process.env.CI`. A dev server
is **currently running on port 4321** (background task `bdm941sn7`, started with plain
`npm run dev`).

If Playwright is run while that server is up, it **reuses the dev server** instead of starting
`npm run preview` against the built `dist/`. The dev server was started without
`PUBLIC_AUTH_EMULATOR`, so:

> Vite inlines env vars at build time. Without `PUBLIC_AUTH_EMULATOR` set at build,
> `connectAuthEmulator()` is dead-code-eliminated, **the auth suite hits real production Firebase,
> and creates real accounts in `financefirst-ee059`.** This has already happened once in this
> project.

**Mandatory first action of every session that runs tests:**

```bash
# 1. confirm nothing is squatting on 4321
lsof -ti:4321 || echo "port clear"
# 2. kill the dev server task if it is up
#    (TaskStop bdm941sn7, or kill the pid from step 1)
# 3. re-verify
lsof -ti:4321 && echo "STILL UP — DO NOT RUN TESTS" || echo "clear, safe to proceed"
```

Re-verify after step 2. Do not take "I killed it" on faith.

### 0.2 The auth emulator must be up for commit 6

```bash
firebase emulators:exec --only auth "npm run test:e2e"
```

`--only auth` is deliberate: the auth emulator is pure Node. Adding `storage` or `firestore`
pulls in a JVM requirement this machine does not satisfy — empirically confirmed earlier in this
project. Do not "helpfully" broaden the flag.

`firebase.json` pins auth to port **9099**, matching the `PUBLIC_AUTH_EMULATOR` value baked into
`package.json`'s `test:e2e` script (commit `8982c0a`). Never run `npm run build && playwright test`
by hand — that path drops the env var.

### 0.3 Visual-diff is a change-detector, not a pass/fail gate

`scripts/visual-diff.mjs --diff` compares against `tests/baseline/`, captured from the **current**
design. Every commit in this batch deliberately changes pixels, so a naive "visual diff must be
green" gate would fail by construction and teach us to ignore it.

**Use it the other way round.** For each commit the spec predicts exactly which of the 12 baseline
pages should move. The signal is:

- a page on the **expected** list differs → look at the diff PNG, confirm the change is the
  intended one, move on;
- a page **not** on the expected list differs → **stop, that is a regression.**

After a commit is confirmed, re-capture the baseline so the next commit measures against the new
truth:

```bash
npm run test:visual:diff      # enumerate what moved
# ... eyeball tests/baseline/*-diff.png, confirm against the table in §3 ...
npm run test:visual:capture   # re-baseline, then commit
```

Baseline matrix: 12 pages × 2 themes × {390, 1440} = **48 screenshots**, 0.1% pixelmatch
threshold (`scripts/visual-diff.mjs:59`).

### 0.4 Working directory

Every agent, every command:

```
/Users/arhanbarve/Code/fynoptic/.claude/worktrees/redesign-react
```

**Not** `/Users/arhanbarve/Code/fynoptic`. A Phase 2 subagent already edited `main`'s checkout by
mistake in this project. Every dispatched agent gets an explicit "run `pwd` and confirm it ends in
`worktrees/redesign-react` before your first edit" instruction.

### 0.5 Git rules for this batch

- Commit to `redesign-react` only. **Do not merge to `main`.**
- Confirm via `AskUserQuestion` before each commit (global rule §6).
- `git status` before every git operation.
- Never `git commit -- <path>`. It stages *working-tree* content for that path regardless of the
  index, which already caused an unrelated staged diff to be swept into a commit in this project.
  Use `git add <specific files>` then `git commit`.
- No `Co-Authored-By` trailer.

---

## 1. Execution waves

Nine commits in five waves. Waves are serial; work **inside** a wave is parallel.

```
WAVE 0  ── commit 1 ────────────────────────────────  capitalization (already staged)
              │
WAVE 1  ── commit 2 ────────────────────────────────  navbar  ← fixes --header-h
              │                                          (waves 2 & 3 consume it)
              ├──────────────┬──────────────┐
WAVE 2     commit 3       commit 5       commit 4      articles │ rack │ courses
           (articles)     (rack)         (courses)
              │              │              │
              └──────────────┴──────────────┘
                             │
              ┌──────────────┼──────────────┐
WAVE 3     commit 7       commit 8       commit 9      flashcards │ practice │ about
              └──────────────┴──────────────┘
                             │
WAVE 4  ── commit 6 ────────────────────────────────  auth dialog (alone, highest risk)
```

**Why this order.**

- **Commit 2 first.** It corrects `--header-h` (spec §1.4), which commit 3's sticky `top` and
  commit 5's pin offset both read. Doing it later means doing 3 and 5 twice.
- **Commit 6 last.** It is the only commit touching live authentication. Sequencing it last means
  a rollback there strands nothing behind it.
- **Commits 3 and 5 are in the same wave but touch `redesign.css` and `RackFocus.tsx`
  respectively** — commit 5's edits are entirely inside the `.tsx`, so there is no file collision.
  Commit 4 also edits `redesign.css`.

> **File-collision rule.** Commits 3 and 4 both append to `redesign.css`. Two agents must never
> hold the same file. Resolution: within wave 2, the articles agent and the courses agent each
> write their CSS to a **scratch patch file** under `scratchpad/`, and the wave's integration
> step applies both to `redesign.css` in a defined order. This is the same
> parallel-agents-plus-gate pattern all 13 prior phases used.

### 1.1 Wave composition

| Wave | Commits | Parallel? | Files held |
|---|---|---|---|
| 0 | 1 | — | (already staged) |
| 1 | 2 | — | `redesign.css`, `typography.spec.ts`, `shell.spec.ts` |
| 2 | 3, 4, 5 | 3 agents + gate | `articles.astro`+`ArticlesBrowser.tsx`+`articles.spec.ts` / `courses.astro` / `RackFocus.tsx`; **`redesign.css` via patch files** |
| 3 | 7, 8, 9 | 3 agents, no gate | `flashcards/*`+`useFlashcardDeck.ts`+`flashcards.css` / `practice/*`+`practice.css`+`practice.spec.ts` / `about.astro`+`about.css` |
| 4 | 6 | — | `AuthDialog.tsx`, `redesign.css`, 3 spec files |

Wave 3 needs no gate: all three commits touch strictly disjoint files.

---

## 2. Step-by-step

### WAVE 0 — Commit 1: capitalization sweep

Already staged; approved 2026-08-09.

```bash
git status --short                       # expect the 25 staged files + the plan doc
git diff --cached --stat
```

1. Verify the staged set matches `docs/superpowers/plans/capitalization-changes.md` (88 strings,
   21 source files + 4 spec files).
2. `.gitignore` is also modified and staged — inspect it; include only if the change is
   intentional, otherwise unstage it.
3. **Note for later commits:** several strings this batch touches are already in this sweep —
   `"Available after completing course N"` → `"Available After Completing Course N"` (commit 4)
   and About's `"Meet the founders"` / `"Our partners"` (commit 9). **Check this doc before
   editing those strings so they are not double-applied.**
4. Gate: `npm run test:unit && npm run test:e2e`
5. Confirm → commit.

**Commit message**

```
style: apply D11 capitalization rule across the site

Title Case for clickables and data labels, sentence case for prose.
88 strings across 21 source files; the 4 affected specs are updated in
the same commit so the suite stays green.

Change table: docs/superpowers/plans/capitalization-changes.md
```

---

### WAVE 1 — Commit 2: navbar

**Spec:** §1. **Files:** `redesign.css`, `typography.spec.ts`, `shell.spec.ts`.

**Steps**

1. **Measure first.** Record header height, logo box, radii and wordmark font in both themes
   (Appendix A of the spec is the "before"). Script: `scratchpad/measure.mjs`.
2. Apply §1.1 — replace `redesign.css:85-95` with the `.header .logo img` block. **The selector
   change is the whole fix**; `legacy.css:3155` outranks the old bare `.logo img`.
3. Apply §1.1's `min-height` guard on `.header .nav`.
4. Apply §1.2 — `border-radius: 16px` → `6px` at `redesign.css:783`.
5. Apply §1.3 — `#nav-avatar` / `#nav-initials` `50%` → `6px`.
6. Apply §1.5 — `--wordmark-face` → `var(--display-face)` at `redesign.css:27`.
7. **Re-measure**, then set `--header-h` (§1.4) to the **measured** value. Do not use the spec's
   guessed 57px — measure it.
8. Update `typography.spec.ts:12` (Spectral → Helvetica) and its header comment (lines 3-6).
9. Add the AC-1.1 test to `shell.spec.ts`.

**Gate**

```bash
npm run test:unit
npm run test:e2e                 # dev server MUST be dead — see §0.1
npm run test:visual:diff
```

Expected visual movement: **all 12 pages, both themes, both widths.** The header and footer are
global. Confirm each diff is header/footer-only — a diff in page *body* content is a regression.

Then `npm run test:visual:capture`.

**Acceptance:** AC-1.1 … AC-1.6.

**Commit message**

```
fix(nav): constant header height across themes, consistent control shape

The header was 61px in dark and 69px in light. Two causes:

  - legacy.css:3155 (.header .logo img, specificity 0,2,1) was silently
    beating redesign.css:85 (.logo img, 0,1,1), so the mark rendered at
    40px rather than the 26px this layer intended. That rule had never
    taken effect.
  - the light-theme plate added `padding:4px` under `box-sizing:content-box`,
    growing the border box to 48px instead of painting inside a fixed one.

Both fixed by matching legacy's selector and switching to border-box at a
fixed 32px, with the plate painted inside it. min-height on .header .nav
stops any future child shifting the bar again.

Also: --header-h was declared 56px against a real 61px bar, so RackFocus's
pin, #progress-sidebar and .controls were all offset by 5px. Corrected to
the measured value.

Sign In (16px radius) and the signed-in avatar (50%) both go to 6px,
matching every other nav control. Wordmark moves to Helvetica in the
header and footer via one --wordmark-face change.
```

---

### WAVE 2 — Commits 3, 4, 5 (3 parallel agents + gate)

Dispatch all three in one message so they run concurrently. Each gets: the working-directory
check (§0.4), its spec section, its file list, and an explicit **"do not edit `redesign.css`
directly — write your CSS to `scratchpad/patch-<name>.css`"** instruction.

#### Agent A — commit 3: articles
**Spec §2** (all of it, including §2.4 which is now resolved).
Files: `src/pages/articles.astro`, `src/components/articles/ArticlesBrowser.tsx`,
`tests/e2e/articles.spec.ts`, → `scratchpad/patch-articles.css`.

Key points to hand the agent verbatim:
- The DOM move (§2.1) is the fix; `top: calc(var(--header-h) + 8px)` alone is not enough.
- The heading gap (§2.4) must use **`padding-block` longhand**, never a `padding` shorthand.
- `articles.spec.ts` needs **no** changes to existing tests — add AC-2.1 and AC-2.6 tests only.
- The IntersectionObserver goes in `ArticlesBrowser.tsx`. **No new island.**

#### Agent B — commit 4: courses
**Spec §3.** Files: `src/pages/courses.astro` → `scratchpad/patch-courses.css`.

- Check `capitalization-changes.md` before touching the mask string (§3.4).
- The `.soon-hint` transition needs its **own** `prefers-reduced-motion` opt-out — the global
  `* { animation: none }` at `redesign.css:352` covers the shake but not a transition (§3.3).
- Hint text: static string for all 7 cards unless Course 1's real progress can be read with **no
  new state**. Static is the approved fallback; do not invent a store.

#### Agent C — commit 5: rack
**Spec §4.** File: `src/components/rack/RackFocus.tsx`. **No CSS patch file needed.**

- Three edits only: lines 298, 305, 496.
- `dwellEase`, `focusFromProgress`, `progressForItem`, `useTrackProgress` are **off limits**.
- Verify no clipping at 1280×720 (§4.4 / AC-4.3). If the 4th name clips, **raise 68vh** — do not
  restore scroll length.

#### Gate (main thread, after all three report)

1. Apply `scratchpad/patch-articles.css` then `scratchpad/patch-courses.css` to `redesign.css`,
   in that order, each under its own commented section header.
2. Delete the patch files.
3. Run the full suite once for the whole wave.
4. Commit the three **separately** — `git add` the specific files per commit.

**Expected visual movement**

| Commit | Pages expected to move | Anything else moving = regression |
|---|---|---|
| 3 | `articles.html` | ✔ |
| 4 | `courses.html` | ✔ |
| 5 | `index.html` | ✔ |

**Acceptance:** AC-2.1 … AC-2.6, AC-3.1 … AC-3.4, AC-4.1 … AC-4.4.

---

### WAVE 3 — Commits 7, 8, 9 (3 parallel agents, no gate)

Fully disjoint files — dispatch all three, commit each as it lands.

#### Agent D — commit 7: flashcards
**Spec §6.** Files: `src/components/flashcards/FlashcardWizard.tsx`,
`src/hooks/useFlashcardDeck.ts`, `src/styles/flashcards.css`.

- **The binding constraint is §6.2.** `#unit-list`, `.unit-chip`, `.is-active`, `#select-all`,
  `#clear-all`, `#confirm-units`, `#block-units` must all survive. 8 assertions across 4 tests
  depend on them and **must pass unmodified**. If a spec edit feels necessary, the markup is wrong.
- `unitProgress()` is a **pure** export next to `buildDeck` / `checkFitbAnswer` / `buildMcOptions`;
  unit-test it in `tests/unit/flashcard-logic.test.ts`, which already imports that way.
- Remove the inline `style={{textAlign:'center'}}` at `FlashcardWizard.tsx:129` — it exists to
  emulate a `<button>` default and is wrong for a table row.
- Three legacy rules fight over `.unit-list` (`legacy.css:3481`, `:5078`, `:5206`). Win with the
  `.is-table` co-class, not with more `!important` on a bare selector.

#### Agent E — commit 8: practice
**Spec §7.** Files: `src/components/practice/PracticeWizard.tsx`, `src/styles/practice.css`,
`tests/e2e/practice.spec.ts`.

- **Keep the hidden `<select>` elements** (`#category`, `#question-count`) — §7.3. They back 4
  spec call sites and the `body[data-cat]` contract (I3). Do not delete them for tidiness.
- Fix `aria-pressed` → `aria-checked` on `.topic-btn` (§7.4). Genuine a11y defect; specs assert on
  `.is-selected`, so nothing breaks.
- Update the stale slug comment at `PracticeWizard.tsx:22-24` (§7.2).
- `#wiz-summary` must stay non-empty (`practice.spec.ts:56`).

#### Agent F — commit 9: about
**Spec §8.** Files: `src/pages/about.astro`, `src/styles/about.css`.

- **No "About Fynoptic" heading. No mission paragraph.** Amended by the user 2026-08-09; the page
  opens on Meet the Founders, which stays the `h1`.
- `about.css` is currently a 13-line comment reserving itself for exactly this. Use it; do not
  edit `legacy.css`.
- Check `capitalization-changes.md` before retitling the two headings (§8.3).

**Expected visual movement**

| Commit | Pages expected to move |
|---|---|
| 7 | `flashcard.html` |
| 8 | `practice.html` |
| 9 | `about.html` |

**Acceptance:** AC-7.1 … AC-7.6, AC-8.1 … AC-8.6, AC-9.1 … AC-9.6.

---

### WAVE 4 — Commit 6: auth dialog

**Runs alone. Highest risk in the batch. Do not parallelise, do not rush the gate.**

**Spec §5.** Files: `src/components/auth/AuthDialog.tsx`, `redesign.css`, `auth.spec.ts`,
`profile.spec.ts`, `profile-settings.spec.ts`.

**Pre-flight**

```bash
lsof -ti:4321 && echo "KILL IT FIRST" || echo "clear"
lsof -ti:9099 || echo "emulator not up yet — fine, emulators:exec starts it"
```

**Steps**

1. Merge `LoginModal` + `SignupModal` → one `AuthModal`, `id="auth-modal"` (§5.1).
   **`ResetModal` is not touched.**
2. Reuse `authDialogStore`'s existing mode as the tab state (§5.3). **No new store, no new hook.**
3. Preserve every id in §5.2. Only `#login-modal` / `#signup-modal` disappear.
4. Preserve every behaviour in §5.4 — in particular **four** independent `useSubmitLock`s
   (two panels × email + Google). Do not consolidate them.
5. Add: `setError('')` on tab switch. New requirement; the old code only cleared on open/close.
6. Visual changes per §5.5. **Submit centred** — that is AC-6.4 and the user called it out twice.
7. Rewrite the 9 assertion sites in §5.6. Add the 4 new tests.

**Gate**

```bash
firebase emulators:exec --only auth "npm run test:e2e"
npm run test:unit
npm run test:visual:diff
```

**Expected visual movement: NONE.** The dialog is closed at rest on all 12 baseline pages, so
every screenshot should be within threshold. **Any** page moving here is a regression — this is
the sharpest guard in the batch.

Then a manual keyboard pass (AC-6.6): tabs → Google → fields → submit → forgot link; arrows move
between tabs; Escape closes; focus returns to `#user-btn`.

**Acceptance:** AC-6.1 … AC-6.7.

**Rollback:** the component change and all three spec rewrites ship in **one** commit, so a single
`git revert` restores a consistent state. Do not split them.

---

## 3. Verification matrix

Run after every commit, in this order. A failure stops the wave.

| # | Command | Pass condition |
|---|---|---|
| 1 | `npm run check` | `astro check` clean — 0 type errors |
| 2 | `npm run test:unit` | all vitest suites green |
| 3 | `npm run test:e2e` | full Playwright suite green (**dev server dead**, §0.1) |
| 4 | `npm run test:visual:diff` | only the commit's expected pages moved (§0.3) |
| 5 | `npm run build` | 253 pages build clean |
| 6 | Playwright screenshot pass | both themes × {390, 900, 1440} |
| 7 | `npm run test:visual:capture` | re-baseline before the next commit |

`npm run test:all` chains 2 → 3 → 4 but **not** the re-baseline; run 7 by hand.

### 3.1 Expected-movement summary

| Commit | Pages that may move | Pages that must NOT |
|---|---|---|
| 1 capitalization | many (text only) | — |
| 2 navbar | **all 12** (header/footer are global) | body content of any page |
| 3 articles | `articles.html` | the other 11 |
| 4 courses | `courses.html` | the other 11 |
| 5 rack | `index.html` | the other 11 |
| 6 auth | **none** | **all 12** |
| 7 flashcards | `flashcard.html` | the other 11 |
| 8 practice | `practice.html` | the other 11 |
| 9 about | `about.html` | the other 11 |

---

## 4. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Playwright reuses the live dev server → auth suite hits **real Firebase** | **high** if unchecked | **severe** — real accounts created | §0.1 kill-and-verify, mandatory, every session |
| R2 | `--header-h` corrected to a guessed value rather than a measured one | medium | 5px offsets persist in rack + articles | Commit 2 step 7: measure, then set |
| R3 | Flashcard table breaks `.unit-chip` selectors | medium | 8 assertions, 4 tests | §6.2 is a hard constraint; specs must pass **unmodified** |
| R4 | Two wave-2 agents collide on `redesign.css` | high without mitigation | lost edits | Patch files + integration step (§1) |
| R5 | Auth merge breaks a flow no spec covers (Google popup) | medium | broken sign-in in production | Manual pass is already a merge gate; AC-6.6 keyboard pass |
| R6 | Capitalization double-applied in commits 4 and 9 | medium | wrong strings | Check `capitalization-changes.md` before editing those strings |
| R7 | 68vh rack pane clips at short viewports | medium | content cut off | AC-4.3 at 1280×720; raise vh, never restore scroll |
| R8 | A subagent edits `main`'s checkout | low (has happened) | wrong-branch commits | §0.4 `pwd` check in every agent prompt |
| R9 | Visual-diff noise trains us to ignore it | high | real regressions missed | §0.3 — expected-movement table, not a green/red gate |

---

## 5. Rollback

Each commit is independently revertible. Two need care:

- **Commit 3 (articles)** moves DOM. `git revert` restores `articles.astro` wholesale; the
  `ArticlesBrowser.tsx` observer effect reverts with it.
- **Commit 6 (auth)** ships the component and all three spec rewrites together — reverting
  restores three separate dialogs *and* their tests in one step. **Never split this commit.**

Whole-batch abort: `git reset --hard <sha-before-commit-1>` — **requires explicit approval**
(global rule §6, never `reset --hard` without asking).

---

## 6. Definition of done

- [ ] All 9 commits on `redesign-react`; `main` untouched
- [ ] Every AC in spec §1–§8 verified, not assumed
- [ ] Full unit + e2e suite green on the final commit
- [ ] Visual-diff movement matches §3.1 exactly, with no unexpected page moving
- [ ] `npm run build` clean — 253 pages
- [ ] Screenshots of every changed surface delivered to the user
- [ ] Zero real-Firebase accounts created (AC-6.7)
- [ ] Baseline re-captured and committed

**Still blocking the merge to `main`** — outside this batch, unchanged:

- [ ] Real-Firebase manual auth pass (Google popup, sign-up, verification email, password reset,
      sign-out) against `financefirst-ee059`
- [ ] Human read of `/privacy`, specifically the account-deletion line no code backs

---

## 7. Out of scope

Flagged in spec §11, not touched: the four marketing claims that do not match the data
(3,000+ flashcard terms vs **611**; 10,000+ practice questions vs **1,286**; 8 courses available
vs **1** real; 240+ articles — accurate). User's call, not a defect.
