# PAR — Payment Action Request workflow · CORE (source of truth)

> **What this module is.** A digital, online, multi-role workflow that replaces the paper
> **"Payment Action Request (PAR) Form"** used by donor-funded NGOs / international-development
> projects (the inserted sample is from the **ATIC** organization, **Digital Safeguard** project,
> Republic of Moldova). A staff member **requests** a payment, one or more **approvers** sign it
> off according to a **Delegation of Authority (DOA)** matrix, and a **finance** officer executes
> the payment. The system reproduces the exact paper form as a downloadable **PDF**.
>
> This is the behavior contract. Every PAR-xxx item is built to match this document. If an item's
> implementation diverges from CORE, update CORE in the same PR (CLAUDE.md §0.2).

> **Reuse, don't rebuild (CLAUDE.md §3.7 / §0.2).** This module is a NEW area inside the existing
> Vector Learn repo. It REUSES the platform that already exists:
> - **Auth / sessions / 2FA** — `server/middleware/requireAuth.ts`, `users`, `sessions`.
> - **Multi-tenant** — every row carries `tenant_id` (the NGO/organization). Tenant isolation is
>   already enforced; copy the `eq(table.tenantId, c.get("user").tenantId)` pattern from
>   `server/routes/invoices.ts`.
> - **DB** — Drizzle ORM, PGlite locally / Postgres (Supabase) in prod. Same migration discipline
>   as the rest of the repo (CLAUDE.md §3.5.1).
> - **PDF** — `jspdf` + `html2canvas`, exactly as `src/lib/paymentAccountPdf.ts` does it (render a
>   styled HTML node → rasterize → A4 PDF; this is how diacritics survive). Do NOT add a new PDF lib.
> - **Design system** — Vector 365 tokens (`src/index.css`), semantic classes only, light + dark.
> - **In-app + email notifications** — `server/services/notifications`, `inAppNotifications`.
> - **Audit log** — `auditLog` table pattern.
>
> NEW tables live in `server/db/schema/par.ts` (+ `export * from "./par"` in `schema/index.ts`,
> same commit — §3.5.1 schema-index rule). NEW routes mount in `server/app.ts` (same commit —
> route-mount rule). Frontend lives under `/app/par/*`.

---

## 0. The source document, field by field (every variable, reasoned)

The paper form has **16 numbered sections**. Each maps to data we must capture and re-render on the
PDF. Below: the field, the sample value, the data type/validation, who fills it, and when.

### Header block (sections 1–7) — request metadata

| # | Field | Sample value | Type / validation | Filled by | Stage |
|---|-------|--------------|-------------------|-----------|-------|
| 1 | **Date of Request** | `10-Jun-26` | date, defaults to today | Requestor | create |
| 2 | **Requested By** | `Sirbu Cristina` | text → defaults to current user's name | Requestor | create |
| 3 | **Title of Requestor / Code** | `Procurement Specialist / M13` | text (job title + staff/position code) | Requestor | create |
| 4 | **Department** | `ATIC` | text / select from org's departments | Requestor | create |
| 5 | **Date Items/Services Needed** | _(blank in sample)_ | date, optional, ≥ date of request | Requestor | create |
| 6 | **Requested For / Deliver To** | `Digital Safeguard` | text / select from org's **projects/programs** | Requestor | create |
| 7 | **Budget code** | `(according to monthly budget planning)` | text / select from **budget codes**; free note allowed | Requestor | create |

### Classification (sections 8–9) — drives routing

| # | Field | Sample value | Options (check ONE) | Drives |
|---|-------|--------------|---------------------|--------|
| 8 | **Purpose of PAR** | `Execute payment` ✗ | `execute_payment` · `obtain_quotations` (in preparation for procurement) · `provide_estimate` (cost only, no competition) | Determines whether this PAR pays money (full approval + finance) or is a pre-procurement estimate. |
| 9 | **Charge To** | `Program` ✗ (+ billing code) | `operations` · `program` · `other` (+ free billing code) | Cost classification; can affect which DOA branch/approver applies. |

> **Reasoning:** `purpose = execute_payment` is the only purpose that reaches the **Finance/Payment**
> stage (section 16). `obtain_quotations` and `provide_estimate` close after approval (no payout).
> `charge_to` + `budget_code` + `department` together identify the funding line for reporting.

