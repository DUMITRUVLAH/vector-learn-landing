---
id: PAR-111
title: "Notificări (in-app + email): submit / pending-my-approval / approved / rejected / paid"
milestone: PAR
phase: "C"
status: pending
attempts: 0
depends_on: [PAR-108]
spec: backlog/specs/PAR-111-notifications.md
core: backlog/par/PAR-CORE.md
---

## Goal

Conectează evenimentele fluxului la sistemul de notificări existent (in-app `inAppNotifications` + email
prin serviciul existent), astfel încât oamenii potriviți să fie anunțați la momentul potrivit. Fără
sistem de notificări nou (CORE §7, integration-architect anti-COMPETING_SYSTEM).

## User stories

- **Ca** approver, **vreau** să fiu notificat când o cerere ajunge la mine, **pentru că** altfel stă blocată.
- **Ca** requestor, **vreau** să aflu când cererea e aprobată sau respinsă, **pentru că** depind de bani.
- **Ca** finance, **vreau** notificare când o cerere e gata de plată, **pentru că** preiau imediat.

## Acceptance criteria

- [ ] La submit → notificare către primul approver („PAR-… awaits your approval")
- [ ] La fiecare avansare de pas → notificare către următorul approver
- [ ] La final approval (`execute_payment`) → notificare către finance
- [ ] La reject/changes → notificare către requestor cu motivul
- [ ] La paid → notificare către requestor
- [ ] In-app: scrie direct în `inAppNotifications` (tabelul `in_app_notifications`, `kind="par"`, `payload.par_id`) — acesta e canalul pentru utilizatori interni; `NotificationService` NU se folosește (suportă doar `lead`/`student` ca `RecipientType`, nu `user`)
- [ ] Email: dacă `users.email` e disponibil, trimite via `MessagingService` direct (nu prin `NotificationService.queue`) sau prin templateul de email existent; fără sistem de email nou
- [ ] Quiet hours: pentru notificări in-app nu se aplică (se livrează imediat); pentru email, respectă convenția existentă (dacă templateul o suportă)
- [ ] Link în notificare către `/app/par/:id`; adaugă `par_id` în `InAppNotificationPayload` (extinde interfața din `server/db/schema/inAppNotifications.ts`)
- [ ] Idempotent (nu trimite dublu la retry)

## Files

**New:**
- `server/services/par/notify.ts` — mapează evenimente PAR → notificări (folosește serviciile existente)
- teste `server/services/par/__tests__/notify.test.ts`

**Modified:**
- `server/lib/par/submit.ts`, `server/routes/parApprovals.ts`, `server/routes/parPayments.ts` — apelează notify

## Tests

- **T-PAR-111-1** [blocant] Given submit, Then primul approver primește notificare in-app
- **T-PAR-111-2** [blocant] Given final approval execute_payment, Then finance notificat
- **T-PAR-111-3** [normal] Given reject, Then requestorul primește motivul

## DoD

- Live-smoke verde · integration-architect: reutilizează serviciul de notificări · reviewer APPROVED · personas salvate
