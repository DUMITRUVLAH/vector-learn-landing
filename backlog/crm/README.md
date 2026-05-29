# CRM — Modulul CORE al Vector Learn

> **CRM-ul este inima produsului.** Centrele educaționale cumpără Vector Learn în primul rând ca
> să nu piardă leaduri și să vadă de unde vin banii. Toate celelalte module (orar, finanțe,
> comunicare) gravitează în jurul fluxului lead → student → plătitor.
>
> Această mapă conține documentația completă, „cap-coadă", a modulului și planul de construcție
> pas-cu-pas pe care autopilot îl urmează.

## Fișiere

| Fișier | Ce conține | Pentru cine |
|---|---|---|
| [`CRM-CORE.md`](CRM-CORE.md) | **Sursa de adevăr.** Research/inventar funcții, model de date, ciclul de viață al leadului, layout kanban (ASCII), anatomia cartonașului, harta „ce se întâmplă când apăs X", toate fluxurile de adăugare client, permisiuni, GDPR. | Toți — citește înainte de orice |
| [`BUILD-SEQUENCE.md`](BUILD-SEQUENCE.md) | **Șoferul autopilotului.** Cele 12 item-uri `CRM-101..112` grupate în 5 faze, ordinea, dependențele, definiția de „done". | Orchestrator, la fiecare run |
| [`TEST-SCENARIOS.md`](TEST-SCENARIOS.md) | **Gate-ul dur.** Scenarii Given/When/Then per item. Teste roșii = item neterminat. | Builder + test-runner |

## Cum se folosește la „run" (autopilot)

1. Orchestrator citește `BUILD-SEQUENCE.md`, ia **primul** item CRM pending din STATE.json.
2. Builder citește specul item-ului (`backlog/specs/CRM-xxx.md`) + secțiunile CORE referite.
3. Builder implementează **doar scope-ul acelui item**. Feature-urile descoperite dar neacoperite
   se notează în „Backlog descoperit" din BUILD-SEQUENCE — **nu se pierd, nu umflă PR-ul**.
4. Test-runner rulează scenariile `TEST-SCENARIOS.md#crm-xxx`.
   **Dacă un scenariu `[blocant]` pică → se repară pe loc → re-rulează.** Nu se trece mai departe.
5. Reviewer + persona + PR. STATE.json/BACKLOG.md actualizate. → linie `[ITEM]` → următorul item.

## De ce „pas-cu-pas / grupat" (regula anti-pierdere)

Modulul are 12 item-uri și zeci de comportamente. Construite la grămadă într-un singur PR uriaș,
se pierd detalii (un click neimplementat, un edge-case GDPR uitat). De aceea:
- **un item = un PR**, niciodată comasat;
- **un comportament din CORE neacoperit** se notează, nu se uită;
- **testele item-ului trebuie verzi** înainte de următorul — vezi CLAUDE.md §0.2.

## Status azi

- Livrat: **MVP-009** (kanban de bază, create lead, convert, note) — vezi
  [`src/pages/app/LeadsPage.tsx`](../../src/pages/app/LeadsPage.tsx) și
  [`src/lib/api/leads.ts`](../../src/lib/api/leads.ts).
- Pending: `CRM-101 … CRM-112` (vezi BUILD-SEQUENCE).
