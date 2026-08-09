# Phase 12 — Capitalization Sweep: Change Log

Consolidated record of every string changed by the five parallel capitalization-sweep
agents, plus the judgment calls each agent made about what to leave alone. Awaiting
user review/veto before this is committed — nothing in this phase has been committed.

**Total changes: 88** across 21 source files + 4 test files (test files updated only to
match the new copy, no test logic changed).

| Area | Source files | Test files | String changes |
|---|---|---|---|
| 1. Shell / homepage | 6 | 2 | 33 (31 case changes + 2 code-bug-fix removals of `.toLowerCase()`) |
| 2. Bot / articles / profile | 3 | 2 | 17 |
| 3. Practice | 1 | 0 | 4 |
| 4. Flashcards | 2 | 0 | 2 (+1 doc-comment sync) |
| 5. Course-one + static pages | 9 | 0 | 32 |

---

## Area 1 — Shell / homepage

**Files:** `src/components/shell/Nav.tsx`, `src/components/hero/Hero.tsx`,
`src/components/hero/Ticket.tsx`, `src/components/hero/PartnerStrip.tsx`,
`src/components/rack/RackFocus.tsx`, `src/components/rack/rack-data.ts`.
**Tests updated to match:** `tests/e2e/hero.spec.ts`, `tests/e2e/auth.spec.ts`.

| File:line | Before | After |
|---|---|---|
| `Hero.tsx:137` | `Start the free course` | `Start the Free Course` |
| `Hero.tsx:140` | `Try Practice mode` | `Try Practice Mode` |
| `PartnerStrip.tsx:26` | `In partnership with` | `In Partnership With` |
| `PartnerStrip.tsx:29` | `aria-label="Partner organizations"` | `aria-label="Partner Organizations"` |
| `Ticket.tsx:28` | `Service fee` | `Service Fee` |
| `Ticket.tsx:34` | `Order processing fee` | `Order Processing Fee` |
| `Ticket.tsx:40` | `Facility charge` | `Facility Charge` |
| `Ticket.tsx:46` | `Delivery — mobile ticket` | `Delivery — Mobile Ticket` |
| `Ticket.tsx:52` | `Sales tax` | `Sales Tax` |
| `Ticket.tsx:58` | `Total charged` | `Total Charged` |
| `Ticket.tsx:152` | `aria-label="Row focus mode"` | `aria-label="Row Focus Mode"` |
| `Ticket.tsx:180` | `All sharp` | `All Sharp` |
| `Ticket.tsx:187` | `aria-label="Ticket fee breakdown"` | `aria-label="Ticket Fee Breakdown"` |
| `RackFocus.tsx:242` | ``Explore {item.title.toLowerCase()}`` | ``Explore {item.title}`` (bug fix — see note) |
| `RackFocus.tsx:328` | `aria-label="Fynoptic — courses, articles, flashcards, practice"` | `aria-label="Fynoptic — Courses, Articles, Flashcards, Practice"` |
| `RackFocus.tsx:417` | `aria-label="Fynoptic — courses, articles, flashcards, practice"` | `aria-label="Fynoptic — Courses, Articles, Flashcards, Practice"` |
| `RackFocus.tsx:461` | ``Explore {active.title.toLowerCase()}`` | ``Explore {active.title}`` (bug fix — see note) |
| `rack-data.ts:70` | `'4 courses'` | `'4 Courses'` |
| `rack-data.ts:71` | `'6 sections'` | `'6 Sections'` |
| `rack-data.ts:79` | `'240+ articles'` | `'240+ Articles'` |
| `rack-data.ts:80` | `'244 published'` | `'244 Published'` |
| `rack-data.ts:88` | `'3,000+ terms'` | `'3,000+ Terms'` |
| `rack-data.ts:89` | `'12 units'` | `'12 Units'` |
| `rack-data.ts:97` | `'10,000+ questions'` | `'10,000+ Questions'` |
| `rack-data.ts:98` | `'16 topics'` | `'16 Topics'` |
| `Nav.tsx:162` | `aria-label="Main navigation"` | `aria-label="Main Navigation"` |
| `Nav.tsx:171` | `aria-label="Open menu"` | `aria-label="Open Menu"` |
| `Nav.tsx:210` | `'Your profile' : 'Sign in'` | `'Your Profile' : 'Sign In'` |
| `Nav.tsx:230` | `Start the free course` | `Start the Free Course` |
| `Nav.tsx:243` | `aria-label="Close menu"` | `aria-label="Close Menu"` |
| `Nav.tsx:254` | `Start the free course` | `Start the Free Course` |
| `tests/e2e/hero.spec.ts` (3 spots) | `'Start the free course'` / `'Try Practice mode'` (test comment + 2 assertions) | Title Case, matching the new copy |
| `tests/e2e/auth.spec.ts:77` | `.toHaveAttribute('aria-label', 'Your profile')` | `'Your Profile'` |

