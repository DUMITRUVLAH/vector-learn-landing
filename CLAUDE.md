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
- ✅ Build + typecheck + tests green
- ✅ Reviewer APPROVED
- ✅ Persona reports saved (even if PASS)
- ✅ PR open with structured body

…then autopilot has a bug. Fix the orchestrator before fixing the feature.

---

## 10. North star

**Goal**: ship one fully-tested, persona-reviewed module page per autopilot run, with the owner needing only to do PR review and merge.

**Anti-goal**: ship slop that needs rework. A blocked item with a clear report beats a merged item with hidden tech debt.

---

*Maintained automatically by the orchestrator agent. Last updated: 2026-05-28.*
