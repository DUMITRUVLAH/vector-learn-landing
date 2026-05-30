# Vector Learn — CLAUDE.md

> **This project is AUTOPILOT.** Claude operates autonomously here. No clarification questions.
> The owner sets direction via the backlog; Claude executes via the orchestrator and reports.
> Follow the rules below to the letter. They are the contract.

---

## 0. The single most important rule

**Do not ask the user permission for anything that is already specified in the backlog or in this file.** If you find yourself drafting a question, stop and re-read this document. The answer is almost certainly here or in `backlog/specs/`.

Things you DO ask about:
- Hard environment failures (git auth lost, disk full, network down)
- Discovery of uncommitted human work in the tree that you'd overwrite
- Requests that explicitly contradict this CLAUDE.md

Everything else: choose the safest path forward and log it.

---

## 0.1 Continuous execution rule (OVERRIDES everything else about stopping)

**You do not stop until the owner explicitly tells you to stop.**

- "Stop", "halt", "pauză", "ajunge", "stai", "oprește-te", or any clear English/Romanian equivalent in the user's voice = STOP signal. Honor it immediately.
- Anything else (silence, idle time, completed feature, PR opened, lunch hour, midnight) is NOT a stop signal. Continue.
- The owner reviews PRs on their own schedule, in parallel with your work. **Do not wait for PR approvals to start the next item.** Each item is its own branch + PR, so there is no merge contention.

### What this means in practice

- After completing one backlog item (PICK→BUILD→…→PR→DONE), **immediately pick the next pending item and start again**. No "end of run" summary, no asking "should I continue?", no waiting — **until the batch cap below**.
- **Bounded batches (credit-free): max 3 items per run, then STOP** with a summary + pending count. "Continuous" = the *overall effort* continues across MANY short runs (re-launch / fresh conversation / schedule / GitHub Actions), state in `backlog/STATE.json`. A single long run accumulates context past 200k, escalates to the paid 1M-context tier, and fails — so cap each run at 3 and let the loop re-fire. (This replaces the old "no per-run cap" — continuity is preserved, just chunked.)
- The only automatic stop conditions remaining are:
  1. All backlog items are `done` or `blocked` (genuinely nothing left to pick)
  2. A hard environment failure makes further work impossible (git auth dead, disk full, network down, npm install fails twice)
  3. The owner explicitly says stop
  4. 3 consecutive items end in `blocked` status (signal that something is structurally wrong — write a `backlog/reports/STRUCTURAL-BLOCK.md` summarizing the pattern and wait)

### Communication during the long run — STRICT (this is the rule you keep breaking)

Between items, output **exactly this**, nothing else:

```
[ITEM] M1-XXX done → PR #N · next: M1-YYY
```

ZERO of the following between items:
- ❌ "Status:" sections, headers, or markdown tables recapping progress
- ❌ Lists of completed work, verdict summaries, persona quotes
- ❌ Localhost URLs (the owner already knows them — they were stated once)
- ❌ "Cum testezi" / "Where to look" / "Ce ai livrat" sections
- ❌ Recap tables of all shipped PRs
- ❌ Emoji or celebration ("Gata!", "Done!", "✅", "🎉")
- ❌ Any sentence ending in "?" addressed to the owner
- ❌ "Continui cu...", "Vrei să...", "Pornesc...", "Trec la..." — ANY phrasing that hints at asking permission or signaling a pause-point
- ❌ "Per regula §0.1..." or similar meta-commentary on the rules
- ❌ Pausing for reflection or "checking in"

After emitting the one-line `[ITEM]` status, **immediately call the next tool** for the next item. No paragraph break. No checkpoint. No "what's next" sentence.

**Silence from the owner is not a signal.** They are reviewing PRs in another tab. The chain runs until a hard stop condition fires (see §0.1 above).

Save all detail (reports, verdicts, follow-ups) to `backlog/reports/` and PR bodies — that's the persistence layer. The chat is a thin status stream, not a deliverable.

### The "Continui cu X?" anti-pattern

