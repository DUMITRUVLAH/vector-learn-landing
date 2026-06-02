# docs/solutions — compounding knowledge base

> *"Each unit of engineering work should make the next one easier — not harder."*
> Adapted from EveryInc's compound-engineering plugin into the Vector Learn autopilot.

Each file here is **one solved problem**, captured while context was fresh, so the next
agent (or human) doesn't re-learn the same lesson from scratch. The first time we solve a
problem it takes research; documented, the next occurrence takes minutes.

## How it plugs into autopilot

- **Before BUILD** — the orchestrator searches this folder (by frontmatter keywords) for any
  past learning that touches the area being built, and passes the matches to `feature-builder`.
  This is the "don't step on the same rake twice" gate.
- **After a non-trivial FIX** — when `test-runner` red→green required a real diagnosis (not a
  typo), the orchestrator writes a new note here. Routine fixes are NOT documented (noise).

## Frontmatter schema

```yaml
---
title: <short imperative title>
problem_type: runtime_error | database_issue | build_error | performance_issue | security_issue | architecture_pattern | convention
module: <area, e.g. migrations | auth | crm | deploy>
tags: [keyword, keyword, ...]      # what a future search would grep for
symptoms: <the visible failure>
severity: P0 | P1 | P2 | P3
date: YYYY-MM-DD
---
```

Body sections: **Symptom → Root cause → Fix → How to avoid next time**. Keep it tight.

## Subdirectories

Created on demand by `problem_type`. Current: `runtime-errors/`, `database-issues/`,
`build-errors/`, `architecture-patterns/`, `security-issues/`. Add more (e.g.
`performance-issues/`, `conventions/`) as needed.
