# CRM — Documentația CORE a modulului

> **Acesta este documentul „cap-coadă" al modulului CRM.** Tot ce ține de leaduri,
> pipeline, cartonaș client, capturare și conversie este descris aici, în detaliu,
> click cu click. Nicio decizie de comportament nu trăiește doar în cod — trăiește aici.
>
> Când lucrezi (manual sau autopilot), **acesta este sursa de adevăr**. Specurile din
> `backlog/specs/CRM-*.md` sunt unitățile buildabile; ele referă secțiunile de aici.
>
> Status implementare azi: MVP-009 livrat (kanban de bază + create + convert + note).
> Restul fazelor sunt în `BUILD-SEQUENCE.md`.

---

## 1. Ce este (și ce nu este) acest CRM

**Context**: Vector Learn este un CRM pentru centre educaționale (limbi, programare, muzică,
dans, sport, pregătire examene, copii). Spre deosebire de un CRM B2B clasic (Salesforce,
HubSpot), aici „clientul" are două fețe:

- **Lead** = persoană interesată care **încă nu plătește** (părinte care a sunat, vizitator
  care a completat formularul, contact de la Facebook Ads).
- **Student/Client** = lead convertit care **plătește și frecventează** cursuri. Trăiește în
  modulul **Elevi** (`/app/students`), nu în CRM. CRM-ul îl „naște" prin conversie.

Particularitatea educațională: **plătitorul ≠ beneficiarul**. Mama (Cristina) plătește, copilul
(Maria) face cursul. CRM-ul trebuie să modeleze această relație **familie** (un plătitor, mai
mulți elevi).

**Obiectivul modulului**: să nu se piardă niciun lead, să se răspundă în secunde, și să se vadă
clar *de unde vin banii* (atribuire sursă → campanie → conversie → ROAS).

---

## 2. Inventar complet de funcționalități (research)

Benchmark față de Pipedrive / HubSpot / Close + nevoile specifice educației. Fiecare rând are
un ID de user-story (vezi `backlog/user-stories/crm.md`) și o fază de build (vezi
`BUILD-SEQUENCE.md`).

### 2.1 Capturare lead (intake) — „de unde intră"
| Funcție | US | Fază |
|---|---|---|
| Formular web public (no-auth) cu UTM + consent GDPR | US-CRM-04, 07 | A |
| Adăugare manuală (recepționer la telefon) — quick create | US-CRM-02 | A |
| Facebook Lead Ads (webhook HMAC) | US-CRM-07 | A |
| Google Ads (gclid → offline conversion) | US-CRM-07, 20 | A |
| Import CSV (migrare din Excel/alt CRM) | — | A |
| Recomandare / referral (cod `?ref=`) | US-CRM-19 | E |
| Deduplicare automată (telefon/email normalizate) | US-CRM-05 | A |

