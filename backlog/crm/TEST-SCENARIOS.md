# CRM — Scenarii de testare (gate dur)

> **Regula de aur a acestui modul:** un item CRM-xxx NU se închide și NU se trece mai departe
> până când **toate** scenariile lui de mai jos trec. Dacă un scenariu pică → **repară pe loc**,
> re-rulează, și abia apoi mergi la următorul item. Teste roșii = item neterminat, nu „o rezolvăm
> mai târziu".
>
> Format: Given / When / Then. Fiecare scenariu primește un id `T-CRM-xxx-N`. Acolo unde e
> practic, scrie testul ca vitest (unit/integration) sau ca smoke test de pagină; pentru fluxuri
> de UI fără backend disponibil, mock-uiește API-ul (`src/lib/api/leads.ts`).

---

## Cum rulezi gate-ul pentru un item

```bash
npm run build && npm run typecheck && npm run lint && npm test
```

Apoi verifică manual scenariile marcate `[manual]` (cele care cer browser/drag real). Niciun
scenariu marcat `[blocant]` nu poate rămâne roșu.

---

## CRM-101 — Formular web public intake {#crm-101}

- **T-CRM-101-1** `[blocant]` Given un payload valid (nume+telefon+consent), When `POST /api/leads/intake`, Then se creează lead `source=webform`, `consent_at` salvat, răspuns `{leadId, isDuplicate:false}`.
- **T-CRM-101-2** `[blocant]` Given `consent` lipsă, When intake, Then `400` și niciun lead creat.
- **T-CRM-101-3** Given URL cu `?utm_source=fb&utm_campaign=spring`, When submit, Then leadul are utm_source/campaign salvate.
- **T-CRM-101-4** `[blocant]` Given un al doilea submit cu același telefon, When intake, Then `isDuplicate:true` și NU se creează al doilea lead (se adaugă interaction).
- **T-CRM-101-5** Given captcha invalid, When intake, Then `400`, nu se umple log-ul (max 1 entry/IP/oră).
- **T-CRM-101-6** Given 6 submit-uri într-un minut de la același IP, When al 6-lea, Then rate-limit `429`.

## CRM-102 — Deduplicare & merge {#crm-102}

- **T-CRM-102-1** `[blocant]` Given lead cu telefon `0712 345 678`, When intake `+40712345678`, Then sunt considerate același (match pe `phone_normalized`).
- **T-CRM-102-2** Given email `Ana@X.RO` și `ana@x.ro`, Then match (normalizare lowercase/trim).
- **T-CRM-102-3** Given nume cu spații multiple/diacritice, Then normalizare NFC corectă.
- **T-CRM-102-4** `[blocant]` Given două leaduri distincte, When manager apasă Merge, Then interacțiunile ambelor ajung pe unul, celălalt e arhivat/șters, fără pierdere de timeline.
- **T-CRM-102-5** Given merge, Then câmpurile non-nule ale celui păstrat au prioritate, golurile se completează din celălalt.

## CRM-103 — Adăugare manuală extinsă + Import CSV {#crm-103}

- **T-CRM-103-1** `[blocant]` Given modal add, When submit fără nume, Then validare blochează (nu se trimite request).
- **T-CRM-103-2** Given blur pe telefon ce există deja, Then banner „Există deja: <nume>" cu acțiuni Deschide/Creează oricum.
- **T-CRM-103-3** `[blocant]` Given assigned_to selectat, When submit, Then leadul are responsabilul setat și apare în filtrul „Responsabil".
- **T-CRM-103-4** `[blocant]` Given CSV cu 10 rânduri (2 duplicate, 1 invalid), When import, Then raport „7 create, 2 duplicate, 1 eroare"; importul e tranzacțional pe erorile critice.
- **T-CRM-103-5** Given CSV cu mapare coloane, Then preview primele 5 rânduri înainte de commit.

## CRM-104 — Webhooks Facebook/Google {#crm-104}

- **T-CRM-104-1** `[blocant]` Given webhook cu semnătură HMAC validă, Then lead creat `source=facebook_ad`.
- **T-CRM-104-2** `[blocant]` Given semnătură HMAC invalidă, Then `401`, niciun lead.
- **T-CRM-104-3** `[blocant]` Given același `leadgen_id` de două ori, Then idempotent — un singur lead.
- **T-CRM-104-4** Given lead cu `gclid`, When convertit (CRM-111), Then se pregătește payload Google Offline Conversion.

## CRM-105 — Pipeline (stadii custom, lost reason, filtre) {#crm-105}

- **T-CRM-105-1** `[blocant]` Given owner adaugă stadiu „Așteaptă părinte", Then apare coloană nouă în kanban cu ordinea/culoarea setate.
- **T-CRM-105-2** `[blocant] [manual]` Given drag card în „Pierdut", When fără motiv, Then mutarea se anulează; cu motiv → `lost_reason` salvat.
- **T-CRM-105-3** Given filtru sursă „Facebook", Then se afișează doar leadurile Facebook (fără refetch).
- **T-CRM-105-4** Given search „077", Then filtrare live pe nume+telefon normalizat.
- **T-CRM-105-5** `[blocant]` Given mutare stadiu, Then se creează `interaction type=stage_change` în timeline.