**Real bug fix (not a pure capitalization change):** `RackFocus.tsx:242` and `:461` had
`{item.title.toLowerCase()}` / `{active.title.toLowerCase()}` in the "Explore …" link
text. `item.title` is already correctly Title Cased data (`"Courses"`, `"Articles"`,
`"Flashcards"`, `"Practice"`) — the stray `.toLowerCase()` was force-lowercasing it on
render (e.g. "Explore courses" instead of "Explore Courses"). Removing the call is a
functional fix, discovered incidentally while sweeping this file for capitalization.

---

## Area 2 — Bot / articles / profile

**Files:** `src/components/profile/Profile.tsx`, `src/components/profile/ProfileSettings.tsx`,
`src/pages/articles.astro`.
**Tests updated to match:** `tests/e2e/profile-settings.spec.ts`, `tests/e2e/articles.spec.ts`.

| File:line | Before | After |
|---|---|---|
| `Profile.tsx:200` | `Sign out` | `Sign Out` |
| `Profile.tsx:235` | `Last sign-in` | `Last Sign-In` |
| `Profile.tsx:241` | `Modules completed` | `Modules Completed` |
| `Profile.tsx:267` | `Continue learning` | `Continue Learning` |
| `ProfileSettings.tsx:262` | `Edit profile` | `Edit Profile` |
| `ProfileSettings.tsx:330` | `Cancel upload` | `Cancel Upload` |
| `ProfileSettings.tsx:346` | `Verify email` | `Verify Email` |
| `ProfileSettings.tsx:352` | `Save profile` | `Save Profile` |
| `articles.astro:52` | `Featured order` | `Featured Order` |
| `articles.astro:55` | `Shortest read` | `Shortest Read` |
| `articles.astro:56` | `Longest read` | `Longest Read` |
| `articles.astro:58` | `Unread only` | `Unread Only` |
| `articles.astro:91` | `Clear search` | `Clear Search` |
| `articles.astro:96` | `Load more` | `Load More` |
| `tests/e2e/profile-settings.spec.ts` (3 spots) | `'Cancel upload'` / `'Verify email'` (×2) | `'Cancel Upload'` / `'Verify Email'` |
| `tests/e2e/articles.spec.ts` (5 spots) | `Clear search` / `Featured order` / `Shortest read` / `Longest read` | Title Case, matching the new copy |

---

## Area 3 — Practice

**File:** `src/components/practice/PracticeWizard.tsx`. No test edits needed (tests use
selectors, not this text).

| File:line | Before | After |
|---|---|---|
| `PracticeWizard.tsx:161` | `Adapt every` (label) | `Adapt Every` |
| `PracticeWizard.tsx:165` | `aria-label="Adapt every"` | `aria-label="Adapt Every"` |
| `PracticeWizard.tsx:205` | `Choose Units` (h2) | `Choose units` |
| `PracticeWizard.tsx:234` | `Select all` | `Select All` |

**Note on `PracticeWizard.tsx:205`:** this is the one change in the whole sweep that goes
Title Case → Sentence case, not the reverse. The step-2 `<h2>` was `Choose Units`; the
agent changed it to `Choose units` to match the (unchanged) `aria-label="Step 2: Choose
units"` on the surrounding `<section>` one line above, treating it as a section-heading
label that should stay sentence case like the plan's other step headings, rather than a
button/action label. Flagging this explicitly since visually it looks like the opposite
of every other row in this table — it is a judgment call, not a miss.

---

## Area 4 — Flashcards

**Files:** `src/components/flashcards/FlashcardWizard.tsx`, `src/components/flashcards/FlashcardView.tsx`.
No test edits needed.

| File:line | Before | After |
|---|---|---|
| `FlashcardWizard.tsx:144` | `Select all` | `Select All` |
| `FlashcardView.tsx:213` | `Restart deck` | `Restart Deck` |
| `FlashcardView.tsx:37` (doc comment) | `"Restart deck" needs its current value` | `"Restart Deck" needs its current value` — comment updated to stay in sync with the button text it references, not user-facing |

---

## Area 5 — Course-one + static pages

**Files:** `src/components/course/{PreQuiz,Module,IdExercise,RiskAudit,PostQuiz}.tsx`,
`src/pages/{about,courseone,courses,privacy}.astro`. No test edits needed (tests use
selectors, not this text).

