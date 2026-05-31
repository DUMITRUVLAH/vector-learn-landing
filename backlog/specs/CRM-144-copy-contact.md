---
id: CRM-144
title: "Buton „copiază\" pentru telefon / email pe cartonașul lead"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-106]
slug: copy-contact
---

## Goal

Pe cartonaș, telefonul și email-ul sunt linkuri `tel:`/`mailto:`
([LeadCardPage.tsx:693-700](../../src/pages/app/LeadCardPage.tsx#L693-L700),
[LeadCardPage.tsx:743-751](../../src/pages/app/LeadCardPage.tsx#L743-L751)) — utile pe mobil, dar
pe desktop agentul vrea să **copieze** numărul/email-ul în alt sistem. Nu există buton de copy.
Adaugă un buton mic „copiază" lângă fiecare, cu feedback vizual.

---

## In scope

- Buton icon „copiază" (Lucide `Copy` → `Check` la succes) lângă telefon și email pe cartonaș.
- `navigator.clipboard.writeText` cu fallback graceful; feedback „Copiat!" 1.5s.
- `aria-label` corect; touch target ≥ 44px pe mobil.

## Out of scope

- Copy pe card kanban (rămâne doar pe cartonaș).
- Copiere bloc „toate datele" (separat dacă se cere).

---

## User stories

- **US-1**: Ca agent pe desktop, vreau să copiez numărul de telefon cu un click.

---

## Acceptance criteria

- [ ] AC1: Lângă telefon (când există) apare buton „copiază" cu `aria-label`.
- [ ] AC2: Lângă email (când există) apare buton „copiază".
- [ ] AC3: Click copiază valoarea în clipboard și afișează feedback „Copiat!" temporar.
- [ ] AC4: Dacă `clipboard` indisponibil, nu crapă (fallback / mesaj discret).
- [ ] AC5: 0 axe critical/serious; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx`

### New
- `src/components/crm/CopyButton.tsx` (reutilizabil)
- `src/__tests__/crm/copy-contact.test.tsx`

---

## Tests

- **T-CRM-144-1** `[blocant]` Given lead cu telefon, Then există buton copiază cu `aria-label`.
- **T-CRM-144-2** `[blocant]` Given click, Then `clipboard.writeText` apelat cu numărul; feedback afișat.
- **T-CRM-144-3** Given clipboard care rejectează, Then nu aruncă excepție.

---

## Definition of Done

- [ ] AC-uri; T-CRM-144-1..3 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
