# PAR Module — Backlog Critique
> Reviewed 2026-06-12. 21 items (PAR-001..PAR-003, PAR-101..PAR-118). All KEEP.
> Applied 7 safe fixes directly (depends_on, role guard, notification model, endpoint placement, PDF save).

---

## Phase A — Foundation

### PAR-001 — KEEP
Schema is complete (12 tables, all enums, migration prefix 0113 > 0112 confirmed, index export, seed).
Acceptance criteria are specific and map 1:1 to CORE §2. The `par_members` table declared here (with API in
PAR-002) is clearly annotated. Statement-breakpoint rule is called out. No issues.
No changes applied.

### PAR-002 — KEEP
`requirePARRole` + `resolveApprovalChain` + DOA CRUD. Correctly layered over `requireAuth`. Route-mount
rule called out. `resolveApprovalChain` is a pure function test, good.
One clarification checked: `resolveApprovalChain` reads `par_settings.micro_purchase_threshold_cents`
at runtime — the table and a seed row are created in PAR-001, so the PAR-002 depends_on `[PAR-001]` is
sufficient. No dependency gap.
No changes applied.

### PAR-003 — KEEP
CRUD for reference data + `validators.ts` (IBAN mod-97, IDNP 13-digit). Soft-delete via `active=false`
for historical references is the right call. Validators are in a separate lib so PAR-103 can reuse them.
No issues.
No changes applied.

---

## Phase B — Create & Submit

### PAR-101 — KEEP
Core PAR CRUD. `request_no` sequential generation with transaction guard. DB-portability test is blocking.
Live smoke includes both POST and GET. Good.
No changes applied.

### PAR-102 — KEEP
Line items with server-side total computation. `above_micro_threshold` flag in response is correct
(avoids a separate client call). Guard on status before mutating.
No changes applied.

### PAR-103 — KEEP (+ GDPR note already in spec)
IBAN mod-97 + IDNP validation reuses PAR-003 validators. Payee-field access restriction to
requestor/routed-approvers/finance/admin is explicitly required — correct GDPR scope.
ce-adversarial-reviewer is required in DoD, appropriate for financial data.
No changes applied.

### PAR-104 — KEEP
Attachment upload reuses `leadAttachments` pattern (base64/URL stored as `text`, no new object storage).
Spec says "reuse the existing upload helper" which is verified: `tasks.ts` uses `db.insert(leadAttachments)`.
No changes applied.