### Section 10 — Items / Services Requested (the line-item table)

The repeating table. Columns and the sample row:

| Col | Sample | Type | Rule |
|-----|--------|------|------|
| Item # | `1` | auto (row index) | sequential |
| Description / Specifications | `provision of psihologic session services` | text, required | — |
| Quantity | `1` | number > 0 | — |
| Units | `sesie` | text (e.g. "sesie", "buc", "hours") | — |
| Est. Unit Price (MDL) | `7,000.00` | money (minor units) | currency per PAR, default **MDL** |
| Est. Total Price (MDL) | `7,000.00` | money = qty × unit price | **computed**, never hand-typed |

- **TOTAL ESTIMATED COST** = Σ(line totals). Sample: `MDL 7,000.00`.
- **The 10% overage rule (printed on the form):** _"For transactions above micro-purchase threshold,
  if final price for purchase exceeds total estimated cost by more than 10%, purchase shall not
  proceed without approval from approver below."_ → at the **Finance** stage, if the actual paid
  amount exceeds the approved total by **> 10%** AND the total is **above the micro-purchase
  threshold**, the PAR must be **re-approved** before payment proceeds. This is a hard business rule
  (see §4 state machine and §3 DOA).

### Section 11 — Purpose and Description of End Use

Free text. Sample: _"performed group psychological consulting services, organized within the Digital
Safeguard Project, lasting 120-180 min, on the Zoom platform."_ Required when `purpose = execute_payment`.

### Section 12 — Special Instructions / Additional Info = **the Payee (vendor) block**

This is where the recipient of the money is identified. **All four are personal/banking data
(GDPR-sensitive — see §9):**

| Field | Sample | Type / validation |
|-------|--------|-------------------|
| Name, Surname | `Daria Roitman` | text, required for payout |
| **IDNP** | `2008001007903` | Moldova personal ID — 13 digits |
| **IBAN** | `MD48ML000002259A19498121` | IBAN; **MD** = 24 chars, `MD\d{2}[A-Z0-9]{20}`, mod-97 checksum |
| Bank | `BC "Moldindconbank" S.A.` | text / select from bank list |

> Payees are reusable → a **Vendor/Payee registry** (`par_vendors`) so a requestor picks an existing
> payee instead of re-typing IDNP/IBAN (and to centralize the GDPR footprint).

### Section 13 — Attachments

- Radio: **Yes (describe)** ✗ / No attachments.
- Sample describes two: _"act of receipt from June 09, 2026"_ and _"Contract nr CS#DigiSec-2026-06-08
  of June 08, 2026"_.
- → file uploads (reuse the lead/contract attachment pattern already in the repo) + a free-text
  "describe" line that prints on the PDF.

### Sections 14–15 — Signatures (the approval chain, captured digitally)

| Section | Role on form | Sample | What we store |
|---------|--------------|--------|---------------|
| 14 | **Requestor Signature** | Name `Sirbu Cristina`, Title `Procurement Specialist / M13`, Date `10-Jun-26` | the submit event: user, title snapshot, timestamp, e-signature |
| 15 | **Approver (DOA Holder / Supervisor / Tech Lead)** | Name `Ana Chirita`, Title `Strategic Projects Director`, Date `10-Jun-26` | approval #1 |
| 15 (2nd) | **APPROVE — Executive Director** | Name `Irina Oriol`, Title `Executive Director`, Date `10-Jun-26` | approval #2 (final) |

> **Reasoning:** the form has **two stacked approval slots** under section 15 → this 7,000 MDL request
> needed **two sequential approvals**: the DOA holder (Strategic Projects Director) then the Executive
> Director. The number/level of approvals is **not fixed** — it is derived from the **DOA matrix** by
> amount (§3). The digital "signature" is an authenticated approve action (user + timestamp + optional
> typed name / drawn signature), with the name+title+date printed in the signature box on the PDF.

### Section 16 — Payment Internal Use Only (Finance stage)

Filled only by **Finance** after final approval:

| Field | Meaning |
|-------|---------|
| **PAR BL** | PAR budget line (the accounting line the payment is booked to) |
| **Date Received** | when finance received the approved PAR |
| **Received By** | finance user who took it |
| **Assigned To** | finance user processing the payment |

