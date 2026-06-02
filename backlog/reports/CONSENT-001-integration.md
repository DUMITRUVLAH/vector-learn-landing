# CONSENT-001 — Raport Integration Architect

**Data:** 2026-06-01
**Verdict: CONNECTED**

---

## FK-uri și dependențe

| Tabel | FK | Referință | On Delete |
|---|---|---|---|
| consent_templates | tenant_id | tenants.id | CASCADE |
| consent_requests | tenant_id | tenants.id | CASCADE |
| consent_requests | template_id | consent_templates.id | CASCADE |
| consent_requests | student_id | students.id | CASCADE |
| consent_requests | guardian_id | student_guardians.id | CASCADE |

Toate FK-urile sunt verificate. Student_guardians (GUARDIAN-001) conectat corect.

## Tenant safety

- Fiecare query filtrează pe `user.tenantId` din contextul de auth.
- POST /requests verifică că templateId și studentId aparțin aceluiași tenant.
- guardianIds validați că sunt tutori ai elevului respectiv (nu ai altui elev).

## Rute înregistrate

- `consentRoutes` montat la `/api/school/consent` în `server/app.ts`.
- Ruta `/app/school/consent` în `src/app.tsx` → `<SchoolConsentPage />`.
- Link în AppShell nav sub secțiunea Școală.

## Constraint anti-duplicat

`UNIQUE (template_id, student_id, guardian_id)` previne crearea de cereri duplicate la DB level.
Verificat și la nivel de aplicație (skip logic în POST /requests).

## Limita API

`limit(100)` pe listTemplates și listRequests — conform regulii ≤ 100.

## DB portability

Toate query-urile folosesc Drizzle ORM query builder. Niciun `db.execute().rows` raw.
Pattern `Array.isArray(rows) ? rows : rows.rows ?? rows` aplicat pe toți `.returning()`.

## Migration

`0036_consent001_forms.sql` — prefix 0036 > max 0035. Journal actualizat cu idx=36.
`db:reset && db:seed` — PASS verificat.
