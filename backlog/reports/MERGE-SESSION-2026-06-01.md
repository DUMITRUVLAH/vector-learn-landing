# Merge-to-prod session — 2026-06-01 (morning)

Owner asked: "push all PRs to main / autopilot all merges to prod." Did this safely
(merge to main auto-deploys to the paying client's prod), guarding against the known
migration-prefix-collision bug that 500s prod.

## Shipped to main → prod (all gated green)

| What | Detail |
|------|--------|
| 6 PRs (earlier) | #95 phase-J + #58 SCHED-502, #66 CRM-118, #67 CRM-124, #68 CRM-122, #91 CRM-136 — migration-free, clean |
| **Prod-safety fix** `78a5220` | Hardened phase-J auto-score (`runScore`) — it read `res.score` unguarded; in prod the try/catch hid it but it left 12 CRM tests red. Also made 2 brittle migration-path tests robust to renumbering. Baseline 14 red → green. |
| **#88 CRM-133** `4f4ca3f` | Duplicate-detection banner + MergeLeadModal. Real rebase (was based on stale `preview/sched-all`, retargeted to main). Resolved 5 code conflicts in leads.ts/LeadCardPage/api. Hardened dedup-on-mount effect + patched 13 test mocks. 639→640 tests green. |

Final main state: **640 tests pass**, `db:reset`+`db:seed` succeed, journal 24 entries **0 duplicate indices**, build clean.

## Closed as stale (work already on main)
- **#93 CONTRACT-501**, **#94 FEEDBACK-601** — 0 commits missing from main; `contracts.ts`/`feedback.ts` already present (merged via demo/crm-complet). Nothing to merge.

## Deferred — need REWORK, not a rebase (real prod risk if forced)
- **#89 CRM-134 (@mentions)** + **#90 CRM-135 (round-robin)** — built before main had notifications; both create a *competing* `in_app_notifications` system (`add/add` collision with main's CRM-123 notifications + a `0016` migration that needs renumber to 0024). #90 is stacked on #89. Landing them safely = re-implement @mentions/round-robin on top of main's EXISTING notifications, not a conflict resolve. Branches left untouched (no force-push).

## Deferred — heavy migration-collision stacks (separate session)
- **HR #53-56**, **FIN #76-79**, **BRANCH #80-83**, **FB #92** — duplicate migration prefixes (0008/0011/0012/0015/0016) and/or based on `preview/sched-all`. Each needs: retarget base→main, rebase, renumber migration to next free index (24+), journal fix, `db:reset`/`db:seed` gate, per branch. FIN/BRANCH not even in STATE.json (genuinely new, unmerged work).

## Key learning
These PRs were based on `preview/sched-all`, not `main` — that's why GitHub showed them CONFLICTING. Fix = `gh pr edit <n> --base main` + rebase head. See [[migration-prefix-collisions]].
30 PRs still open after this session (closed 2, merged 1 of the 5-CRM batch; the other 4 were stale-or-rework).
