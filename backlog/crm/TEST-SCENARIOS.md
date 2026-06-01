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

## CRM-113 — Valoare deal + rollup {#crm-113}
- **T-CRM-113-1** `[blocant]` Given un lead cu `value_cents=36000`, When deschizi pipeline, Then cardul afișează „€360".
- **T-CRM-113-2** `[blocant]` Given 3 leaduri în „contacted" cu valori, Then antetul coloanei arată count + Σ valoare corecte.
- **T-CRM-113-3** `[blocant]` Given header kanban, Then arată total leaduri + Σ valoare pe tot pipeline-ul.
- **T-CRM-113-4** Given `debt_cents>0`, Then cardul arată „Datorie €x"; dacă 0 → nu se afișează.
- **T-CRM-113-5** Given editezi valoarea din card, Then persistă după reload (PATCH /api/leads/:id).

## CRM-114 — Companie + contacte {#crm-114}
- **T-CRM-114-1** `[blocant]` Given lead cu `company`, Then cardul afișează compania sub nume.
- **T-CRM-114-2** `[blocant]` Given adaugi 2 contacte, Then ambele apar; exact unul `is_primary`.
- **T-CRM-114-3** Given `deal_name` setat, Then titlul cartonașului = deal_name (nu full_name).
- **T-CRM-114-4** Given ștergi un contact, Then dispare; tenant-scoped.

## CRM-115 — Tag-uri + câmpuri custom {#crm-115}
- **T-CRM-115-1** `[blocant]` Given adaugi tag „vip", Then apare pe lead și e filtrabil.
- **T-CRM-115-2** `[blocant]` Given owner creează câmp custom select „Ediție" cu opțiuni, Then apare în cartonaș și valoarea se salvează per lead.
- **T-CRM-115-3** Given intake fără UTM, Then se atașează tag „organic".

## CRM-116 — Semnale task pe card {#crm-116}
- **T-CRM-116-1** `[blocant]` Given lead fără task open, Then card arată badge „Fără task" (warning).
- **T-CRM-116-2** `[blocant]` Given task open scadent acum 75 zile, Then card arată „75d" roșu.
- **T-CRM-116-3** Given task open mâine, Then card arată data, nu badge roșu.
- **T-CRM-116-4** Given filtru „fără task", Then se afișează doar leadurile fără task open.

## CRM-129 — Filtru tag + bulk assign + Ziua mea {#crm-129}
- **T-CRM-129-1** `[blocant]` Given kanban cu leads tagged „vip" și „organic", When selectez filtrul „vip", Then doar leadurile cu tag „vip" rămân vizibile în toate coloanele.
- **T-CRM-129-2** `[blocant]` Given 3 leaduri selectate, When apas „Reasignează", Then `PATCH /api/leads/bulk-assign` e chemat cu cele 3 ID-uri și noul assignedTo; pipeline reîncarcă.
- **T-CRM-129-3** `[blocant]` Given butonul „Ziua mea" activ, Then se afișează doar leadurile cu nextTask.dueAt = today.
- **T-CRM-129-4** Given filtrul tag „vip" + filtrul sursă „Facebook" activ simultan, Then se afișează numai leadurile cu tag „vip" ȘI source = „facebook_ad".
- **T-CRM-129-5** Given Escape apăsat cu carduri selectate, Then selecția se șterge.
- **T-CRM-129-6** `[blocant]` `PATCH /api/leads/bulk-assign` cu leadIds din tenant B → 403/0 rânduri afectate.

## CRM-130 — Shortcuts tastatură + WIP limits + collapse {#crm-130}
- **T-CRM-130-1** `[blocant]` Given `useKanbanKeyboard` montat, When tastez `/` (nu în input), Then callback `onSearch` e apelat.
- **T-CRM-130-2** `[blocant]` Given `useKanbanKeyboard`, When tastez `n` (nu în input), Then callback `onNewLead` e apelat.
- **T-CRM-130-3** `[blocant]` Given shortcut-ul `/` și focus pe un `<input>`, When tastez `/`, Then callback NU e apelat.
- **T-CRM-130-4** `[blocant]` Given stage cu `wip_limit=3` și `count=5`, Then header coloană conține indicator roșu.
- **T-CRM-130-5** Given stage cu `wip_limit=null`, Then header NU afișează indicator roșu.
- **T-CRM-130-6** `[blocant]` Given coloană colapsată în localStorage, When pagina se reîncarcă, Then coloana respectivă e încă colapsată.

