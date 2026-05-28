---
id: F-CRM-CAPTURE-001
title: Capturare lead din toate sursele (form, ads, telefon, manual)
module: crm
status: specced
priority: P0
owner: backend-team
landing_demo: M1-003
---

# Goal

Centralizează toate intrările de leaduri (formular web, Facebook Lead Ads, Google Ads, apel telefonic, recomandare manuală) într-un singur lead-record cu atribuire corectă a sursei și consent GDPR documentat.

# Personas

- **Vizitator anonim**: completează formular pe site
- **Recepționer**: primește apel telefonic, deschide manual un lead
- **Manager**: vede pipeline-ul consolidat
- **Sistem-auto**: deduplicare, atribuire UTM, consent tracking

# Scenarii

## Scenariul 1 — Lead din formular web

- **Trigger**: vizitator completează `<form>` pe vectorlearn.io/cere-demo
- **Pași**:
  1. Frontend JS captează utm_source, utm_medium, utm_campaign, fbclid, gclid din URL (sau din cookie persistat 30 zile)
  2. POST către `/api/v1/leads/intake/webform` cu payload + utm + consent_text + consent_at
  3. Server validează că `consent_at` e maxim 5 min în trecut (anti-spoof)
  4. Caută duplicate prin (nume normalizat + telefon normalizat + email)
  5. Dacă match → `merge into existing lead, add interaction entry`
  6. Dacă nu → creează lead nou cu `stage = 'new'`
  7. Apoi: triggere automation (vezi `F-CRM-AUTOMATION-001`)
  8. Returnează `{ leadId, isDuplicate: false }`

## Scenariul 2 — Lead din Facebook Lead Ad

- **Trigger**: Meta webhook `lead_gen` cu form payload
- **Pași**:
  1. Verificare semnătură HMAC SHA256 (Meta's `X-Hub-Signature-256`)
  2. Fetch full form via Graph API (Lead Ads endpoint)
  3. Mapare câmpuri Meta → schema noastră (nume, telefon, email, „ce te interesează")
  4. Salvare consent original (Meta-managed) + URL formular
  5. Atribuire: `source = 'facebook_lead_ad'`, `campaign_id = meta_campaign_id`
  6. Creează lead + trigger automation

## Scenariul 3 — Lead din Google Ads (web-to-lead cu gclid)

- Similar Scenariul 1, dar bonus: `gclid` salvat în lead → la conversie (devine paying) trimitem Google Offline Conversion API ca să optimizeze bidding-ul

## Scenariul 4 — Lead manual de la apel telefonic

- **Trigger**: recepționer primește apel pe Asterisk
- **Pași**:
  1. Click-to-create în interfață: caută după număr telefon
  2. Dacă există lead → deschide-l
  3. Dacă nu → form rapid (nume, ce curs, sursa selectată din dropdown)
  4. Apelul se înregistrează (cu consent verbal explicit citit de recepționer)
  5. Recording link salvat în `lead_interactions`
  6. Transcripție async (Whisper API)
  7. Status apel marcat: interested / not_interested / wrong_number / no_answer

## Scenariul 5 — Recomandare (referral)

- **Trigger**: alt elev/părinte trimite link cu cod referral
- **Pași**:
  1. URL include `?ref=USER_TOKEN`
  2. Cookie 30 zile cu referral_user_id
  3. La conversie (lead → paying), bonus pentru referent (configurabil, ex: 50€ credit lecții)

## Scenariul 6 — Deduplicare

- **Trigger**: oricare din scenariile 1-5
- **Pași**:
  1. Normalizare telefon: strip non-digit, prefix +40, păstrare ultimele 9 cifre
  2. Normalizare email: lowercase, trim
  3. Normalizare nume: NFC unicode, lowercase, trim multiple spaces
  4. Match exact pe oricare din triplet
  5. Dacă match: `lead_interactions += new entry`, nu creează duplicate
  6. Manager poate face merge manual dacă apare false negative

# Data model

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  stage ENUM('new','contacted','trial','paid','lost'),
  full_name TEXT NOT NULL,
  phone TEXT NULL,
  phone_normalized TEXT NULL, -- pentru index/dedup
  email TEXT NULL,
  email_normalized TEXT NULL,
  interest_course TEXT NULL,
  source ENUM('webform','facebook_lead_ad','google_ads','manual_call','referral','import'),
  source_details JSONB, -- utm_*, campaign_id, gclid, fbclid, referrer_user_id
  consent_text TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  ip_at_consent INET NULL,
  user_agent_at_consent TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leads_dedup ON leads (tenant_id, phone_normalized, email_normalized);

CREATE TABLE lead_interactions (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  type ENUM('webform_submit','call','email_received','whatsapp','meeting','note'),
  direction ENUM('inbound','outbound'),
  payload JSONB, -- conținut (transcript, body, metadata)
  user_id UUID NULL, -- cine a făcut interacțiunea (NULL = auto)
  occurred_at TIMESTAMPTZ DEFAULT now()
);
```

# API surface

```
POST /api/v1/leads/intake/webform
Body: { full_name, phone, email, interest_course, utm: {...}, consent_at, consent_text }
Headers: X-Captcha-Token (Cloudflare Turnstile sau hCaptcha)
Response: { leadId, isDuplicate, interactionId }

POST /webhooks/meta/lead-ads
(verified HMAC)

POST /webhooks/google-ads/conversion-callback
(server-side conversion tracking)

POST /api/v1/leads/:id/interactions
Body: { type, direction, payload }
(used by recepționer pentru a loga apeluri/email/whatsapp manual)
```

# Acceptance criteria

- [ ] Lead din formular ajunge în DB în max 500ms (incl. captcha verify)
- [ ] Deduplicare lucrează corect pe variații de format telefon (cu/fără prefix, spații, dash)
- [ ] Facebook Lead Ads webhook validat cu HMAC
- [ ] UTM-uri persistă 30 zile în cookie, supraviețuiesc unei sesiuni reîncepute
- [ ] Consent text salvat versionat (dacă schimbi textul, vechi rămân cu vechiul)
- [ ] Anti-spam: rate limit 5 submits/IP/minut + captcha pe formular
- [ ] Apel telefonic creează interaction cu recording link în max 60 sec după închidere

# Edge cases

- Părinte tastează telefon greșit, apoi îl corectează → dedup-ul îi consideră 2 leads diferiți. Manager merge manual.
- GDPR consent revocat → mark lead `consent_revoked_at`, blochează toate outbound contact
- Facebook trimite același lead twice (network glitch) → idempotency key bazat pe `leadgen_id`
- Captcha fail → 400, dar nu spam logs (1 entry per IP/oră)
- Tenant suspendat (neplata abonament Vector Learn) → respinge intake cu 503

# Dependențe

- Captcha (Turnstile/hCaptcha)
- Meta Graph API + webhook
- Google Ads API
- Asterisk webhook on call-end
- Whisper API pentru transcript

# Risc & GDPR

- Consent log: text + timestamp + IP + UA, retenție 7 ani (cerință GDPR proof of consent)
- Dreptul la uitare: endpoint `DELETE /api/v1/leads/:id` care șterge complet + anonimizează interactions (păstrează doar event type + timestamp pentru analytics)
- Telefonul/email-ul nu sunt hash-uite în DB (cerință pentru contact funcțional), dar coloanele _normalized sunt indexate; nu se exportă în logs niciodată

# Out of scope

- AI-based lead scoring (preluează un alt feature)
- Multi-tenant cross-pollination prevention (asumat din arhitectura row-level security)
- Chatbot pre-form pentru calificare — `F-AI-QUALIFY-001`
