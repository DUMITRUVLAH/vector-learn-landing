---
title: An unsubmitted PAR draft (payee IBAN/IDNP + uploaded contracts) was readable by every approver and finance user
problem_type: security_issue
module: par
tags: [par, gdpr, visibility, draft, iban, idnp, attachments, dosar, timeline, duplicated-authorization]
symptoms: GET /api/par/:id, /timeline, /attachments, /dosar and POST /comments all returned 200 on another user's draft
severity: P1
date: 2026-08-25
---

## Symptom
A user with any elevated PAR role (`approver`, `finance`, `par_admin`) could open, list, comment on,
duplicate, and download the full dossier PDF of a **draft** another person had not submitted yet —
including the section-12 payee block (name, IDNP, IBAN) and every uploaded contract or bank document.

## Root cause
The visibility rule ("author, or an elevated role") was **copy-pasted inline into six handlers**:
`GET /:id`, the list query, `POST /:id/duplicate`, `/:id/comments`, `/:id/dosar`, `/:parId/attachments*`
and `/:id/timeline`. Every copy stopped at "has an elevated role", which is right for a *submitted*
request — it has been routed to approvers and finance — but wrong for a draft, which has been routed
to nobody. CORE §1/§9 says the payee block is visible to the requestor, the routed approvers, finance
and admin; a draft has no routed approvers, so it belongs to its author alone.

Duplicated authorization is the real defect: six copies drift, and the drift is invisible until
someone probes each endpoint separately.

## Fix
- `server/lib/par/visibility.ts` — `canViewPar(user, tenantId, par)` is now the single rule, and it
  adds: a `draft` authored by someone else is invisible unless the viewer is a WORKSPACE admin/manager
  (support-level view).
- Every read path calls it: detail, duplicate, comments, quotes, timeline, dosar. `parAttachments.ts`
  applies the same draft clause inside its scoped helper (its selects now carry `status`).
- The list query excludes other people's drafts for non-workspace-admins.
- `server/lib/par/roles.ts` holds the pure `isWorkspaceAdminRole` so tests can use it without a DB.

## How to avoid next time
An authorization rule gets ONE implementation. When you add a PAR read endpoint, call `canViewPar` —
do not re-derive "has an elevated role" inline. Probe every sibling endpoint of a resource, not just
the obvious one: the leak was found by asking the *dossier PDF* and the *attachment list* the same
question the detail endpoint already answered correctly (`scripts/e2e-par-blind-150.mjs`, section on
draft privacy).
