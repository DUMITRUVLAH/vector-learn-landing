# ApprovalMax — cont trial live, flow-uri testate

Data: 2026-08-29. Cont trial 14 zile creat cu `vlahdumitru@vectoracademy.ro` (parolă în
`TRIAL-ACCOUNT-CREDENTIALS.local.md`, negitat). Toate screenshot-urile în
`screenshots/app-demo/*.png` (77 fișiere, negitat), text extras în `pages/app-demo/*.md`
(50 fișiere, comise în git).

Organizația din cont: "Unnamed Organization", fără Xero/QBO/NetSuite conectat (am ales
"Skip for now" în loc de a crea o organizație demo în Xero — ar fi cerut un cont Xero separat).

## Flow-uri parcurse, în ordine

1. **Signup** (`01`–`06`) — `/register` → email → link de confirmare pe email (NU cod OTP) →
   `/profileSetup/email`. Validare live pe parolă (4 criterii afișate) și telefon obligatoriu.
2. **Onboarding 3 pași** (`07`–`15`) — Step 1: nume+telefon+parolă+ce software contabil vrei să
   conectezi+câte companii. Step 2: conectează Xero/QBO/NetSuite REAL, sau organizație demo Xero
   (cere cont Xero separat), sau "Skip for now (very limited trial)" — am ales skip.
3. **Getting Started dashboard** (`15`) — checklist ghidat în 7 pași (invite teammates → setup
   workflow → create request → make a decision → connect accounting → mobile app → plan).