## CRM-131 — Lead card UX polish {#crm-131}
- **T-CRM-131-1** `[blocant]` Given `LeadCardSkeleton` randat, Then conține elemente cu clasa `animate-pulse`.
- **T-CRM-131-2** `[blocant]` Given submit notă cu mock care rezolvă după delay, Then nota apare imediat cu indicator „Se salvează..."; după rezolvare, indicatorul dispare.
- **T-CRM-131-3** `[blocant]` Given submit notă cu mock care rejectează, Then nota optimistă dispare și toast eroare e afișat.
- **T-CRM-131-4** `[blocant]` Given `useUndoableDelete` cu delay 5000ms, When cancel în 100ms, Then callback delete NU e apelat.
- **T-CRM-131-5** Given `useUndoableDelete` fără cancel, Then callback delete e apelat după delay.
- **T-CRM-131-6** `[blocant]` Given tab Activitate cu 0 interacțiuni, Then conține textul „Nicio activitate încă".
- **T-CRM-131-7** Given tab Task-uri cu 0 task-uri, Then conține textul „Nicio sarcină".

## CRM-132 — Timeline filters {#crm-132}
- **T-CRM-132-1** `[blocant]` Given `TimelineFilters` randat cu counts `{all:5, note:2, call:1, commChannel:1, stage_change:1}`, Then 5 butoane vizibile cu numerele corecte.
- **T-CRM-132-2** `[blocant]` Given filtru "Apeluri" selectat și interactions cu 1 call + 2 notes, When render, Then doar 1 item vizibil în timeline.
- **T-CRM-132-3** `[blocant]` Given filtru "Note" cu 0 note, Then textul „Nicio intrare de tipul selectat" vizibil.
- **T-CRM-132-4** Given filtru activ e "Apeluri", When click pe "Toate", Then toate interacțiunile revin vizibile.

## CRM-133 — Duplicate detection banner {#crm-133}
- **T-CRM-133-1** `[blocant]` Given `dedup-check` returnează 1 duplicat, Then banner cu textul „Posibil duplicat" e vizibil.
- **T-CRM-133-2** `[blocant]` Given `dedup-check` returnează `{ duplicates: [] }`, Then banner nu apare.
- **T-CRM-133-3** `[blocant]` Given `dedup-check` eșuează (reject), Then banner nu apare.
- **T-CRM-133-4** `[blocant]` Given click „Fuzionează", Then `MergeLeadModal` se deschide cu 2 opțiuni radio.
- **T-CRM-133-5** Given confirmare merge, Then `POST /api/leads/:id/merge` e apelat o singură dată cu parametrii corecți.

## CRM-134 — @mentions in note-uri + notificări {#crm-134}

- **T-CRM-134-1** `[blocant]` Given `MentionTextarea` randat cu lista `[{id:'u1', name:'Ana Moraru'}]`, When tastez `@Ana`, Then popover vizibil cu opțiunea „Ana Moraru".
- **T-CRM-134-2** `[blocant]` Given popover deschis, When click pe „Ana Moraru", Then textarea conține `@Ana Moraru` și popover-ul e închis.
- **T-CRM-134-3** `[blocant]` Given `parseMentions('@Ana Moraru text', [{id:'u1',name:'Ana Moraru'}])`, Then returnează `['u1']`.
- **T-CRM-134-4** `[blocant]` Given `POST /api/leads/:id/interactions` cu body `"@Ana Moraru nota"` și Ana e în tenant, Then `lead_mentions` are 1 rând nou cu `mentioned_user_id = u1`.
- **T-CRM-134-5** `[blocant]` Given aceeași cerere, Then `notification_queue` are 1 rând nou cu `channel='in_app'` și `recipient_id = u1`.
- **T-CRM-134-6** `[blocant]` Given `GET /api/notifications/unread-count` cu 2 notificări unread, Then `{ count: 2 }`.
- **T-CRM-134-7** `[blocant]` Given `PATCH /api/notifications/mark-read`, Then toate notificările unread ale utilizatorului curent au `sent_at` setat.
- **T-CRM-134-8** `[blocant]` Given `NotificationBell` cu `count=3`, Then badge cu textul „3" vizibil.
- **T-CRM-134-9** Given `NotificationBell` cu `count=0`, Then badge nu e vizibil.
- **T-CRM-134-10** `[blocant]` Multi-tenant: `GET /api/notifications/unread-count` cu token tenant B returnează 0 chiar dacă există notificări în tenant A.