## CRM-106 — Cartonaș detaliu {#crm-106}

- **T-CRM-106-1** `[blocant]` Given `/app/leads/:id`, Then se afișează contact, sursă, UTM, stadiu, timeline.
- **T-CRM-106-2** `[blocant]` Given click Editează → schimbi telefon → Salvează, Then `PATCH /api/leads/:id` și valoarea persistă după reload.
- **T-CRM-106-3** Given tab Activitate, Then interacțiunile sunt sortate cronologic invers.
- **T-CRM-106-4** `[blocant]` Given + Notă, Then nota apare instant în timeline și persistă.
- **T-CRM-106-5** Given lead cu `consent_revoked_at`, Then badge roșu „Consimțământ retras" și butoanele outbound sunt dezactivate.

## CRM-107 — Task-uri & fișiere {#crm-107}

- **T-CRM-107-1** `[blocant]` Given + Task cu scadență mâine, Then apare în tab Task-uri și ca ⏰ pe cardul kanban.
- **T-CRM-107-2** Given task cu scadență trecută, Then afișat roșu „Întârziat".
- **T-CRM-107-3** `[blocant]` Given bifare task done, Then status `done`, `completed_at` setat, interaction `system` scris.
- **T-CRM-107-4** Given upload fișier, Then apare în tab Fișiere cu nume/mărime; download funcționează.

## CRM-108 — Template-uri {#crm-108}

- **T-CRM-108-1** `[blocant]` Given creezi template cu `{{first_name}}`, Then se salvează cu lista de variabile detectate.
- **T-CRM-108-2** `[blocant]` Given preview cu sample data, Then variabilele sunt înlocuite corect.
- **T-CRM-108-3** Given template fără variabile cunoscute, Then avertisment (variabilă necunoscută).

## CRM-109 — Comunicare din cartonaș {#crm-109}

- **T-CRM-109-1** `[blocant]` Given click Email cu template, Then compose pre-completat cu variabilele leadului.
- **T-CRM-109-2** `[blocant]` Given trimitere, Then `interaction type=email direction=outbound` cu `template_id` în metadata.
- **T-CRM-109-3** `[blocant]` Given logare apel cu outcome „no-answer" + durată, Then `interaction type=call` cu metadata corectă.
- **T-CRM-109-4** Given lead cu consent retras, When încerci trimitere, Then blocat cu mesaj clar.

## CRM-110 — Automatizări {#crm-110}

- **T-CRM-110-1** `[blocant]` Given automatizare „lead.created + source=facebook_ad → send_template", When intră lead Facebook, Then se trimite template-ul și se scrie `automation_run status=ok`.
- **T-CRM-110-2** `[blocant]` Given condiție nesatisfăcută, Then `automation_run status=skipped`, nicio acțiune.
- **T-CRM-110-3** `[blocant]` Given trigger time-based „no_contact 3 zile", When cron rulează, Then leadurile necontactate primesc reminder.
- **T-CRM-110-4** Given test mode pe lead fictiv, Then acțiunile se simulează fără efecte reale, cu log vizibil.
- **T-CRM-110-5** Given acțiune eșuată, Then `automation_run status=failed` cu detaliu, fără să oprească restul.

## CRM-111 — Conversie + familie {#crm-111}

- **T-CRM-111-1** `[blocant]` Given convert, Then se creează `students` (status active), `leads.stage=paid`, `converted_to_student_id` setat.
- **T-CRM-111-2** `[blocant]` Given convert cu plătitor (părinte), Then se creează `families` și `students.family_id` legat.
- **T-CRM-111-3** `[blocant]` Given a doua conversie a aceluiași lead, Then eroare `already_converted`, fără student duplicat.
- **T-CRM-111-4** Given reasignare la alt vânzător, Then `assigned_to` actualizat + notificare.
- **T-CRM-111-5** `[manual]` Given drag în coloana „Client", Then se deschide modalul de conversie (nu schimbă direct stage-ul).

## CRM-112 — Analytics {#crm-112}

- **T-CRM-112-1** `[blocant]` Given 100 leaduri în diverse stadii, Then funnel-ul afișează corect new→contacted→trial→paid + procent conversie.
- **T-CRM-112-2** Given leaduri pierdute cu motive, Then pie chart lost-reason corect agregat.
- **T-CRM-112-3** `[blocant]` Given campanie cu buget și N convertiți, Then ROAS = cost / paying-students calculat corect.
- **T-CRM-112-4** Given breakdown per sursă, Then conversia e segmentată corect pe `source`.

---

## Scenarii transversale (rulate la fiecare item)

- **T-CRM-X-1** `[blocant]` Multi-tenant: un lead al tenantului A NU e vizibil/editabil din tenantul B.
- **T-CRM-X-2** `[blocant]` Toate paginile noi: 0 violări axe critical/serious.
- **T-CRM-X-3** Dark mode: toate componentele noi arată corect în light + dark.
- **T-CRM-X-4** Zero `any` în TS; props interfaces pentru fiecare componentă.
- **T-CRM-X-5** Niciun hex hardcodat în `.tsx` (doar tokens semantice).