### 2.2 Pipeline — „unde se află acum"
| Funcție | US | Fază |
|---|---|---|
| Kanban drag-drop între stadii | US-CRM-01 | B (livrat MVP-009) |
| Stadii personalizabile (owner adaugă „Așteaptă răspuns părinte") | US-CRM-17 | B |
| Motiv pierdere obligatoriu la „Pierdut" | US-CRM-18 | B |
| Reasignare lead la alt vânzător | US-CRM-16 | E |
| Lead score (hot/warm/cold) | US-CRM-15 | E |

### 2.3 Cartonaș lead/client — „tot despre persoană"
| Funcție | US | Fază |
|---|---|---|
| Pagină detaliu `/app/leads/:id` (nu doar modal) | US-CRM-06 | B |
| Timeline interacțiuni (apel, email, WhatsApp, notă, schimbare stadiu) | US-CRM-06 | B |
| Editare inline câmpuri (telefon, curs, sursă, assigned_to) | — | B |
| Task-uri / remindere per lead | US-CRM-09 | B |
| Atașamente (CI părinte, contract scanat) | — | B |
| Bloc consent GDPR (text + dată + revocare) | US-CRM-04 | A |
| Legătură familie (plătitor ↔ elevi) | US-CRM-03 | E |

### 2.4 Comunicare — „cum vorbim cu el"
| Funcție | US | Fază |
|---|---|---|
| Bibliotecă template-uri (welcome, trial confirm, no-show) cu variabile | US-CRM-13 | C |
| Trimitere email/WhatsApp/SMS din cartonaș + log automat | US-CRM-08 | C |
| Logare apel + outcome (interested/no-answer/wrong-number) | US-CRM-14 | C |
| Înregistrare apel + transcript (placeholder integrare) | US-CRM-14 | C |

### 2.5 Automatizare — „ce se întâmplă singur"
| Funcție | US | Fază |
|---|---|---|
| Motor trigger → condiție → acțiune (DSL + UI noduri) | US-CRM-08 | D |
| „Lead nou Facebook → SMS welcome instant" | US-CRM-08 | D |
| „Necontactat în 3 zile → reminder WhatsApp" (time-based) | US-CRM-09 | D |
| Test mode pe lead fictiv + audit log execuții | US-CRM-08 | D |

### 2.6 Conversie & analytics — „banii"
| Funcție | US | Fază |
|---|---|---|
| Convert lead → student (+ legătură familie) | US-CRM-03 | E (parțial livrat) |
| Self-service trial booking (link JWT) | US-CRM-12 | E |
| Conversion funnel report (new→contacted→trial→paid) | US-CRM-10 | E |
| Lost reason analytics (pie chart) | US-CRM-18 | E |
| ROAS per campanie (cost-per-paying-student) | US-CRM-11 | E |
| Reactivare leaduri pierdute > 6 luni | US-CRM-19 | E |
| Atribuire multi-touch (first/last/linear) | US-CRM-20 | E |

---

## 3. Model de date

Tabele existente (din MVP-009): `leads`, `lead_interactions`. Tabele noi adăugate pe parcursul
fazelor sunt marcate `[NOU – Fază X]`.

```
leads
  id, tenant_id
  full_name, phone, phone_normalized, email, email_normalized
  interest_course
  stage            -- FK logic spre pipeline_stages.key (default: new|contacted|trial|paid|lost)
  source           -- webform|manual|facebook_ad|google_ads|referral|phone_in|instagram|import|other
  utm_source, utm_medium, utm_campaign, fbclid, gclid, referrer_user_id
  consent_text, consent_at, ip_at_consent, user_agent_at_consent, consent_revoked_at  [Fază A]
  notes
  assigned_to       -- user_id vânzător responsabil           [NOU – Fază B]
  score             -- 0..100, derivat                         [NOU – Fază E]
  lost_reason
  converted_to_student_id, converted_at
  created_at, updated_at

lead_interactions
  id, tenant_id, lead_id
  type        -- note|call|email|whatsapp|sms|meeting|stage_change|system
  direction   -- inbound|outbound|internal
  body
  metadata     -- JSONB: outcome apel, template_id, recording_url, durata  [NOU – Fază C]
  user_id      -- cine (NULL = automatizare/sistem)
  occurred_at

lead_tasks                                                     [NOU – Fază B]
  id, tenant_id, lead_id, title, due_at, status(open|done|snoozed),
  assigned_to, created_by, completed_at, created_at

lead_attachments                                               [NOU – Fază B]
  id, tenant_id, lead_id, file_name, file_url, mime, size_bytes, uploaded_by, created_at

pipeline_stages                                                [NOU – Fază B]
  id, tenant_id, key, label, color, order_index, is_won, is_lost, is_default

message_templates                                              [NOU – Fază C]
  id, tenant_id, name, channel(email|whatsapp|sms), subject, body, variables[], created_at

automations                                                    [NOU – Fază D]
  id, tenant_id, name, enabled,
  trigger        -- JSONB: { event: 'lead.created'|'lead.stage_changed'|'time.no_contact', params }
  conditions     -- JSONB array: [{ field, op, value }]
  actions        -- JSONB array: [{ type: 'send_template'|'create_task'|'assign'|'move_stage', params }]
  created_at

automation_runs                                                [NOU – Fază D]
  id, tenant_id, automation_id, lead_id, status(ok|failed|skipped), detail, ran_at

families                                                       [NOU – Fază E]
  id, tenant_id, payer_name, payer_phone, payer_email
  -- students.family_id FK; un lead convertit creează/atașează la o familie
```

---

## 4. Ciclul de viață al unui lead (state machine)

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                                                         │
  [intake] ──►  NEW  ──►  CONTACTED  ──►  TRIAL  ──►  PAID (=convertit student)
                 │           │             │
                 └───────────┴─────────────┴────────►  LOST  (lost_reason obligatoriu)
                                                         │
                                          (reactivare > 6 luni) ──► NEW
```

**Reguli de tranziție:**
- Orice → orice este permis prin drag (vânzătorii sar pași real). Nu blocăm tranziții „înapoi".
- → `LOST` cere `lost_reason` (modal, nu se poate sări). Vezi §7 click-map.
- → `PAID` declanșează **fluxul de conversie** (creează student). NU se poate ajunge la PAID
  fără a trece prin conversie; mutarea cardului pe coloana „Client/PAID" deschide modalul de
  conversie (nu doar schimbă stage-ul).
- `consent_revoked_at` setat ⇒ toate acțiunile outbound (email/SMS/WhatsApp/automatizări) sunt
  blocate; cardul afișează badge roșu „Consimțământ retras".

---

## 5. Kanban board — layout & comportament

### 5.1 Layout (desktop ≥ lg: 5 coloane; mobil: 2 coloane, scroll)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CRM — Leads                          [ 42 leaduri · conversie 24% ]  [+ Adaugă]│
│  ───────────────────────────────────────────────────────────────────────────  │
│  [ Toate sursele ▾ ] [ Responsabil ▾ ] [ 🔍 caută nume/telefon ]  [⚙ Stadii]   │
│                                                                                │
│ ┌─ Lead nou ─8─┐ ┌Contactat 12┐ ┌Trial/Demo 9┐ ┌─ Client 14 ─┐ ┌Pierdut 6┐    │
│ │ (pastel sky) │ │(lavender)  │ │ (peach)    │ │ (mint)      │ │ (rose)  │    │
│ │ ┌──────────┐ │ │┌─────────┐ │ │┌─────────┐ │ │┌──────────┐ │ │┌───────┐│    │
│ │ │CARD lead │ │ ││CARD     │ │ ││CARD     │ │ ││CARD ✓conv│ │ ││CARD   ││    │
│ │ └──────────┘ │ │└─────────┘ │ │└─────────┘ │ │└──────────┘ │ │└───────┘│    │
│ │ ┌──────────┐ │ │┌─────────┐ │ │            │ │             │ │         │    │
│ │ │CARD lead │ │ ││CARD     │ │ │ Trage aici │ │             │ │         │    │
│ │ └──────────┘ │ │└─────────┘ │ │            │ │             │ │         │    │
│ └──────────────┘ └────────────┘ └────────────┘ └─────────────┘ └─────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Header: total leaduri + rată de conversie (paid / total). Buton **+ Adaugă** (dreapta sus).
- Bara de filtre `[Fază B]`: sursă, responsabil (assigned_to), search live, **⚙ Stadii**
  (deschide editor de stadii personalizate).
- Fiecare coloană = un `pipeline_stage`. Antet pastelat cu label + count. Culoarea vine din
  `pipeline_stages.color` (tokens pastel: sky/lavender/peach/mint/rose).
- Coloană goală → placeholder „Trage aici" (dashed).
- Drag over o coloană → ring primary + fundal primary/10.

### 5.2 Anatomia cardului din kanban (compact)

```
┌─────────────────────────────┐
│ Maria Popescu               │ ← full_name (bold, truncate)
│ Engleză B2 · copii          │ ← interest_course (muted, truncate)
│ 🔴 hot          [Andrei M.] │ ← score badge + assigned_to avatar [Fază E]
│ Facebook            📞 ✉    │ ← source label + iconițe telefon/email prezente
│ ⏰ Sună azi 14:00           │ ← următorul task scadent [Fază B]
│ ✓ Convertit                 │ ← apare doar dacă converted_to_student_id
└─────────────────────────────┘
```

### 5.3 Comportament drag-drop
- Card `draggable`. La `dragStart` → `draggedId` setat, card devine `opacity-50`.
- La `drop` pe coloană: dacă `stage` diferit → `PATCH /api/leads/:id/stage`.
  - destinație `lost` → întâi prompt/modal motiv pierdere (vezi §7).
  - destinație `paid` → deschide modal conversie (vezi §6.7), NU schimbă direct.
- Optimist UI + toast succes/eroare. La eroare → revert.
- Mutarea creează automat un `lead_interaction type=stage_change` (audit în timeline).

---

## 6. Cartonaș lead/client (detaliu) — anatomie & click-map

Ruta dedicată: **`/app/leads/:id`** `[Fază B]` (azi e doar modal; migrăm la pagină + păstrăm
quick-view modal din kanban). Layout 2 coloane pe desktop.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Înapoi la pipeline        Maria Popescu            [Editează] [⋯ Acțiuni] │
│ ─────────────────────────────────────────────────────────────────────────  │
│ COL STÂNGA (sticky)               │  COL DREAPTA (tab-uri)                   │
│ ┌───────────────────────────────┐ │  [Activitate] [Task-uri] [Fișiere] [GDPR]│
│ │ Stadiu:  ● Trial/Demo  ▾      │ │  ┌─────────────────────────────────────┐ │
│ │ Scor:    🔴 hot (82)          │ │  │ + Notă  ☎ Apel  ✉ Email  💬 WhatsApp│ │
│ │ Responsabil: Andrei M. ▾      │ │  ├─────────────────────────────────────┤ │
│ ├───────────────────────────────┤ │  │ ⏱ 14:32  ☎ Apel ieșit (2m) — outcome│ │
│ │ 📞 +40 7xx — [Sună] [WhatsApp]│ │  │         „interesată, vrea sâmbăta"  │ │
│ │ ✉  maria@…   — [Email]        │ │  │ ⏱ 11:02  ✉ Email „Confirmare trial" │ │
│ │ 🎯 Curs: Engleză B2           │ │  │ ⏱ ieri   ↪ Mutat în Trial          │ │
│ │ 🌐 Sursă: Facebook · Spring26 │ │  │ ⏱ acum 3z 📝 Notă: „vrea online"    │ │
│ │ 📅 Creat: 12 mai 2026         │ │  └─────────────────────────────────────┘ │
│ ├───────────────────────────────┤ │                                          │
│ │ [✅ Convertește în student]   │ │                                          │
│ │ [✗ Marchează pierdut]         │ │                                          │
│ └───────────────────────────────┘ │                                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Click-map al cartonașului — CE SE ÎNTÂMPLĂ când apeși

| Element apăsat | Acțiune declanșată | Endpoint / efect |
|---|---|---|
| **← Înapoi** | navighează la `/app/leads` (kanban) | client-side route |
| **Editează** | comută câmpurile din col. stângă în mod editabil (inline) | — |
| Salvează (după editare) | salvează câmpurile modificate | `PATCH /api/leads/:id` |
| **⋯ Acțiuni** | meniu: Reasignează, Duplică, Merge cu alt lead, Șterge (GDPR) | vezi rânduri ↓ |
| **Stadiu ▾** | dropdown schimbă stage fără drag; `lost`→cere motiv, `paid`→modal conversie | `PATCH /api/leads/:id/stage` |
| **Responsabil ▾** | reasignează leadul; notifică noul responsabil | `PATCH /api/leads/:id` (assigned_to) `[Fază E]` |
| **[Sună]** | `tel:` link + deschide modal „Logare apel" la închidere | creează `interaction type=call` `[Fază C]` |
| **[WhatsApp]** | deschide WhatsApp cu template selectabil | `interaction type=whatsapp outbound` `[Fază C]` |
| **[Email]** | deschide compose cu template + variabile completate | `interaction type=email outbound` `[Fază C]` |
| **+ Notă** | input notă internă → salvează în timeline | `POST /api/leads/:id/interactions {type:note}` |
| **☎ Apel** (tab) | modal logare apel: outcome + durată + notă | `POST …/interactions {type:call, metadata}` `[Fază C]` |
| **Tab Activitate** | timeline cronologic invers al tuturor interacțiunilor | `GET /api/leads/:id/interactions` |
| **Tab Task-uri** | listă task-uri + „+ Adaugă task" (titlu, scadență, responsabil) | `[Fază B]` `lead_tasks` |
| Bifează task | marchează `done`, scrie interaction `system` | `PATCH /api/lead-tasks/:id` |
| **Tab Fișiere** | upload/listă atașamente | `[Fază B]` `lead_attachments` |
| **Tab GDPR** | text consent + dată + IP + buton „Retrage consimțământ" | `[Fază A]` setează `consent_revoked_at` |
| **✅ Convertește în student** | modal conversie (vezi §6.7) | `POST /api/leads/:id/convert` |
| **✗ Marchează pierdut** | modal motiv pierdere (categorii + custom) | `PATCH …/stage {stage:lost, lostReason}` |
| **⋯ → Merge** | caută alt lead, combină interacțiuni, păstrează unul | `POST /api/leads/:id/merge` `[Fază B]` |
| **⋯ → Șterge (GDPR)** | confirm dublu → șterge PII, anonimizează interactions | `DELETE /api/leads/:id` `[Fază A]` |

### 6.7 Flux conversie lead → student (modal)
1. Click **Convertește în student** → modal.
2. Modal pre-completează: nume, telefon, email din lead.
3. Câmpuri suplimentare educație: **plătitor** (părinte: nume/telefon/email), **data nașterii
   elev**, **status** (active/trial). `[Fază E: families]`
4. Confirmă → `POST /api/leads/:id/convert`:
   - creează rând în `students` (status active);
   - creează/atașează `families` (plătitor) + `students.family_id`;
   - setează `leads.stage=paid`, `converted_to_student_id`, `converted_at`;
   - scrie interaction `system` „Convertit în student";
   - dacă `gclid` prezent → trimite Google Offline Conversion `[Fază E]`.
5. Toast + cardul în kanban primește badge „✓ Convertit". Idempotent: a doua conversie → eroare
   `already_converted`.

---

## 7. Harta completă „când apăs X se întâmplă Y" (toate intrările)

Tabel de referință rapidă pentru orice element interactiv din modul. Acoperă pipeline + card +
adăugare. (Comportamentele detaliate sunt în §5, §6, §8.)

| # | Unde | Acțiune utilizator | Rezultat exact |
|---|---|---|---|
| 1 | Header kanban | click **+ Adaugă** | deschide modal „Adaugă lead nou" (§8.2) |
| 2 | Modal add | submit cu nume valid | `POST /api/leads`, dedup check, card apare în col. NEW, toast |
| 3 | Modal add | submit fără nume | validare HTML5 blochează, focus pe câmp |
| 4 | Modal add | dedup găsește potrivire | banner „Există deja: <nume> – Deschide / Creează oricum" |
| 5 | Kanban card | click (fără drag) | deschide cartonaș (modal quick-view sau `/app/leads/:id`) |
| 6 | Kanban card | drag în altă coloană | `PATCH stage`, interaction stage_change, toast |
| 7 | Kanban card | drop în „Pierdut" | modal motiv → apoi PATCH; fără motiv → anulează mutarea |
| 8 | Kanban card | drop în „Client" | deschide modal conversie; anulat → cardul rămâne unde era |
| 9 | Filtru sursă | selectează „Facebook" | refiltrează coloanele client-side fără refetch |
| 10 | Search | tastează „07xx" | filtrează live pe nume+telefon normalizat |
| 11 | ⚙ Stadii | adaugă stadiu nou | `POST /api/pipeline-stages`, coloană nouă apare `[Fază B]` |
| 12 | Card detail | toate cele din §6.1 | vezi §6.1 |
| 13 | Tab Task | scadență trecută | task afișat roșu „Întârziat"; apare ⏰ pe cardul kanban |
| 14 | Automatizări | lead nou Facebook | rulează automation, trimite template, scrie automation_run `[Fază D]` |
| 15 | Public form | submit de pe site | `POST /api/leads/intake` (no-auth), captcha, UTM, consent `[Fază A]` |

---

## 8. Fluxuri „cum adaug un client" (toate sursele, pas cu pas)

### 8.1 Cele 6 porți de intrare
Toate creează un `lead` (sau îl îmbogățesc dacă e duplicat). Niciuna nu creează direct un
`student` — studentul apare doar prin conversie (§6.7).

### 8.2 Manual — recepționer la telefon `[livrat MVP-009, extins Fază A]`
1. Click **+ Adaugă** → modal.
2. Completează: nume* (min 2), telefon, email, curs de interes, **sursă** (dropdown), note.
   `[Fază A: + assigned_to, + consent dacă persoană fizică contactată]`
3. La blur pe telefon/email → check dedup live (afișează „există deja" dacă match).
4. Submit → `POST /api/leads` → card în coloana NEW → toast „Lead adăugat".

### 8.3 Formular web public `[Fază A]`
1. Vizitator pe `vectorlearn.io/cere-demo` completează formularul.
2. JS captează `utm_*`, `fbclid`, `gclid` din URL (sau cookie 30 zile).
3. Checkbox consent GDPR obligatoriu (text versionat).
4. `POST /api/leads/intake` (no-auth) + captcha (Turnstile) + `tenant_slug`.
5. Server: validează captcha + consent_at recent, normalizează, dedup, creează/îmbogățește lead
   cu `source=webform`, salvează consent (text+timestamp+IP+UA).
6. Răspuns `{leadId, isDuplicate}`. Leadul apare instant în kanban-ul centrului.

### 8.4 Facebook Lead Ads `[Fază A]`
1. Meta trimite webhook `lead_gen`.
2. Verificare semnătură HMAC SHA256 (`X-Hub-Signature-256`).
3. Fetch formular complet via Graph API, mapare câmpuri → schema.
4. `source=facebook_ad`, `utm_campaign=meta_campaign_id`, consent Meta-managed.
5. Idempotent pe `leadgen_id` (Meta poate dubla). Creează lead + rulează automatizări (Fază D).

### 8.5 Google Ads `[Fază A]`
- Ca 8.3, dar salvează `gclid`. La conversie → Google Offline Conversion API (Fază E).

### 8.6 Import CSV `[Fază A]`
1. `/app/leads` → ⋯ → Import. Upload CSV.
2. Mapare coloane (nume/telefon/email/curs/sursă) → preview primele 5 rânduri.
3. Validare + dedup pe tot fișierul → raport „X create, Y duplicate, Z erori".
4. `source=import`. Tranzacțional (totul sau nimic pe erori critice).

### 8.7 Referral `[Fază E]`
- Link `?ref=USER_TOKEN` → cookie 30 zile → `source=referral`, `referrer_user_id`. La conversie,
  bonus configurabil pentru cel care a recomandat.

### 8.8 Deduplicare (toate porțile) `[Fază A]`
- Normalizare telefon: strip non-cifre, prefix +40, ultimele 9 cifre.
- Normalizare email: lowercase+trim. Nume: NFC, lowercase, trim spații multiple.
- Match exact pe oricare din triplet → adaugă interaction la leadul existent, NU duplică.
- False negative (telefon greșit corectat) → manager face **merge manual** (§6.1 ⋯→Merge).

---

## 9. Permisiuni & roluri

| Rol | Vede | Poate |
|---|---|---|
| **Owner** | tot tenantul | tot + config stadii + automatizări + ștergere GDPR |
| **Manager** | tot tenantul | tot pipeline, reasignare, convert, rapoarte |
| **Vânzător** | leadurile lui (assigned_to) + nealocate | create, edit, mutare stadiu, convert, log |
| **Recepționer** | toate (read) | create lead, log apel, adaugă notă |
| **Profesor** | — (nu vede CRM) | — |

Multi-tenant: fiecare query e `tenant_id`-scoped (row-level). Niciodată cross-tenant.

---

## 10. GDPR & consent (obligatoriu, nu opțional)

- Consent log: `text + timestamp + IP + UA`, retenție 7 ani (dovada consimțământului).
- Dreptul la uitare: `DELETE /api/leads/:id` șterge PII + anonimizează interacțiunile (păstrează
  doar `type+timestamp` pentru statistici).
- `consent_revoked_at` blochează tot outbound-ul (manual + automat).
- Telefon/email NU se loghează niciodată în log-uri text; coloanele `_normalized` sunt doar
  pentru index/dedup.

---

*Acest document este CORE. Orice spec `CRM-*` trebuie să fie consistent cu el. Dacă un spec
contrazice acest document, documentul câștigă — actualizează-l explicit, nu deriva în tăcere.*