## CRM-135 — Round-robin auto-assign {#crm-135}

- **T-CRM-135-1** `[blocant]` Given `autoAssign` cu `rr_enabled=false`, When called, Then returnează `null` (neschimbat).
- **T-CRM-135-2** `[blocant]` Given `rr_enabled=true`, `rr_user_ids=['u1','u2']`, `rr_index=0`, `currentAssignedTo=null`, When `autoAssign`, Then returnează `'u1'` și `rr_index` devine `1`.
- **T-CRM-135-3** `[blocant]` Given `rr_index=1`, `rr_user_ids=['u1','u2']`, When `autoAssign`, Then returnează `'u2'` și `rr_index` devine `2`.
- **T-CRM-135-4** `[blocant]` Given `rr_index=2` și `len=2` (wrap-around), When `autoAssign`, Then returnează `'u1'` (index % 2 = 0).
- **T-CRM-135-5** `[blocant]` Given `currentAssignedTo='u3'` + RR activ, When `autoAssign`, Then returnează `'u3'` (no override).
- **T-CRM-135-6** `[blocant]` Given `POST /api/leads` fără `assignedTo` + RR activ cu `['u1']`, Then lead creat cu `assignedTo='u1'`.
- **T-CRM-135-7** `[blocant]` Given `PATCH /api/settings/rr-assign` cu rol `teacher` (non-admin), Then `403`.
- **T-CRM-135-8** Multi-tenant: lead creat în tenant A nu consumă RR-ul tenantului B.

## CRM-136 — Kanban density toggle {#crm-136}

- **T-CRM-136-1** `[blocant]` Given `useKanbanDensity` montat fără `localStorage`, Then returnează `'comfortable'` (default).
- **T-CRM-136-2** `[blocant]` Given `localStorage['crm_density'] = 'compact'`, When `useKanbanDensity` montat, Then returnează `'compact'`.
- **T-CRM-136-3** `[blocant]` Given `setDensity('compact')` apelat, Then `localStorage['crm_density']` este `'compact'` și state-ul e `'compact'`.
- **T-CRM-136-4** `[blocant]` Given `KanbanCard` cu `density='compact'`, Then render-ul conține clasă `py-1` și NU conține avatar element.
- **T-CRM-136-5** `[blocant]` Given `KanbanCard` cu `density='comfortable'`, Then render-ul conține avatar element.
- **T-CRM-136-6** `[blocant]` Given `DensityToggle` randat cu `density='compact'`, Then butonul compact are `aria-pressed='true'`.
- **T-CRM-136-7** Given `DensityToggle` cu `density='comfortable'`, When click pe butonul compact, Then `setDensity` e apelat cu `'compact'`.

---

## Scenarii transversale (rulate la fiecare item)

- **T-CRM-X-1** `[blocant]` Multi-tenant: un lead al tenantului A NU e vizibil/editabil din tenantul B.
- **T-CRM-X-2** `[blocant]` Toate paginile noi: 0 violări axe critical/serious.
- **T-CRM-X-3** Dark mode: toate componentele noi arată corect în light + dark.
- **T-CRM-X-4** Zero `any` în TS; props interfaces pentru fiecare componentă.
- **T-CRM-X-5** Niciun hex hardcodat în `.tsx` (doar tokens semantice).
