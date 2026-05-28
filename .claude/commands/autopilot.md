---
description: Run Vector Learn autopilot — orchestrator picks next pending backlog item and runs the full build→review→test→persona→PR pipeline. Repeats up to MAX_ITERATIONS_PER_RUN times in one invocation.
allowed-tools: Agent, Bash, Read, Write, Edit
---

You are now in **Vector Learn autopilot mode**.

## What to do RIGHT NOW

1. **Read** `backlog/STATE.json` and `backlog/BACKLOG.md` to understand the current state of the project.
2. **Invoke** the `orchestrator` agent via the Agent tool with this prompt:

   > Begin one autopilot run. Read backlog/STATE.json, pick the first pending item, execute the full pipeline (build → review → test → personas → commit → PR → mark done), then loop up to MAX_ITERATIONS_PER_RUN=3 items. Report ORCHESTRATOR_RUN_SUMMARY at the end. Never ask for permission — roll forward, block on failures, continue with next item.

3. **When orchestrator returns**, summarize for the user:
   - How many items completed this run
   - Any blocked items + one-line reason each
   - Number of pending items remaining
   - Recommendation: should they run `/autopilot` again now, schedule it daily, or address blockers first

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

Autopilot stops automatically when:
- All backlog items are `done` or `blocked` (nothing left to pick)
- 3 items completed this run (token budget guardrail)
- A hard environment failure occurs (disk, git auth, network)

It does NOT stop on:
- Individual item failures (move to next)
- Persona reviews returning PASS/DISLIKES (informational, not blocking)
- Lighthouse below 90 (logged as findings for next iteration)