Plus what finance actually does: record the **actual paid amount**, **payment date**, **payment
reference/proof**, enforce the **10% overage rule**, and move the PAR to `paid`.

### Other printed constants

- **IBAN / Bank** also appear near section 16 (`IBAN:`, `Bank: BC "Moldindconbank" S.A.`) — the
  payout destination, same as the payee block.
- Header: **"Payment Action Request (PAR) Form"** + "Instructions for completing this form may be
  found here." (a help link).
- Footer/right-margin label: **"Procurement Specialist / M13"**, **"Digital Safeguard"** (project),
  page **1**.

---

## 1. Roles & permissions

Roles are **per-tenant** (an NGO). A user can hold more than one role. Stored in `par_members`
(maps `user_id` → `par_role` + an optional `approval_limit_cents` for DOA). Reuses the existing
`users`/`sessions`/auth — no new login system.

| Role | Can | Cannot |
|------|-----|--------|
| **requestor** | create/edit own draft PARs, submit, view own PARs, download PDF | approve, execute payment, see others' PARs (unless also approver/finance) |
| **approver** | see PARs routed to them, approve / reject / request-changes with comment, e-sign | edit the request body, execute payment |
| **finance** | see approved (`purpose=execute_payment`) PARs, fill section 16, record actual payment, mark paid, enforce 10% rule | approve PARs they didn't get routed, edit the request body |
| **par_admin** | everything above + configure DOA matrix, budget codes, departments, projects, vendors, micro-purchase threshold, manage members/roles | — |

RBAC helper: a `requirePARRole(...roles)` middleware (built in PAR-002) layered on `requireAuth`,
mirroring the tenant-scoped pattern already in the repo. **Tenant isolation is mandatory on every
query** (CLAUDE.md integration rules).

---

## 2. Entities (data model — `server/db/schema/par.ts`)

All tables: `id uuid pk`, `tenant_id uuid → tenants` (cascade), `created_at`, `updated_at`. Money in
**integer minor units** (`*_cents`) + a `currency` (default `MDL`) — matching `invoices`/`payments`.

1. **`par_requests`** — the PAR header. Fields mirror sections 1–13 + status:
   `request_no` (human id, e.g. `PAR-2026-0001`, sequential per tenant), `date_of_request`,
   `requested_by_user_id`, `requestor_title`, `department_id`, `date_needed`, `project_id`
   (Requested For/Deliver To), `budget_code_id`, `budget_code_note`,
   `purpose` (enum: execute_payment | obtain_quotations | provide_estimate),
   `charge_to` (enum: operations | program | other), `charge_billing_code`,
   `end_use` (text, section 11),
   `vendor_id` (→ par_vendors) **or** inline payee snapshot (`payee_name`,`payee_idnp`,`payee_iban`,`payee_bank`),
   `attachments_present` (bool), `attachments_note` (text),
   `currency`, `total_estimated_cents` (cached Σ lines),
   `status` (enum, §4), `submitted_at`, `approved_at`, `paid_at`, `cancelled_at`.
2. **`par_line_items`** — section 10 rows: `par_id`, `position`, `description`, `quantity`,
   `unit`, `unit_price_cents`, `line_total_cents` (computed).
3. **`par_approvals`** — the approval chain (sections 14–15): `par_id`, `step` (1,2,…),
   `approver_user_id` (assigned), `approver_role_label` (e.g. "DOA Holder", "Executive Director"),
   `decision` (enum: pending | approved | rejected | changes_requested), `decided_at`,
   `comment`, `signature_name`, `signature_title`. Step 0 row = the requestor submit (signature 14).
4. **`par_attachments`** — section 13: `par_id`, `file_url`, `file_name`, `kind`
   (act_of_receipt | contract | quotation | invoice | other), `uploaded_by`.
5. **`par_payments`** — section 16: `par_id`, `par_bl`, `received_at`, `received_by_user_id`,
   `assigned_to_user_id`, `actual_amount_cents`, `payment_date`, `payment_ref`, `proof_url`,
   `overage_reapproved` (bool).
