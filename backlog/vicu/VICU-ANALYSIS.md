# VICU — Analiza afacerii + definiția produsului finit

> Ce face owner-ul, unde se pierde valoare, ce livrează Vicu măsurabil, și ce înseamnă
> „produs gata" (v1.0). Se citește ÎNAINTEA build-ului. 2026-07-17.

---

## 1. Ce face Vector Academy (fluxul valorii, cap-coadă)

Vector Academy = business de **cursuri și traininguri AI** (Moldova/România, în română) +
un **produs SaaS în dezvoltare (platformă pentru HR)**. Echipa: Dumitru (owner) + marketing
manager + product manager (platforma HR) + sales manager + designer + video creator.

**Fluxurile de venit:**
- **B2C cohorte**: cursuri AI pe ediții (cohortă cu dată de start, participanți, buget/costuri
  per ediție — `course_edition_*` în crm-vector).
- **B2B corporate**: traininguri AI pentru companii (oferte generate, outreach pe lead-uri
  scrape-uite, emailuri comerciale — infrastructura există în agenții/skill-urile repo-ului).
- **(în construcție) SaaS HR**: platforma condusă de product manager.

**Lanțul operațional (fiecare verigă are date în crm-vector):**

```
STRATEGIE (strategy_kpis + taskuri legate)
   ↓
MARKETING: campanii Meta Ads (marketing_costs via Windsor) + content
  (video/LinkedIn/Telegram — video creator + designer)
   ↓
LEAD-URI: lead-intake → leads/pipelines (fost Kommo, acum CRM propriu)
   ↓
VÂNZARE: sales manager, cadences, lead_tasks → sales (amount, course_name, utm_campaign)
   ↓
LIVRARE: ediție de curs → checklist obligatoriu (promovare→onboarding→feedback→diplome),
  lecții pe Zoom (zoom_recordings/attendance), TaskBoard pentru execuție
   ↓
POST-LIVRARE: feedback_forms/responses → diplome (issued_certificates) → upsell/repeat
   ↓
MANAGEMENT: ședințe de echipă (azi: se vorbește mult, se execută puțin),
  planificare în TaskBoard, KPI în Strategy
```

## 2. Unde se pierde valoare azi (durerile, mapate pe flux)

| # | Veriga | Pierderea | Dovada/simptomul |
|---|--------|-----------|------------------|
| P1 | Management | **Owner-ul nu deleagă** — ține taskuri care puteau merge la echipă; el e gâtul de sticlă | declarat direct; nimeni nu propune sistematic „dă asta lui X" |
| P2 | Execuție | Taskuri neasignate / termene mutate repetat fără motiv; nimeni nu întreabă | TaskBoard-ul are datele, nu are enforcement |
| P3 | Ședințe | Deciziile din ședințe nu devin taskuri; nimeni nu verifică după | „vorbim mult și nu se întâmplă nimic" |
| P4 | Strategie→Execuție | Nimeni nu verifică zilnic dacă taskurile active servesc KPI-urile | strategy_kpi_tasks există de 3 zile, nefolosit sistematic |
| P5 | Marketing↔Vânzări | Campaniile și vânzările analizate separat; deciziile scale/cut întârzie | Roas.tsx există, dar nimeni nu-l împinge zilnic cu verdict |
| P6 | Livrare | Checklist-ul obligatoriu per ediție depinde de memoria umană | risc: onboarding/feedback/diplome sărite la vreo ediție |
| P7 | Eficiență | Munca repetitivă (montaj, raportări, publicări) nu e observată → nu se automatizează | nimeni nu are jobul ăsta |

## 3. Ce livrează Vicu, măsurabil (obiectivul per durere)

Vicu = **stratul de management** peste lanțul de la §1: nu execută munca, garantează că munca
se vede, se leagă de strategie și se termină.

| Durere | Capabilitatea Vicu | Metrica de succes (după 4 săpt. de la v1.0) |
|--------|--------------------|----------------------------------------------|
| P1 | Antrenorul de delegare (VICU-705) | % taskuri deținute de owner ↓ vizibil lună/lună (trend în self-report) |
| P2 | Igiena: digest done-first + motiv obligatoriu + întrebarea blândă (F1) | 0 taskuri neasignate > 24h; 100% mutări de termen cu motiv logat |
| P3 | Ședințe: transcript → taskuri confirmate → follow-up forțat (F5) | ≥ 80% din taskurile confirmate în ședință există în TaskBoard la T+48h |
| P4 | Aliniere KPI zilnică (F2) | 100% taskuri active ori legate de un KPI, ori marcate explicit „fără scop" |
| P5 | Verdicte ads cu consiliu + alerte anomalie (F3) | fiecare campanie activă are verdict săptămânal cu cifre; anomaliile semnalate < 24h |
| P6 | Mandatory-check per ediție (F4) | 0 ediții pornite fără checklist generat și asignat |
| P7 | Detector repetitive (F6) | ≥ 1 propunere de automatizare validă/lună |
| — | Adopția (condiția tuturor) | rata de răspuns a echipei la ping-urile lui Vicu ≥ 50% |

**Anti-metrici (Vicu a eșuat dacă):** echipa mută conversațiile în afara Telegram ca să scape
de el · owner-ul primește > 3 mesaje/zi în afara briefingurilor · > 20% alerte false pe ads.

## 4. Definiția „PRODUS GATA" (v1.0 — launch checklist)

v1.0 = **toate valurile W0–W6 mergiuite + aplicate live** (W7/învățarea poate veni în v1.1,
cu excepția VICU-601 captarea feedbackului, care e în W1.5). Concret, produsul e gata când:

- [ ] Toate migrările din LOVABLE-DEPLOY.md bifate `[x] Aplicat` (verificat live REST 200)
- [ ] Botul răspunde în grup + 1:1; toți cei 6 membri linked (`telegram_links`)
- [ ] Briefingul de dimineață a rulat 5 zile consecutive fără intervenție manuală
- [ ] O mutare de termen fără motiv e IMPOSIBILĂ (UI + API), verificat pe live
- [ ] O ședință reală: audio → transcript RO validat de owner → ≥ 1 task confirmat în
      TaskBoard cu citat-sursă → follow-up T+48h primit în grup
- [ ] Un verdict de campanie cu cifre reale primit de marketing manager
- [ ] Raportul de conformitate al unei ediții reale de curs (verde/roșu per pas)
- [ ] O propunere de delegare reală acceptată de owner și reasignată de Vicu
- [ ] `/feedback` funcționează și feedbackul apare în CRM
- [ ] Self-report-ul lui Vicu (duminică) include costul LLM al săptămânii
- [ ] Kill-switch testat: `vicu_settings.paused=true` → Vicu tace complet în < 1 min

**v1.1 (după 2-3 săpt. de date):** VICU-602 auto-revizuire prompt · VICU-603 detector
repetitive · rafinarea pragurilor din practica reală.

## 5. Ordinea de citire pentru autopilot

1. [`VICU-BUILD-PLAN.md`](VICU-BUILD-PLAN.md) — regulile de infrastructură + **bugetul 35%/zi** + runbook
2. [`VICU-BUILD-SEQUENCE.md`](VICU-BUILD-SEQUENCE.md) — driverul: schema DB, contracte, item cu item
3. [`VICU-TEST-SCENARIOS.md`](VICU-TEST-SCENARIOS.md) — gate-ul dur per val
4. [`VICU-CORE.md`](VICU-CORE.md) + [`VICU-BACKLOG.md`](VICU-BACKLOG.md) — comportamentul + AC per item