4. **Sidebar / secțiuni explorate** (`20`–`29`) — Workflows and settings, All requests, My decision
   required, On hold, Reports, Users, New request (blocat inițial: "you haven't been added as a
   Requester to any approval workflow"), user menu (DV), notificări, org switcher.
5. **Stand-alone workflow — construit de la zero** (`30`–`36`) — cel mai relevant flow pentru PAR:
   - Create → doar nume ("PAR Test Workflow")
   - Builder vizual: pași drag-through (Creation → Approval step → + Step), fiecare pas are
     Requesters/Approvers, condiție de aprobare (All/Any), SLA ("Not set")
   - Approval matrix (grid icon) — matrice condiționată pe câmpuri (Amount, Requester, + custom
     field) per aprobator, exact modelul "cine aprobă CE condiție"
   - Workflow settings (gear) — mesaj custom pentru requesteri + politică "o aprobare multi-pas
     se aplică la toți pașii deodată SAU doar la pasul curent" (per-workflow, nu global)
   - Meniul "..." — Discard changes / Delete / **Copy workflow** (duplicare rapidă = pattern bun
     pentru template-uri PAR)
   - Activate → confirmare modală "All done!"
6. **Ciclul complet al unei cereri** (`37`–`44`) — cel mai valoros set de screenshot-uri:
   - New request → alegere workflow → formular (subiect, sumă, monedă, dată, notă pt aprobatori,
     descriere OBLIGATORIE, upload fișiere) — validare live pe câmpuri lipsă
   - Submit → pagină de detaliu cerere: status ACTIVE pe pas, butoane Approve/Reject direct acolo
     (fără navigare separată), Audit trail cu timestamp exact
   - Approve → status APPROVED, audit trail actualizat cu "Approved request in step X. All
     approvals collected and request is closed." — exact mecanismul de audit descris pe site
7. **Reports** (`46`) — gol chiar și după o cerere aprobată; e un *report builder* ("+ New Report"),
   nu un dashboard auto-populat. Nu am construit un raport încă.
8. **Users** (`25`, `73`) — tabel cu Name/Email/Role/Status/2FA/Substitute/Start-End date — coloana
   "Substitute" confirmă vizual feature-ul de pe site (aprobator de rezervă când cineva lipsește).
   "Add or Invite Users" (`73`) — wizard 2 pași: paste email-uri (virgulă/punct-virgulă/spațiu) →
   Next (probabil alegere rol pe pasul 2 — nu am mers mai departe ca să nu trimit invitații reale
   la adrese inexistente).

## Rail-ul din stânga, mapat complet (12 iconițe, click-testate una câte una)

Iconițele **globale** (vizibile în orice organizație, deasupra separatorului):
1. Organizations dashboard — listă organizații, status abonament, "Trial expires on Sep 12, 2026",
   status "Reconnect" (roșu, pt că nu am conectat Xero), buton "Organization settings" per rând
2. Requires my approval (all orgs) — agregat cross-organizație
3. Created by me (all orgs)
4. Drafts (all orgs)

Iconițele **per-organizație** (sub separator, se schimbă cu org-ul activ):
5. Getting started
6. All requests
7. Requires my approval (this org)
8. On hold
9. Shortcut dinamic per-workflow ("PAR Test Workflow › All") — apare DOAR după ce ai creat un
   workflow; icoana e un checkmark, nu exista înainte de pasul 5 din tur
10. Reports (report builder, gol până construiești un raport explicit)
11. Workflows and settings (gear) — hub-ul pentru Approval workflows + Users + (probabil)
    Security/2FA, deși n-am ajuns la un tab explicit "Security" în timpul turului

## Workflow builder — funcții testate în profunzime (`51`–`58`)

- **Al doilea pas de aprobare** (`57`) — "+ Step" adaugă un pas nou secvențial, complet independent
  (aprobator implicit = userul curent, trebuie reconfigurat). Lanțul devine Creation → Approval
  step 1 → Approval step 2 → (+ Step din nou). Fără limită vizibilă de pași.
- **Deadline / SLA per pas** (`53`) — 3 opțiuni: Not set / Based on submission / Based on approval
  (deadline-ul pornește fie la trimiterea cererii, fie când cererea intră în acel pas — nu global,
  per pas individual).
- **Add a Requester** (`54`) — modal simplu: email → "Add a new user" (dacă nu există deja în org).
  Nu am trimis invitație reală.
- **Approval matrix → custom field** (`55`, `56`) — "Add a field" deschide un input liber
  ("Name a field"); am scris "Project code" și a apărut opțiunea `Add "Project code"` — deci
  câmpurile custom din matricea de condiții NU sunt predefinite de ApprovalMax, le inventezi tu pe
  loc, per workflow. Foarte relevant pentru PAR: condițiile de rutare pot fi orice atribut custom
  al cererii, nu doar sumă/departament hardcodate.

## Ciclul complet al unei cereri — inclusiv REJECT și COMENTARII (`60`–`72`, `80`)

- **Reject ≠ terminal** (`62`–`66`) — descoperire importantă: butonul "Reject" deschide un modal
  titrat **"Reason to put the request on hold"** (comentariu obligatoriu) → cererea intră în status
  **ON HOLD**, nu REJECTED. Butoanele Approve/Reject devin gri și blocate ("NOTE: This request is
  on hold. Click 'Unlock' to continue."). Motivul apare în audit trail ca "Has put request on hold
  with the following comment: ...". Nu există, în acest flux, o respingere ireversibilă instant —
  e un hold reversibil, auditat. Pattern demn de furat pentru PAR: evită respingeri accidentale
  definitive, păstrează urmă a motivului.
- **Comentarii** (`71`–`72`) — "Leave a comment" e tot un rich-text (`[contenteditable]`, nu
  `<input>`), intră direct în același flux cronologic ca audit trail-ul (submisie → aprobare →
  comentariu, toate cu timestamp și avatar) — nu e o secțiune separată de "chat".
- **Audit Report** (`80`) — pe o cerere APROBATĂ, butoanele Approve/Reject sunt înlocuite cu un
  singur buton "Audit Report" (declanșează probabil un download PDF direct, nu o pagină — nu am
  văzut o pagină nouă, consistent cu un `<a download>` sau fetch-blob).

## Notificări și abonament (`74`, `81`)

- **Notificări** (`74`) — panou lateral din dreapta (nu dropdown), 1 notificare: "License
  Notification — trialul pentru 'Unnamed Organization' expiră în 14 zile", cu butoane "Contact
  sales" / "Buy now" chiar în notificare — monetizare împinsă activ din prima zi de trial.
- **Buy now** (`81`) — te scoate din `app.approvalmax.com` pe `account.approvalmax.com` (aplicație
  SEPARATĂ pentru billing/cont), primul pas fiind alegere țară (pre-completată "Moldova" din
  geolocalizare) înainte de a ajunge la planuri/preț. Nu am mers mai departe (nu intru în checkout
  real fără motiv).

## Observații utile pentru PAR (dincolo de ce era deja în REPORT.md)

- **Formularul de cerere are exact 2 câmpuri rich-text** (Notă pt aprobatori + Descriere), separate
  clar: nota e opțională/conversațională, descrierea e obligatorie și structurală. PAR ar putea
  adopta aceeași separare (comentariu liber vs. motiv structurat, obligatoriu).
- **Politica "toate pașii deodată vs. doar pasul curent"** e per-workflow, configurabilă din
  Workflow settings — nu presupune un singur comportament global. Merită verificat dacă PAR are
  echivalent când un aprobator are acces la mai multe etape.
- **"Copy workflow"** din meniul "..." — duplicare 1-click a unui workflow existent ca punct de
  plecare pentru unul nou. Simplu de implementat, mare economie de timp la configurare (multe
  proiecte PAR seamănă structural).
- **Blocajul "New request" până nu ești Requester pe niciun workflow** e un mesaj de eroare bine
  țintit (spune exact ce lipsește + link direct spre pagina de fix), nu doar un buton dezactivat.
- **Reports e explicit un builder, nu un dashboard automat** — merită clarificat dacă PAR vrea
  rapoarte pre-construite (mai rapid de folosit) sau un builder (mai flexibil, dar cere setup).
- **"Reject" ca hold reversibil, nu respingere terminală** — cea mai transferabilă descoperire din
  turul profund. Reduce riscul de erori umane ireversibile și tot generează urmă de audit. PAR ar
  putea adopta același model: respingerea cere motiv, pune cererea pe pauză, dar un admin poate
  debloca fără să piardă istoricul.
- **Câmpurile custom din matricea de aprobare sunt complet libere** (nu dintr-o listă predefinită)
  — orice atribut al cererii poate deveni condiție de rutare. Dacă PAR are condiții hardcodate
  (doar sumă/departament), asta e un gap direct de flexibilitate față de ApprovalMax.
- **Monetizarea e împinsă din prima notificare din trial**, nu doar pe pagina de pricing — "Buy
  now" apare direct în panoul de notificări din ziua 1. Semnal de urgență comercială constantă,
  nu doar la expirare.

Nu am făcut nicio modificare de cod pe baza acestei sesiuni — cont de test, screenshot-uri, atât.