6. **`par_doa_matrix`** — Delegation of Authority rules (§3): `tenant_id`, `charge_to` (nullable =
   any), `department_id` (nullable = any), `min_amount_cents`, `max_amount_cents`, `step`,
   `approver_role_label`, `approver_user_id` (nullable) or `approver_par_role` (e.g. any approver),
   `active`.
7. **`par_budget_codes`** — `tenant_id`, `code`, `name`, `active`.
8. **`par_departments`** — `tenant_id`, `name`, `active`.
9. **`par_projects`** — `tenant_id`, `name` (e.g. "Digital Safeguard"), `donor`, `active`.
10. **`par_vendors`** — reusable payees: `tenant_id`, `name`, `idnp`, `iban`, `bank`, `notes`.
11. **`par_settings`** — `tenant_id`, `micro_purchase_threshold_cents`, `default_currency`,
    `org_legal_name`, `org_logo_url`, `pdf_help_url`, `request_no_prefix` (default `PAR`).
12. **`par_audit`** — append-only event log (created/submitted/approved/rejected/paid/edited) with
    actor, timestamp, before/after diff (reuse `auditLog` pattern, or a dedicated table).

> **Schema-index rule:** add `export * from "./par";` to `server/db/schema/index.ts` in PAR-001's
> commit. **Migration:** committed `.sql`, prefix **> max on origin/main** (currently `0112`, so PAR
> starts at `0113`), `db:reset && db:seed` green (§3.5.1).

---

## 3. Delegation of Authority (DOA) matrix — the routing brain

Research synthesis (USAID/UN/UNFPA procurement manuals + commercial requisition best practice):
approval is **multi-level, threshold-driven**. Who must sign depends on the **amount**, and often the
**charge-to / department**. Below a **micro-purchase threshold** a single manager approval suffices;
above it, additional and higher approvals stack up; the highest band reaches the Executive Director.

**Default DOA for a fresh tenant** (seed; admin can edit in PAR-116). Amounts illustrative in MDL:

| Band (total estimated) | Step 1 | Step 2 | Step 3 |
|------------------------|--------|--------|--------|
| ≤ micro-purchase (e.g. ≤ 10,000) | Approver (DOA Holder / Supervisor) | — | — |
| > micro-purchase, ≤ 100,000 | Approver (DOA Holder) | Executive Director | — |
| > 100,000 | Approver (DOA Holder) | Finance/Program Director | Executive Director |

The sample 7,000 MDL request shows **two** signatures (DOA Holder + Executive Director) → the sample
tenant's micro-purchase threshold is **< 7,000**, so even a "small" request needed both. Thresholds
are **per-tenant configurable**; the matrix above is just the seed.

**Routing engine (PAR-107):** on submit, evaluate `total_estimated_cents` (+ `charge_to`,
`department`) against the active DOA matrix → produce an **ordered list of approval steps** →
create `par_approvals` rows (step 1 `pending`, rest `pending` but locked until prior approves). The
PAR advances one step per approval. Reject/changes at any step stops the chain.

**10% overage re-approval:** if Finance enters `actual_amount_cents` that exceeds
`total_estimated_cents` by **> 10%** and `total_estimated_cents > micro_purchase_threshold` →
PAR returns to a `reapproval_required` state and the final approver must re-approve before `paid`.

---

## 4. State machine (status lifecycle)

```
draft ──submit──▶ pending_approval ──(each step approves)──▶ approved
  ▲                    │   │                                    │
  │              reject│   │request_changes                     │ purpose=execute_payment
  └──────changes_requested◀┘                                    ▼
                       │                                   in_finance (received/assigned)
                       ▼                                        │
                   rejected (terminal)                          ▼  enter actual amount
                                                          ┌── within 10% ──▶ paid (terminal)
draft/any non-terminal ──cancel──▶ cancelled (terminal)  └── >10% & >threshold ─▶ reapproval_required ─▶ (final approver) ─▶ paid
```

- `obtain_quotations` / `provide_estimate` PARs end at **`approved`** (no finance/payout).
- Only the **requestor** (own draft) or **par_admin** can `cancel` before `paid`.
- Edits after submit are blocked except via `request_changes` → back to `draft` for the requestor.
- Every transition writes a `par_audit` row and (where relevant) a notification.

