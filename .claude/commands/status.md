---
description: Print Vector Learn autopilot status — backlog state, last run, recent reports, next item to be picked.
allowed-tools: Bash, Read, Glob
---

Print a concise status report for the user covering:

1. **Backlog state** — read `backlog/STATE.json` and show:
   - Active milestone
   - Current item (if any)
   - Last completed item
   - Counts: pending / in_progress / done / blocked
   - Total iterations across all runs

2. **Last 3 reports** — glob `backlog/reports/*.md` sorted by mtime desc, show the headers (`grep -E "^(MANAGER_REVIEW|STUDENT_REVIEW|TEST_RESULT|REVIEW_RESULT):"`).

3. **Recent commits** — `git log --oneline -5 origin/main 2>/dev/null || git log --oneline -5`.

4. **Open PRs** — `gh pr list --limit 5 --state open` if `gh` is authenticated.

5. **Next pending item** — first item in STATE.json with status `pending`. Show its title and ID.

6. **Recommendation** — one sentence: should the user run `/autopilot`, fix blockers, or wait?

Keep the output under 40 lines. Use markdown tables where it helps.
