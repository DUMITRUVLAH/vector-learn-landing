# CRM — Secvența de build (driver pas-cu-pas)

> **Acesta este șoferul autopilotului pentru modulul CRM.** Când dai „run", construiești
> **un singur item CRM-xxx odată**, în ordinea de mai jos. NU sări peste, NU comasa mai multe
> item-uri într-un PR, NU trece mai departe cu teste roșii.
>
> Regula de aur (vezi și CLAUDE.md §0.2): **build → rulează testele item-ului (din
> `TEST-SCENARIOS.md`) → dacă pică, REPARĂ pe loc → abia apoi treci la următorul.** Un item cu
> teste roșii nu se închide și nu se trece mai departe. Asta evită pierderea de feature-uri și
> detalii când lucrezi automat.

---

## Cum se citește acest fișier (pentru orchestrator)

1. Item-urile sunt grupate în **5 faze (A→E)**. Fazele se fac în ordine.
2. În interiorul unei faze, item-urile se fac în ordinea numerică.
3. Fiecare item are: spec dedicat (`backlog/specs/CRM-xxx.md`), secțiuni CORE de referință,
   scenarii de test (`TEST-SCENARIOS.md#crm-xxx`) și dependențe.
4. Un item e `done` DOAR dacă: cod livrat + toate scenariile lui de test trec + reviewer APPROVED
   + build/typecheck/lint/test verzi. Altfel → `blocked` cu raport, dar **înainte de a bloca,
   încearcă un fix** (politica „repară, nu sări").
5. Între item-uri emite o singură linie: `[ITEM] CRM-xxx done → PR #N · next: CRM-yyy`.

**Anti-pierdere de feature-uri:** dacă în timpul build-ului unui item descoperi un comportament
din CORE care nu e acoperit de specul curent, **NU îl implementa pe furiș și NU îl uita** —
notează-l ca rând nou în secțiunea „Backlog descoperit" de la finalul acestui fișier și continuă
doar scope-ul item-ului. Așa nimic nu se pierde și nimic nu umflă PR-ul curent.

---

## Faza A — Capturare & Intake (de unde intră leadurile)

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `CRM-101` | Formular web public `/api/leads/intake` + UTM + captcha + consent GDPR | [CRM-101](../specs/CRM-101-intake-web.md) | §8.3, §10 | MVP-009 |
| `CRM-102` | Deduplicare robustă (normalizare telefon/email/nume) + merge manual | [CRM-102](../specs/CRM-102-dedup-merge.md) | §8.8, §6.1 | CRM-101 |
| `CRM-103` | Adăugare manuală extinsă (assigned_to, consent, dedup live la blur) + Import CSV | [CRM-103](../specs/CRM-103-manual-import.md) | §8.2, §8.6 | CRM-102 |
| `CRM-104` | Webhook Facebook Lead Ads (HMAC, idempotent) + gclid Google Ads | [CRM-104](../specs/CRM-104-ads-webhooks.md) | §8.4, §8.5 | CRM-101 |

## Faza B — Pipeline & Cartonaș (unde se află & tot despre el)

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `CRM-105` | Stadii personalizabile + motiv pierdere obligatoriu + filtre (sursă/responsabil/search) | [CRM-105](../specs/CRM-105-pipeline.md) | §5, §4 | — |
| `CRM-106` | Cartonaș detaliu `/app/leads/:id` (tab-uri, editare inline, timeline complet) | [CRM-106](../specs/CRM-106-lead-card.md) | §6 | CRM-105 |
| `CRM-107` | Task-uri & remindere per lead (+ badge ⏰ pe card) + atașamente | [CRM-107](../specs/CRM-107-tasks-files.md) | §6.1, §2.3 | CRM-106 |

## Faza C — Comunicare (cum vorbim cu el)

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `CRM-108` | Bibliotecă template-uri (email/WhatsApp/SMS) cu variabile + preview | [CRM-108](../specs/CRM-108-templates.md) | §2.4 | CRM-106 |
| `CRM-109` | Trimitere din cartonaș (email/WhatsApp/SMS) + logare apel cu outcome | [CRM-109](../specs/CRM-109-comms.md) | §6.1 | CRM-108 |

## Faza D — Automatizare (ce se întâmplă singur)

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `CRM-110` | Motor automatizări (trigger→condiție→acțiune) + test mode + audit | [CRM-110](../specs/CRM-110-automation.md) | §2.5 | CRM-109 |

## Faza E — Conversie & Analytics (banii)

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `CRM-111` | Conversie → student cu legătură familie (plătitor↔elevi) + reasignare + scor | [CRM-111](../specs/CRM-111-convert-family.md) | §6.7, §2.2 | CRM-106 |
| `CRM-112` | Rapoarte: funnel conversie + lost-reason + ROAS per campanie | [CRM-112](../specs/CRM-112-analytics.md) | §2.6 | CRM-111 |

---

## Diagrama dependențelor

```
MVP-009 (done) ──► CRM-101 ──► CRM-102 ──► CRM-103
                      └──────► CRM-104
                   CRM-105 ──► CRM-106 ──► CRM-107
                                  ├──────► CRM-108 ──► CRM-109 ──► CRM-110
                                  └──────► CRM-111 ──► CRM-112
```

Ordinea liniară recomandată pentru autopilot:
`CRM-101 → 102 → 103 → 104 → 105 → 106 → 107 → 108 → 109 → 110 → 111 → 112`

---

## Definiția de „done" per item (checklist obligatoriu)

- [ ] Tot scope-ul din spec implementat (nimic din „in scope" lăsat pe dinafară)
- [ ] **Toate** scenariile din `TEST-SCENARIOS.md#crm-xxx` trec (gate dur — vezi regula de aur)
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` — verzi
- [ ] Consistent cu `CRM-CORE.md` (dacă diferă, ai actualizat CORE explicit)
- [ ] Reviewer agent APPROVED; persona reports salvate
- [ ] PR deschis cu corp structurat; STATE.json + BACKLOG.md actualizate de orchestrator

---

## Backlog descoperit (feature-uri găsite în timpul build-ului, de nu pierdut)

> Adaugă aici orice comportament din CORE neacoperit de un spec, descoperit în timpul lucrului.
> Format: `- [CRM-CORE §X.Y] descriere scurtă → propus item CRM-NNN`. Apoi cineva îl promovează
> în secvență. Nu îl implementa în PR-ul curent.

_(gol la momentul scrierii — secvența acoperă tot inventarul din CORE §2)_