### PAR-105 — KEEP
8-step wizard covering all 16 form sections. a11y blocking test (axe) + dark mode test. Smoke test of
render + one interaction. Scope is right: no detail page (that's PAR-118), just create flow.
No changes applied.

### PAR-106 — IMPROVE (depends_on fixed)
The dashboard includes a "New request" button linking to `/app/par/new`. That route is delivered by
PAR-105. PAR-106 was `depends_on: [PAR-101]` — the link would have been dead during phase B build if
PAR-106 were built before PAR-105. Build sequence already orders them correctly (105 before 106), but the
formal dependency was missing.

APPLIED: added `PAR-105` to `depends_on` in both `backlog/specs/PAR-106-dashboard-list.md` and
`backlog/STATE.json`.

---

## Phase C — Approval Flow

### PAR-107 — KEEP
DOA routing engine with completeness validation, self-approval block, body hash at submit, idempotent
re-submit guard. ce-adversarial-reviewer required. All blocking tests are present and specific.
No changes applied.

### PAR-108 — KEEP
Approve/Reject/Request-changes + step-unlock chain + transition to `in_finance`. Guards verified. UI
inbox with modal confirmation. ce-adversarial-reviewer in DoD.
No changes applied.

### PAR-109 — KEEP
Closes the integrity loop: out-of-order lock (409), immutability after submit (403 on PATCH), hash
verification, re-submit regenerates chain+hash. All acceptance criteria are testable.
No changes applied.

### PAR-110 — IMPROVE (depends_on fixed)
The audit timeline's key blocking test (T-PAR-110-1: "Given submit→approve→approve, Then par_audit has
rows per transition") requires that PAR-107, PAR-108, and PAR-109 are already built and emitting
`par_audit` rows. With `depends_on: [PAR-101]` only, a builder could start PAR-110 before those items
exist and the blocking test would fail to exercise the full chain.

APPLIED: added `PAR-109` to `depends_on` in both `backlog/specs/PAR-110-timeline-audit.md` and
`backlog/STATE.json`. (PAR-109 transitively implies PAR-108 → PAR-107 → PAR-101, so the single
addition is sufficient.)

### PAR-111 — IMPROVE (notification model corrected)
Critical model mismatch: the original spec said "in-app + email; respects quiet hours / prefs from
existing service." The existing `NotificationService` targets `RecipientType = "lead" | "student"` only
— it does NOT support internal `users`. PAR approvers, finance, and requestors are `users`, not leads.

The correct approach (used by CRM-134 for @mentions) is to write directly to the `inAppNotifications`
table (`in_app_notifications`) with `recipientUserId` pointing to the internal user. `NotificationService`
must not be used for PAR notifications.

For email, `MessagingService` or a direct sendEmail call is appropriate; `NotificationService.queue`
would 500 on a `user` recipient ID.

The `InAppNotificationPayload` interface needs `par_id` added (so the notification links to
`/app/par/:id`).

APPLIED (3 edits to `backlog/specs/PAR-111-notifications.md`):
- Replaced the single "in-app + email" AC line with three explicit lines that name the correct table,
  explain why `NotificationService` must not be used, and specify the email approach.
- Added instruction to extend `InAppNotificationPayload` with `par_id`.

---

## Phase D — Finance / Payment

### PAR-112 — KEEP
Finance queue filtered to `approved + execute_payment`. Section 16 fields (PAR BL / Received By /
Assigned To) mapped to `par_payments`. `obtain_quotations` / `provide_estimate` explicitly excluded.
No changes applied.

### PAR-113 — IMPROVE (reapprove endpoint placement clarified)
The `reapproval_required` → `in_finance` transition is an approval action (same approver guard,
same audit trail, same decision pattern) but the spec placed the endpoint in `parPayments.ts`. This
would separate the approval logic into two files and risk divergent guard implementations.

APPLIED: updated the `reapprove` AC line in `backlog/specs/PAR-113-payment-execution.md` to explicitly
state the endpoint belongs in `server/routes/parApprovals.ts` with a rationale comment.

Integer math for 10% check is already required. ce-adversarial-reviewer in DoD. Good.

---

## Phase E — PDF

### PAR-114 — KEEP
`buildParHtml` + `downloadParPdf` mirrors `paymentAccountPdf.ts` exactly (HTML node → html2canvas →
A4 jsPDF). No new PDF lib. MDL format via the existing `money()` function. HTML-escape for all fields.
All 16 sections enumerated in AC. Persona-manager verification of form fidelity in DoD is the right gate.
No changes applied.

### PAR-115 — IMPROVE (PDF attachment changed from optional to required)
CORE §5 explicitly states: "also attach the generated PDF to the record." The spec had this as
"Opțional — Save copy to attachments." Optional contradicts the CORE contract.

APPLIED: updated the AC line in `backlog/specs/PAR-115-pdf-download.md` to remove "optional" framing
and reference CORE §5 as the authority.

---

## Phase F — Admin, Reports, Polish

### PAR-116 — KEEP
Admin UI over existing PAR-002/PAR-003 APIs. Four tabs (DOA, Settings, Members, Reference data) map
precisely to the APIs. Non-admin route guard (403/redirect) is a blocking test. Scope is right — no
new backend work, UI-only over already-built endpoints.
No changes applied.

### PAR-117 — IMPROVE (role guard corrected)
AC said "rol manager/admin/finance" — but `manager` is not a PAR role (CORE §1 defines: requestor,
approver, finance, par_admin). Using `manager` would cause `requirePARRole("manager")` to 403
everyone on the reports page.

APPLIED: changed AC in `backlog/specs/PAR-117-reports.md` to `approver/finance/par_admin`.

### PAR-118 — IMPROVE (depends_on completed)
The complete detail page integrates: `ParTimeline` (PAR-110), "Download PDF" button (PAR-115), approval
chain actions (PAR-109), and the full 16-section layout. With `depends_on: [PAR-109, PAR-114]`, the
builder was allowed to start PAR-118 before PAR-110 (no timeline) and before PAR-115 (no PDF button),
producing a spec-compliant skeleton that would fail tests T-PAR-118-1 and T-PAR-115-1.

APPLIED: added `PAR-110` and `PAR-115` to `depends_on` in both `backlog/specs/PAR-118-detail-page.md`
and `backlog/STATE.json`.

---

## Cross-cutting checks

### Migration discipline — PASS
Max migration prefix on `origin/main` confirmed: `0112` (google_oauth). PAR-001 specifies `0113`.
No collision. Statement-breakpoint rule is called out in PAR-001 spec and migration gate is a blocking
test. `schema/index.ts` export is a blocking test (T-PAR-001-3). Route-mount rule is in PAR-002 and
every subsequent backend item's AC.

### Reuse — PASS (with one correction in PAR-111)
Auth: reuses `requireAuth` + `users`/`sessions`. No new login system. `requirePARRole` layers on top.
PDF: reuses `jspdf` + `html2canvas` + `paymentAccountPdf.ts` pattern. No new PDF lib.
Notifications: corrected in PAR-111 (was incorrectly pointing at `NotificationService` for users).
Attachments: correctly reuses `leadAttachments` base64/URL pattern from `tasks.ts`.
Audit: uses the `par_audit` table (similar to `auditLog` pattern) — a PAR-specific table is correct
because the existing `auditLog` has an `HR-404` comment and targets `teacher`/`payroll`; PAR's audit
needs `par_id` as the FK, so a dedicated table is the right call, not forcing PAR events into the
generic log.
Recharts: verified present as a dependency.
DB portability (`Array.isArray(r)?r:r.rows`): called out in PAR-101/102 and flagged as a blocking test.

### GDPR — PASS
IDNP/IBAN/payee access restriction is in PAR-103 AC. `par_vendors` soft-delete via `active=false`
preserves history. ce-adversarial-reviewer is required for PAR-103 and PAR-113. Payee fields restricted
to requestor/routed-approvers/finance/admin.

### Approval integrity — PASS
Self-approval blocked in PAR-107 (blocking test T-PAR-107-3). Out-of-order blocked in PAR-109
(blocking test T-PAR-109-1). Immutability after submit in PAR-109 (blocking test T-PAR-109-2).
Body hash computed at submit and verified at display (T-PAR-107-5, T-PAR-109-3).

### 10% overage rule — PASS
Integer math explicitly required in PAR-113. Both the ">10% AND >threshold" and "≤threshold exempt"
cases are blocking tests (T-PAR-113-1, T-PAR-113-3). Re-approval flow tested in T-PAR-113-5.

### Tenant isolation — PASS
Every spec mentions tenant-scoped queries. Integration-architect gate (`COMPETING_SYSTEM`) is in every
phase DoD.

---

## Product-level assessment

This batch is well-conceived and worth building. The PAR form is a real, concrete artifact (not invented
requirements) and the spec faithfully maps every paper field to digital storage. The DOA matrix design
is flexible enough for real NGO policies. The reuse discipline is strong: no new auth, no new PDF lib,
no new notification system (now that the PAR-111 model is corrected).

The single biggest risk is the `reapproval_required` re-approval flow in Phase D/C. Two items
(PAR-113 for triggering, PAR-109's `parApprovals.ts` for executing) must agree on the state transition
and the final approver guard. The fix applied to PAR-113 routes both through `parApprovals.ts`, but the
builder must be careful that PAR-109 leaves the `reapprove` route stub open for PAR-113 to complete —
a note in PAR-109's "Files" section would help (not applied here as it would be scope creep into the
build, but the DoD review cycle should catch it).

The one improvement that would most move the product: add a "requestor can attach a proof of delivery"
at the point of payment (PAR-113 collects `proof_url` but it's finance-only). For the NGO use case,
the requestor often has the act of receipt — letting them upload it before submission (extending PAR-104)
would reduce back-and-forth and match how the physical form flows. This is a suggestion, not a blocker.

---

## Summary of changes applied (7 edits)

| Item | Change | Where |
|------|--------|--------|
| PAR-106 | Added `PAR-105` to `depends_on` (dead "New request" link) | spec + STATE.json |
| PAR-110 | Added `PAR-109` to `depends_on` (blocking test requires approval chain emitting audit rows) | spec + STATE.json |
| PAR-111 | Replaced single notification AC with 3 explicit lines: `inAppNotifications` direct, not `NotificationService` (wrong RecipientType); email via `MessagingService`; `par_id` in payload | spec |
| PAR-113 | Clarified `reapprove` endpoint belongs in `parApprovals.ts` (not `parPayments.ts`) | spec |
| PAR-115 | Changed "optional save copy" to required per CORE §5 | spec |
| PAR-117 | Changed role guard from `manager` (not a PAR role) to `approver/finance/par_admin` | spec |
| PAR-118 | Added `PAR-110` + `PAR-115` to `depends_on` (timeline + PDF button dependencies) | spec + STATE.json |

---

BACKLOG_CRITIQUE_RESULT: improved(7 edits)
