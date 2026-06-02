---
id: PAY-005
title: "Reminder automat restanțe — WhatsApp/email la 3/7/14 zile de la scadență"
milestone: PAY
phase: "3"
status: pending
depends_on: [PAY-004, COMM-201]
slug: debt-reminders
---

## Goal

Sistemul trimite automat mesaje de reminder părinților cu facturi restante, la 3, 7 și 14 zile după scadență.
Remindere se pot configura per-tenant (on/off, template mesaj, canal WhatsApp sau email). Fiecare reminder
e logat în `invoice_events` pentru audit. La plată, remindere-le viitoare se anulează automat.

## User stories

- **US-1**: Ca Manager, vreau ca sistemul să trimită automat reminder la 3 zile de la scadență, pentru că nu am timp să sun 50 de părinți zilnic.
- **US-2**: Ca Director, vreau să configurez textul mesajului de reminder și canalul (email sau WhatsApp), pentru că fiecare centru are tonul lui de comunicare.
- **US-3**: Ca Recepționer, vreau să văd în istoricul facturii când au fost trimise remindere-le, pentru că să știu ce a primit părintele.
- **US-4**: Ca Párinte, vreau să primesc un singur reminder pe zi (nu spam), pentru că altfel mă irita și mă detașez.

## Acceptance criteria

- [ ] AC1: Cron job rulează zilnic la 09:00 (sau la cerere via `POST /api/admin/run-reminders`): pentru fiecare factură cu `status = "pending"` și `due_date < today - N zile` (N ∈ {3, 7, 14}) care nu a primit deja reminder-ul de tip N → trimite mesaj.
- [ ] AC2: Tabel `invoice_reminders` — (id, invoice_id, reminder_day INT, sent_at, channel, status: sent/failed). Constraint UNIQUE(invoice_id, reminder_day) — un reminder per tip per factură.
- [ ] AC3: `GET /api/invoices/:id/reminders` → lista remindere-lor trimise pentru factura respectivă (pentru UI timeline).
- [ ] AC4: Settings → Plăți → Remindere: toggle on/off, template mesaj per reminder (variabile: `{student_name}`, `{amount}`, `{invoice_number}`, `{due_date}`, `{days_overdue}`), selectare canal (email / WhatsApp).
- [ ] AC5: La marcarea facturii ca paid → ștergere/anulare remindere viitoare (sau setează `cancelled_at` pe cron schedule).
- [ ] AC6: Deduplicare — dacă reminder de 3 zile a eșuat (COMM provider down), re-încearcă la următoarea rulare a cronului, nu trimite dublu dacă a reușit deja.
- [ ] AC7: `GET /api/payments/overdue-summary` → `{count, totalAmount, byDaysBucket: {3: N, 7: N, 14: N}}` — pentru dashboard widget.

## Files to create / modify

- `server/db/schema/invoiceReminders.ts` — tabel `invoice_reminders`
- `server/lib/reminderCron.ts` — logica cron (exportă `runReminders()` care poate fi testată direct)
- `server/routes/reminders.ts` — `POST /api/admin/run-reminders`, `GET /api/invoices/:id/reminders`, `GET /api/payments/overdue-summary`
- `server/app.ts` — montează route reminders + schedule cron cu `node-cron` sau `setInterval`
- `src/pages/settings/PaymentSettingsPage.tsx` — secțiunea Remindere cu toggle + template editor
- `src/components/payments/InvoiceTimeline.tsx` — extend cu events din `invoice_reminders`
- `drizzle/0033_pay005_invoice_reminders.sql` — migrare

## Tests

- **T-PAY-005-1** [blocant] Given o factură cu due_date = today - 3 zile și fără reminder-3 trimis, When runReminders(), Then se creează un rând în invoice_reminders cu reminder_day=3 și status=sent.
- **T-PAY-005-2** [blocant] Given runReminders() rulat de două ori pentru aceeași factură scadentă de 3 zile, Then în invoice_reminders există exact UN rând (UNIQUE constraint respectat).
- **T-PAY-005-3** [blocant] Given API smoke — boot server, POST /api/auth/login → 200, POST /api/admin/run-reminders → 200.
- **T-PAY-005-4** [normal] Given o factură marcată ca paid după trimiterea reminder-3, When runReminders() pentru reminder-7, Then nu se trimite reminder-7 (status paid).
- **T-PAY-005-5** [normal] Given Settings reminder toggle = off, When runReminders(), Then 0 remindere trimise indiferent de facturi restante.

## Definition of Done

- [ ] Migrare SQL commitată și `db:reset && db:seed` trec
- [ ] `runReminders()` testabil direct fără server
- [ ] Toate testele T-PAY-005-* trec
- [ ] Settings reminder toggle + template editor funcțional
- [ ] Timeline factură afișează remindere trimise
- [ ] Reviewer APPROVED, integration-architect CONNECTED
