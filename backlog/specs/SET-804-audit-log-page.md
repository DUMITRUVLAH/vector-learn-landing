---
id: SET-804
title: Audit log settings page — filtre + export
milestone: SET
phase: "1"
branch: feat/SET-faza-1-settings
status: pending
attempts: 0
depends_on: [SET-801]
---

## Goal

Audit log-ul există la nivel de backend (HR-404 + CRM crm_audit_log). Acum adăugăm o
pagină de settings (`/app/settings/audit-log`) care agregă ambele surse, permite filtrarea
pe actor, tip acțiune, interval de date și exportul ca CSV pentru audit extern.

## User stories

- Ca Owner, vreau să văd cine a modificat ce date în ultimele 30 de zile, pentru că am un audit intern lunar.
- Ca Admin, vreau să filtrez log-ul după user, pentru că investighez un incident specific.
- Ca Contabil, vreau să export log-ul ca CSV, pentru că trebuie predat auditorului extern.
- Ca Owner, vreau să văd acțiunile ordonate descrescător după timp, pentru că cele recente sunt cel mai relevante.

## Acceptance criteria

1. **API `GET /api/settings/audit-log`** cu query params: `actorId, actionType, from, to, limit (max 200), offset`. Agregă din `audit_log` și `crm_audit_log`, returnează:
   ```json
   {
     "items": [{ "id", "actorName", "actionType", "targetType", "targetId", "createdAt", "source" }],
     "total": N
   }
   ```

2. **UI `/app/settings/audit-log`**:
   - Tabel cu coloane: Timp, Actor, Acțiune, Obiect, Sursă.
   - Filtre: date range picker, dropdown actor (lista echipei), search pe actionType.
   - Paginare (20/pagină).
   - Buton "Export CSV" pentru query curent.

3. **Securitate**: numai `admin`/`owner` (role check). Altfel → 403.

4. **Route** `/app/settings/audit-log` în App.tsx. Link în sidebar settings section.

## Files

### New
- `server/routes/auditLogSettings.ts` — GET aggregated
- `src/pages/app/settings/AuditLogPage.tsx` — UI
- `src/__tests__/settings/audit-log.test.tsx`

### Modified
- `server/app.ts` — mount auditLogSettings routes
- `src/App.tsx` — route
- `src/components/app/AppShell.tsx` — link

## Tests

- **T-SET-804-1** [blocant] GET /api/settings/audit-log returns 200 with items array and total.
- **T-SET-804-2** [blocant] AuditLogPage renders without crash.
- **T-SET-804-3** [blocant] GET /api/settings/audit-log with non-admin role returns 403.
- **T-SET-804-4** [normal] from/to date filters narrow the result set.
- **T-SET-804-5** [normal] Export CSV contains correct column headers.

## DoD

- [ ] No new migrations (reads existing audit_log + crm_audit_log tables)
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/SET-faza-1-settings`