---

## 5. The PDF output (must match the inserted sample)

`src/lib/parPdf.ts`, mirroring `src/lib/paymentAccountPdf.ts` (HTML node → html2canvas → A4 jsPDF;
diacritics safe). The rendered PDF reproduces, in order: the pink **"Payment Action Request (PAR)
Form"** title band + help link; the boxed header grid (sections 1–7); the two check-box groups
(8 Purpose, 9 Charge To) with the chosen option marked **X**; the line-item table (section 10) with
**TOTAL ESTIMATED COST** and the 10%-overage footnote; section 11 end-use; section 12 payee block
(Name/IDNP/IBAN/Bank); section 13 attachments radio + describe lines; sections 14–15 signature boxes
filled from `par_approvals` (Name / Title / Date, "APPROVE" + name for extra approvers); section 16
Payment Internal Use grid (PAR BL / Date Received / Received By / Assigned To) + IBAN/Bank.
**MDL money format** = `paymentAccountPdf.money()` style (`L 7 000` / grouped thousands).
One-click **Download PDF** from the PAR detail page; also attach the generated PDF to the record.

---

## 6. Screens (frontend, under `/app/par`)

- `/app/par` — **dashboard**: my requests + (if approver) pending-my-approval + (if finance)
  awaiting-payment, with status chips and totals.
- `/app/par/new` — **create wizard**: header → classification → line items → end-use → payee →
  attachments → review → submit.
- `/app/par/:id` — **detail**: all 16 sections read-only, status timeline, approval chain with
  decisions/comments, finance block, **Download PDF**, role-aware action buttons
  (Approve/Reject/Request changes · Receive/Assign/Mark paid · Cancel · Edit draft).
- `/app/par/inbox` — **approver inbox** (pending my approval).
- `/app/par/finance` — **finance queue** (approved execute_payment PARs).
- `/app/par/admin` — **admin**: DOA matrix, budget codes, departments, projects, vendors, settings,
  members/roles.

All screens: Vector 365 tokens, light + dark, WCAG AA, mobile-usable (CLAUDE.md §3.1/§3.3).

---

## 7. Notifications (reuse existing service)

- Requestor: on each approval step, on final approval, on reject/changes, on paid.
- Next approver: when the PAR reaches their step ("PAR-2026-0001 awaits your approval").
- Finance: when a PAR is fully approved (`execute_payment`).
- Channel: in-app (`inAppNotifications`) + email (existing notification service). Respect quiet
  hours / prefs already in the platform.

---

## 8. Reporting (PAR-117)

Spend by **budget code**, **department**, **project/program**, **charge-to**; PAR **aging**
(time in each state); **approval cycle time** (submit → approved); paid vs estimated variance;
export CSV. Tenant-scoped, branch-scoped where relevant.

---

## 9. Compliance / security (non-negotiable)

- **GDPR:** IDNP + IBAN + payee name are personal/financial data. Minimize exposure: only
  requestor (own), routed approvers, finance, and admin see the payee block. Audit every read of
  the vendor registry. Support payee deletion/anonymization. (Mirror the consent/audit patterns
  already in the repo.)
- **Tenant isolation** on every query (no cross-NGO leakage).
- **IBAN validation** (mod-97) + **IDNP** format check before payout.
- **Approval integrity:** an approver cannot approve their own request; a step cannot be approved
  out of order; amounts/line items are **immutable after submit** (hash the body at submit so the
  PDF/audit proves what was approved).
- **Money:** integer minor units only; `Array.isArray(r) ? r : r.rows` for PGlite/Postgres
  portability (CLAUDE.md §3.5.1); never raw `.execute().rows`.

---

## 10. Out of scope (v1)

- Real bank/payment-rail integration (we record the payment; we don't move money).
- Full procurement competition / bid evaluation (the form's `obtain_quotations` path captures the
  request only; multi-vendor bid scoring is a later module).
- e-Signature legal certification (we capture authenticated approve + typed/drawn name; not a
  qualified e-signature provider).
- Multi-currency FX conversion (per-PAR single currency; default MDL).

---

*CORE is the contract. Build to it; if you diverge, update it in the same PR (CLAUDE.md §0.2).*