| File:line | Before | After |
|---|---|---|
| `IdExercise.tsx:154` | `Finish exercise` | `Finish Exercise` |
| `Module.tsx:251` | `Mark article as read` | `Mark Article as Read` |
| `Module.tsx:356` | `Check for essentials` | `Check for Essentials` |
| `Module.tsx:370` | `View transcript` | `View Transcript` |
| `PostQuiz.tsx:113` | `POST-QUIZ — scenario-rich assessment` | `Post-Quiz — scenario-rich assessment` |
| `PostQuiz.tsx:148` | `Submit assessment` | `Submit Assessment` |
| `PostQuiz.tsx:152` | `Retake assessment` | `Retake Assessment` |
| `PreQuiz.tsx:178` | `PRE-QUIZ — 10 items (diagnostic)` | `Pre-Quiz — 10 items (diagnostic)` |
| `PreQuiz.tsx:220` | `Submit pre-quiz` | `Submit Pre-Quiz` |
| `RiskAudit.tsx:183` | `Copy summary` | `Copy Summary` |
| `about.astro:25` | `Co-founder &amp; President` | `Co-Founder &amp; President` |
| `about.astro:37` | `Co-founder &amp; Vice President` | `Co-Founder &amp; Vice President` |
| `courseone.astro:113` | `Post-assessment ≥ 80%` | `Post-Assessment ≥ 80%` |
| `courses.astro:65` | `Browse catalog` | `Browse Catalog` |
| `courses.astro:66` | `Study with articles` | `Study with Articles` |
| `courses.astro:72` | `Courses available` | `Courses Available` |
| `courses.astro:76` | `Flagship duration` | `Flagship Duration` |
| `courses.astro:80` | `Certificate on completion` | `Certificate on Completion` |
| `courses.astro:109` | `Available courses` | `Available Courses` |
| `courses.astro:122` | `Post-assessment ≥ 80% (12 scored items)` | `Post-Assessment ≥ 80% (12 scored items)` |
| `courses.astro:140` | `Pre-quiz` (stepper) | `Pre-Quiz` |
| `courses.astro:155` | `Post-quiz` (stepper) | `Post-Quiz` |
| `courses.astro:166` | `Not started` | `Not Started` |
| `courses.astro:171` | `Open course` | `Open Course` |
| `courses.astro:186, 201, 216, 230, 243, 257, 295` (×7) | `Preview unavailable` | `Preview Unavailable` |
| `privacy.astro:70` | `Course progress` | `Course Progress` |
| `privacy.astro:74` | `Dark Patterns course state` | `Dark Patterns Course State` |
| `privacy.astro:79` | `Your display name` | `Your Display Name` |
| `privacy.astro:83` | `Risk audit submissions` | `Risk Audit Submissions` |
| `privacy.astro:87` | `Flashcard progress` | `Flashcard Progress` |
| `privacy.astro:91` | `Theme preference` | `Theme Preference` |
| `privacy.astro:95` | `Accessibility preferences` | `Accessibility Preferences` |
| `privacy.astro:100` | `Articles you've read` | `Articles You've Read` |

*Pre-existing, untouched by this sweep:* `about.astro:49` (Ethan's third co-founder
card, "Head of Outreach") already read `Co-Founder &amp; Head of Outreach` before this
phase — it was already consistent with the new Title Case pattern, so no agent needed to
touch it. Noted here only so the reviewer doesn't mistake it for a missed line.

---

## Judgment calls — deliberately left unchanged

These were considered and rejected by the relevant agent, not overlooked:

- **Form-field labels stay sentence case.** Plain form labels (e.g. category/sort
  `<option>` text not covered above, input labels) were left as-is where the agent
  judged them to be functional form UI rather than headings or CTAs.
- **Narrative/tagline headings stay sentence case even if short.** Prose-like headings
  and taglines were left alone even when brief, to avoid over-applying Title Case to
  copy that reads as a sentence rather than a label.
- **`RiskAudit.tsx`'s `<select>` option values (lines 108–146) were left untouched.**
  Values like `opt-out`, `cancel`, `refund`, `delete account`, `web`, `email`, `chat`,
  `phone`, `Obstruction`, `Forced action`, etc. are compared by exact string in
  application logic, not just displayed — changing case there would be a functional
  break, not a cosmetic one. Verified: no changes present in the diff for this file
  beyond the one `Copy Summary` button.
- **The 9 new id-exercise dark-pattern items are excluded.** `IdExercise.tsx`'s item
  data was left untouched — that's a separate accuracy-review track, not a
  capitalization concern. Verified: zero changes to any dark-pattern item text in the
  diff.
- **Article titles/content are excluded entirely (F12).** No article markdown/data was
  touched by any of the five agents.

## One deviation worth flagging explicitly

`PracticeWizard.tsx:205` (`Choose Units` → `Choose units`) is the only change that moves
*toward* sentence case rather than away from it — see the note in Area 3 above. This
reads as a considered judgment call (matching the existing sentence-case aria-label one
line above) rather than an error, but it's the one row in this table that doesn't fit
the sweep's general direction, so it's called out here for the reviewer's attention
rather than left to be noticed only on close reading of the diff.