Before sending any message between items, ask yourself:

> "Does this message contain a question, an offer of choice, a celebratory recap, or anything that could be interpreted as asking the owner to confirm or wait?"

If YES → **delete that part and continue working with the next tool call**. The only acceptable inter-item message is the one-line `[ITEM]` status. Anything else is a violation of §0.1.

Common violations to recognize in your own draft (real examples from past runs):
- "**3/10 module shipped**" recap table → DELETE
- "## Status pe scurt" / "## ORCHESTRATOR_RUN_SUMMARY" between items → DELETE
- "Continui cu M1-004?" / "Spune-mi dacă vrei să..." → DELETE
- Re-listing localhost URLs every iteration → DELETE
- "Per regula §0.1: continuu..." → DELETE the meta-comment, just continue

The owner typed *one trigger* ("continuă", "go", etc.). That trigger runs the chain until a stop word is heard. **Do not re-request permission inside the chain.** Asking is treating completion as a checkpoint — it is not.

### When the owner does send a stop signal

1. Finish the **current step** in the current item (e.g., if you're mid-commit, finish the commit) — do NOT leave half-written state
2. Mark the in-progress item back to `pending` if not yet shipped, or `done` if PR is open
3. Emit a final ORCHESTRATOR_RUN_SUMMARY
4. Stop. Do not pick the next item.

---

## 0.2 Build pas-cu-pas / grupat — anti-pierdere de feature-uri (OVERRIDES batching)

**Construiește un singur backlog item odată, în ordinea din secvența lui de build. Nu comasa
mai multe item-uri într-un PR. Nu trece la următorul item cu testele celui curent roșii.**

De ce: modulele mari (în special **CRM**, care e CORE-ul produsului) au zeci de comportamente și
click-uri. Construite „la grămadă", se pierd detalii — un click neimplementat, un edge-case GDPR
uitat, un scenariu de test sărit. Granularitatea pe item + gate de teste verzi împiedică asta.

### Regulile (obligatorii când lucrezi automat pe un modul cu secvență de build)

1. **Un item = un PR.** Ia primul item pending în ordinea din `BUILD-SEQUENCE.md`-ul modulului
   (pentru CRM: `backlog/crm/BUILD-SEQUENCE.md`). Nu sări, nu comasa.
2. **Doar scope-ul item-ului.** Implementează exact ce e „in scope" în specul lui. Comportamentele
   din documentul CORE neacoperite de specul curent **NU se implementează pe furiș și NU se uită**
   — se notează în secțiunea „Backlog descoperit" a fișierului BUILD-SEQUENCE și se continuă.
3. **Gate dur de teste (repară, nu sări).** Rulează scenariile item-ului din `TEST-SCENARIOS.md`.
   **Dacă un scenariu `[blocant]` pică → repară pe loc → re-rulează.** Un item cu teste roșii NU se
   închide și NU se trece mai departe. (Excepție: dacă un fix eșuează după o încercare reală și e
   clar structural, marchează `blocked` cu raport — vezi §6 — dar întâi chiar încearcă să repari.)
4. **Consistență cu CORE.** Dacă implementarea diferă de documentul CORE al modulului, actualizează
   CORE explicit în același PR. Nu lăsa documentația să derive în tăcere.
5. **Documentul CORE este sursa de adevăr** pentru comportament (ce se întâmplă la fiecare click,
   cum se adaugă un client, layout-ul kanban/cartonaș). Pentru CRM: `backlog/crm/CRM-CORE.md`.

### Pe scurt
> Ia features **pas cu pas / grupate pe item**, în ordine. Testează fiecare item. Dacă testele
> pică → **repară, nu trece mai departe**. Nu pierde niciun feature din CORE — notează-l, nu-l uita.

---

## 0.3 Fereastra de noapte — autonomie totală 23:00–08:00 (owner doarme)

**Între 23:00 și 08:00 (ora Europe/Chișinău), lucrează complet autonom, fără nicio oprire și
fără nicio întrebare.** Owner-ul doarme — nu e nimeni de întrebat, așa că ZERO întrebări de
clarificare, ZERO „vrei să...", ZERO pauze de confirmare. Iei singur cea mai sigură decizie,
o notezi în raport/commit, și mergi mai departe.

- Toate modificările (build, fix, review→improve, commit, push, PR, actualizare STATE.json) se
  fac neîntrerupt în acest interval.
- Dacă apare o ambiguitate, alege opțiunea cea mai sigură și reversibilă (branch + PR, niciodată
  force-push, niciodată ștergere de date) și loghează decizia — nu aștepta răspuns.
- Singurele opriri permise rămân cele din §0.1 (toate item-urile done/blocked, eșec dur de mediu,
  stop explicit de la owner, sau 3 blocaje consecutive).
- Această regulă întărește §0.1/§0.2; nu le contrazice. Ziua, dacă owner-ul e prezent și pune o
  întrebare, îi răspunzi normal — dar noaptea nu inițiezi întrebări.
- Rularea programată din cloud (`trig_01G1fjFvCBqZDXVUN5Q1vrUE`, 00:00 + 04:00) și GitHub Actions
  operează sub această regulă: construiesc și deschid PR-uri peste noapte, fără supraveghere.

---

## 1. Project at a glance

- **What**: Landing site for **Vector Learn**, a CRM for educational centers (language, programming, music, dance, sports, exam prep, kids).
- **Stack**: React 18 + TypeScript (strict) + Vite + Tailwind CSS, design system **Vector 365** (tokens in `src/index.css`).
- **Status**: Landing v1 shipped. Now building per-module deep-dive pages (`/modules/<slug>`) via autopilot.
- **Repo**: `DUMITRUVLAH/vector-learn-landing`
- **Owner**: Dumitru Vlah (vlahdumitru@gmail.com)

---

## 2. How autopilot works

```
┌──────────────────────────────────────────────────────────────────┐
│   /autopilot                                                     │
│        │                                                          │
│        ▼                                                          │
│   orchestrator (agent)                                            │
│        │                                                          │
│        ├──► feature-builder ──► writes code, tests                │
│        ├──► code-reviewer-vl ──► reads diff, returns verdict      │
│        ├──► test-runner ──► build/typecheck/test/lighthouse/axe   │
│        ├──► persona-manager ──► Andreea reviews UX                │
│        ├──► persona-student ──► Maria + Cristina review UX        │
│        └──► commits, opens PR, marks done, picks next item        │
└──────────────────────────────────────────────────────────────────┘
```

### Components

| File | Purpose |
|------|---------|
| `backlog/BACKLOG.md` | Human-readable index of milestones and items |
| `backlog/STATE.json` | Machine-readable state — single source of truth |
| `backlog/specs/M*.md` | Detailed spec per item (acceptance criteria, files, tests) |
| `backlog/reports/*.md` | Generated reports per item (reviewer, test, personas) |
| `.claude/agents/*.md` | Custom Claude Code agents (6 of them) |
| `.claude/commands/autopilot.md` | Slash command that kicks the loop |
| `.claude/commands/status.md` | Read-only status report |

### Triggering autopilot

- **Manual one-shot**: `/autopilot` in Claude Code
- **Loop**: `/loop 30m /autopilot` — runs every 30 min
- **Cron**: `/schedule create --cron "0 9 * * *" --command "/autopilot"` — daily at 09:00
- **CI-style** (future): GitHub Action on schedule that runs Claude Code with `/autopilot`

---

## 3. Engineering best practices (non-negotiable)

### 3.1 Design system
- Read `design-system.md` (Vector 365) before touching any UI
- **NO hardcoded hex codes in `.tsx`** — semantic tokens only (`bg-primary`, `text-muted-foreground`, etc.)
- Spacing uses Tailwind scale; arbitrary values `[123px]` are a last resort and must be justified in a code comment
- Radius via `rounded-lg|md|sm` or `var(--radius)`
- Every new component must work in both light AND dark mode

### 3.2 TypeScript
- `strict: true` is on. Don't disable.
- Zero `any`. Use `unknown` and narrow. If a type comes from a 3rd-party lib without types, write a `.d.ts` shim.
- Props interfaces for every component (no anonymous prop types).

### 3.3 Accessibility (WCAG 2.1 AA)
- Color contrast ≥ 4.5:1 for text
- Touch targets ≥ 44×44px (use `.touch-target`)
- Every icon-only `<button>` has `aria-label`
- Every form input has a `<label>` (visible or `sr-only`)
- Keyboard navigation works on every interactive element
- `axe` violations on critical+serious must be **0**

### 3.4 Performance budgets
- Lighthouse Performance ≥ 90 (mobile, simulated 3G)
- Bundle: total JS gzipped ≤ 100 KB for a route
- Images lazy-loaded by default
- No render-blocking 3rd-party scripts

### 3.5 Tests
- Every new component → vitest unit test
- Every new page → at least one smoke test (renders without crash + basic interactions)
- Integration tests for stateful demos (kanban drag, calculator math, filter logic)
- Aim for ≥ 70% coverage on new code (not enforced, but tracked)

### 3.5.1 Backend / full-app gates (the ones that stop integration breaks) — NON-NEGOTIABLE
Unit tests in isolation are not enough: they run on PGlite and pass even when the integrated
app is broken. Every backend/full-stack item must also pass these (enforced by `test-runner`):
- **Migration discipline:** after any `server/db/schema/*` change, `npm run db:generate` must
  leave NO uncommitted migration, and `npm run db:reset && npm run db:seed` must succeed.
  A schema change without a committed migration breaks every fresh deploy. (This is how the
  `pipeline_stages`/`lead_tasks`/`message_templates` tables almost shipped with no migration.)
- **Live API integration smoke:** boot the server, `POST /api/auth/login`, then hit the
  endpoints the item touched → all 200 with expected JSON. Catches route wiring, auth, and
  DB-result bugs that unit tests miss.
- **DB portability:** prod is Postgres (Supabase), local/tests may be PGlite — result shapes
  differ. Never use raw `db.execute(...).rows`; use the query builder, or handle both with
  `Array.isArray(r) ? r : r.rows`. (This is the `.rows` bug that broke `/api/health/db`.)
- **In-app links** must point to real routes (`#/app/login`), never dead anchors (`#login`).

### 3.5.2 Review → improve loop (don't ship the first draft)
Each item goes through three reviewers, whose findings are handed to an **improver** pass
(feature-builder) that applies the fixes; then it is re-reviewed. Repeat until clean (max 3
cycles), THEN run the test gate. Test failures trigger a fix loop (repair, don't skip — §0.2).
The reviewers:
- `code-reviewer-vl` — design-system, a11y, dark mode, dead code, dead links.
- **`integration-architect`** — does this feature actually connect to the other modules? DB
  foreign keys, cross-module data flow (lead→student→payment→lesson), API contracts, UI wiring,
  tenant safety. Stops modules from being built as disconnected islands. (See its agent file.)
- `ce-adversarial-reviewer` — failure modes/edge cases, on large or high-risk diffs (auth,
  payments, data mutations, migrations, external APIs).

### 3.6 Commits & branches
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- One branch per backlog item: `feat/<ID>-<slug>`
- One PR per branch
- Squash-merge to `main`
- Co-author tag: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### 3.7 What NOT to do
- Don't add features outside the spec
- Don't introduce new dependencies casually (if needed, justify in PR body)
- Don't write to `BACKLOG.md` or `STATE.json` unless you are the orchestrator agent
- Don't `--no-verify`, don't `--force` push, don't `git reset --hard` on shared branches
- Don't create planning/architecture markdown files unless the spec asks for them
- Don't leave `console.log`, commented-out code, or TODO comments without a tracked issue

---

## 4. The personas (always reviewing)

Every shipped feature is judged by 3 humans:

1. **Andreea Mitran** — academy director, 6 locations, 1.400 students. Time-poor, ROI-focused, GDPR-aware. (Agent: `persona-manager`)
2. **Maria** — 14-year-old student, phone-native, attention span of 30 seconds. (Agent: `persona-student`)
3. **Cristina** — Maria's mom, pays bills, gets notifications, mild tech-anxiety. (Agent: `persona-student`)

Their feedback is recorded in `backlog/reports/<ID>-manager.md` and `<ID>-student.md`. **Never throw away persona feedback** — it's the signal for next milestone's specs.

---

## 5. Adding new backlog items

1. Add a row to `backlog/BACKLOG.md` (id, title, status `pending`, spec link)
2. Add the item to `backlog/STATE.json` with `status: "pending"`, `attempts: 0`, `blockers: []`
3. Write `backlog/specs/<ID>.md` following the template structure (frontmatter + Goal + User stories + Acceptance criteria + Files + Tests + DoD)
4. Commit on `main` with `chore(backlog): add <ID>`
5. Next `/autopilot` will pick it up automatically

---

## 6. Failure handling

When something breaks:

| Failure | What to do |
|---------|-----------|
| Build fails | Builder marks item `blocked`. Orchestrator moves to next. Human investigates from the report. |
| Reviewer says CHANGES_REQUESTED | Builder gets ONE retry with reviewer findings. If still bad → block. |
| Reviewer says REJECTED | Block immediately. No retries. Human review needed. |
| Test gate fails | Block. Write `backlog/reports/<ID>-tests.md` with output. |
| Persona PASS/DISLIKES | Log as feedback, DO NOT block. The page ships. Friction is fed back into M2 specs. |
| `gh` auth lost | Stop autopilot, exit with clear message. Don't retry. |
| Git conflict | Stop autopilot. Conflict resolution needs human judgment. |

**Roll forward** is the default. Stopping the loop is the exception.

---

## 7. Memory & state

- The orchestrator's persistent state lives in `backlog/STATE.json` (git-tracked)
- Per-run reports live in `backlog/reports/*.md` (git-tracked)
- Claude's own conversation memory is NOT relied upon between autopilot runs — every run reads STATE.json fresh

This means: if you (Claude) wake up and don't know what's happening, **read `backlog/STATE.json` first**.

---

## 8. Manual escape hatches for the user

The owner can always:
- Edit `backlog/BACKLOG.md` directly to re-prioritize (move items, change `pending` → `paused`)
- Edit `backlog/specs/<ID>.md` to refine acceptance criteria
- Mark a `blocked` item back to `pending` after fixing the blocker
- Run `/status` for a read-only summary
- Stop scheduled runs with `/schedule list` then `/schedule delete <id>`

---

## 9. Quality bar (reminder)

If a feature ships without:
- ✅ All acceptance criteria met
- ✅ Build + typecheck + lint + unit tests green
- ✅ Migration gate green (no uncommitted migration; `db:reset` + `db:seed` succeed) — §3.5.1
- ✅ Live API integration smoke green (login + the item's endpoints return 200) — §3.5.1
- ✅ DB-portability check green (no raw `.execute().rows`) — §3.5.1
- ✅ Reviewer APPROVED **after the review→improve loop** (incl. adversarial review on risky diffs) — §3.5.2
- ✅ Persona reports saved (even if PASS)
- ✅ PR open with structured body

…then autopilot has a bug. Fix the orchestrator before fixing the feature.

**The point of the new gates:** a feature can be "build + unit-tests green" and still be broken
when integrated/deployed (wrong DB result shape, missing migration, dead link, unwired route).
The migration + integration-smoke + portability gates are exactly what turn "code that compiles"
into "a real app that works" — which is the bar for the demo and for autonomous runs.

---

## 10. North star

**Goal**: ship one fully-tested, persona-reviewed module page per autopilot run, with the owner needing only to do PR review and merge.

**Anti-goal**: ship slop that needs rework. A blocked item with a clear report beats a merged item with hidden tech debt.

---

*Maintained automatically by the orchestrator agent. Last updated: 2026-05-28.*
