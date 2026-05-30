---
description: Run Vector Learn autopilot — orchestrator picks next pending backlog item and runs the full build→review→test→persona→PR pipeline. Loops continuously until the owner sends a stop signal, all items are done/blocked, or a hard environment failure occurs.
allowed-tools: Agent, Bash, Read, Write, Edit
---

You are now in **Vector Learn autopilot mode**.

## What to do RIGHT NOW

1. **Read** `backlog/STATE.json` and `backlog/BACKLOG.md` to understand the current state of the project.
2. **Invoke** the `orchestrator` agent via the Agent tool with this prompt:

   > Begin a bounded autopilot run. Read backlog/STATE.json, pick the first pending item, execute the full pipeline (build → review → test → personas → commit → PR → mark done), then pick the next pending item and repeat — **up to 3 items, then STOP** and emit ORCHESTRATOR_RUN_SUMMARY with pending count (bounded-batch rule, orchestrator Operating principle: keeps context under 200k so it never escalates to the paid 1M-context tier — no usage credits needed). Re-run /autopilot (or a fresh conversation / the schedule) to continue the next batch; state persists in STATE.json. Stop early if: (a) all items done/blocked, (b) hard env failure, (c) owner sends explicit stop signal, or (d) 3 consecutive items block. Between items emit ONE short status line: `[ITEM] M1-XXX done → PR #N · next: M1-YYY`. Never ask the owner for permission — they review PRs in parallel.

3. **When orchestrator returns** (only at a real stop):
   - How many items completed this run
   - Stop reason
   - Any blocked items + one-line reason each
   - Number of pending items remaining

## Rules for this slash command

- This command is **non-interactive**. Do not ask the user any clarification questions — the orchestrator handles all decisions.
- If `gh` (GitHub CLI) is not authenticated, abort with a clear message: "Run `gh auth login` first, then re-run /autopilot."
- If there are uncommitted user changes in the working tree (`git diff --quiet` exits non-zero), abort with: "Uncommitted changes detected. Commit or stash before running /autopilot."
- Otherwise, proceed.

## Scheduling

To run this daily without manual invocation, the user can use:
```
/schedule create --cron "0 9 * * *" --command "/autopilot"
```

Or in a tight loop during dev:
```
/loop 30m /autopilot
```

## Stop conditions

Autopilot stops ONLY when one of these is true:

1. **All done** — every backlog item is `done` or `blocked` (nothing left to pick)
2. **Hard env failure** — git auth dead, disk full, `npm install` fails twice in a row, network down
3. **Owner stop signal** — owner types "stop", "halt", "pauză", "ajunge", "oprește-te" or clear equivalent
4. **Structural block** — 3 consecutive items end in `blocked` status

It does NOT stop on:
- Individual item failures (mark blocked, move to next)
- Persona reviews returning PASS/DISLIKES (informational, feed into next milestone)
- Lighthouse below 90 (logged as findings, not blocking)
- PR not yet reviewed by owner (owner reviews in parallel)
- Token budget (no longer a guardrail — continuous run)
- Completing one item (immediately picks the next)
