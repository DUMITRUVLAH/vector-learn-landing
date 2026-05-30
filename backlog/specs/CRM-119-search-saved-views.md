---
id: CRM-119
title: Căutare globală ⌘K + salvare vizualizări filtrate
milestone: CRM
phase: G
priority: P1
core_ref: [CRM-CORE.md §5.1]
tests: TEST-SCENARIOS.md#crm-119
depends_on: [CRM-117]
status: pending
---

# CRM-119 — Căutare globală + vizualizări salvate

## Goal
La telefon cu clientul în linie, trebuie să găsești leadul în 2 secunde. Și să revii la
„Leadurile mele fierbinți" cu un click, nu re-filtrând de fiecare dată.

## In scope
- **Palette ⌘K / Ctrl+K** (și buton 🔍 pe mobil): caută live lead după nume, telefon normalizat,
  email, companie. Rezultate cu stadiu + responsabil; Enter → deschide cartonașul.
  `GET /api/leads/search?q=` (limit 10, tenant-scoped, debounced).
- **Vizualizări salvate**: salvează combinația curentă de filtre (sursă/responsabil/search/stadiu)
  sub un nume. Listate într-un dropdown „Vizualizări". Tabel `lead_views`
  (`id, tenant_id, user_id, name, filters JSONB, is_shared, created_at`).
- Vizualizări implicite preîncărcate (read-only): „Leadurile mele", „Necontactate azi",
  „Fără responsabil", „Fierbinți (score≥70)".

## Out of scope
- Căutare full-text în note/interacțiuni (doar câmpurile de identificare).

## Acceptance criteria
- [ ] ⌘K deschide palette; caută pe nume/telefon/email/companie; tastatură navigabilă
- [ ] Salvare/încărcare/ștergere vizualizare; persistă în DB; tenant + user scoped
- [ ] 4 vizualizări implicite funcționale
- [ ] Migrare `lead_views` generată + commisă (§3.5.1)
- [ ] `GET /api/leads/search` nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-119`. Blocante verzi.

## DoD
Standard.
