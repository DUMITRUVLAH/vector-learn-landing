---
id: COMM-202
title: "Log mesaje per lead/student — timeline tab + send-from-template din cartonaș"
milestone: COMM
phase: "2 — Log & Send"
priority: P0
slug: message-log
depends_on: [COMM-201, CRM-108, CRM-109]
status: pending
---

# COMM-202 — Log mesaje per lead/student

## Goal

UI care arată istoricul tuturor mesajelor trimise/primite pentru un lead sau student,
integrat în tab-ul „Comunicare" din cartonașul lead (CRM-109) și în pagina studentului.
Include și butonul „Trimite mesaj nou" cu selectare template (refolosind CRM-108).

## In scope

- **Tab „Comunicare"** în `/app/leads/:id` (adăugat lângă tab-urile existente):
  - Listă cronologică (desc) a mesajelor din `messages` unde `lead_id = :id`
  - Fiecare rând: canal (icon), destinatar, preview body, status badge (queued/sent/delivered/failed), timestamp
  - Status badge cu culori din design system: queued=muted, sent=blue, delivered=green, failed=red-destructive
  - Dark mode parity
- **Buton „Mesaj nou"** în tab Comunicare → deschide `ComposeMessageModal`:
  - Selectare canal: Email / SMS / WhatsApp (tab-uri sau select)
  - Selectare template (opțional): dropdown cu template-urile din `GET /api/templates?channel=X`
  - La selectare template: pre-completare body (și subject pt email) cu variabilele leadului
    (`first_name`, `full_name`, `phone`, `email`, `interest_course`, `center_name`)
  - Câmp destinatar auto-completat din lead.email sau lead.phone (în funcție de canal); editabil
  - Body editabil (textarea)
  - Buton „Trimite" → `POST /api/messages/send` → toast succes/eroare
  - Dacă lead.consent_revoked_at: mesaj blocat cu alertă roșie GDPR, buton dezactivat
- **API client hook** `useSendMessage` (react-query mutation)
- **API client hook** `useLeadMessages(leadId)` (react-query query)
- **Tab „Comunicare" în `/app/students/:id`** (dacă există pagina), altfel de scos din scope și notat

## Out of scope

- Inbox unificat (COMM-203)
- Broadcast (COMM-204)
- Răspuns inbound
- Integrare reală provider

## Data / API

Refolosește `GET /api/messages?lead_id=X` și `POST /api/messages/send` din COMM-201.

Variabile din lead pentru template fill:
```ts
{
  first_name: lead.fullName.split(" ")[0],
  full_name: lead.fullName,
  phone: lead.phone ?? "",
  email: lead.email ?? "",
  course: lead.interestCourse ?? "",
  center_name: "Vector Learn", // tenant name fallback
}
```

## Acceptance criteria

- [ ] Tab „Comunicare" vizibil în `/app/leads/:id`
- [ ] Mesajele trimise apar în tab după send
- [ ] Template selectat pre-completează body + subject cu datele leadului
- [ ] Dacă consent_revoked_at: buton dezactivat, mesaj GDPR vizibil
- [ ] Status badge diferențiat per stare (queued/sent/delivered/failed)
- [ ] Dark mode funcțional (tokens nu hex)
- [ ] Mobile: modal responsive, touch target ≥ 44px

## Tests

1. [blocant] Tab „Comunicare" se randează fără crash
2. [blocant] ComposeMessageModal se deschide, selectare template pre-completează body
3. [blocant] Submit → apel POST /api/messages/send cu datele corecte
4. [blocant] consent_revoked_at → buton dezactivat + alertă
5. [normal] Status badge verde pt delivered, roșu pt failed

## DoD

- Build + typecheck + lint verde
- Tests verzi
- Reviewer APPROVED (design system, a11y, dark mode)
- Personas salvate
