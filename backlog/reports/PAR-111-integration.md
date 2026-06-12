# PAR-111 Integration Architect Report

**Verdict: CONNECTED (no COMPETING_SYSTEM)**

## Anti-COMPETING_SYSTEM check — PASS
- `NotificationService` is NOT used (it targets leads/students, not users — correct)
- `inAppNotifications` table — REUSED (CRM-134 created it)
- `MessagingService` — REUSED for email
- No new table, no new notification system

## Wiring
- submit.ts → notifySubmitted() — correct timing (after PAR transitions to pending_approval)
- parApprovals.ts:
  - approve (intermediate): notifyStepAdvanced() ← correct (after unlock next step)
  - approve (final, execute_payment): notifyFullyApprovedToFinance() ← correct
  - reject: notifyRejected() ← correct (after PAR → rejected)
  - request-changes: notifyChangesRequested() ← correct (after PAR → changes_requested)
- notifyPaid() exported, wired by PAR-113 when Finance module is built

## Tenant isolation
- All queries scoped to `tenantId` via `eq(parMembers.tenantId, tenantId)`
- Finance user lookup: `inArray(parMembers.role, ["finance", "par_admin"])` + tenant scope

## InAppNotificationPayload extension
- Added `par_id?: string` — backward compatible (optional field on jsonb)
- Existing CRM notifications unaffected (they don't set par_id)

## No migration needed
- `InAppNotificationPayload` is a TypeScript interface on jsonb column
- jsonb columns in Postgres accept any valid JSON without migration

**All acceptance criteria met. No gaps.**
