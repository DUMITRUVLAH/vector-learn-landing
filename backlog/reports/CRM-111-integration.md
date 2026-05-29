# CRM-111 Integration Architect Review

**Date**: 2026-05-29  
**Verdict**: APPROVED  

## Key integration: lead → student → family data flow

### DB FK chain
- families.tenant_id → tenants.id (CASCADE) ✓
- students.family_id → families.id (SET NULL — orphan safe) ✓
- leads.converted_to_student_id → students.id (SET NULL) ✓

### convert endpoint (POST /api/leads/:id/convert)
1. Validates lead exists + tenant ownership
2. Checks `lead.convertedToStudentId` → 409 if already converted (idempotent)
3. If payerName provided: INSERT families → get familyId
4. INSERT students with tenantId, familyId, lead fields + overrides
5. UPDATE leads: stage=paid, convertedToStudentId, convertedAt
6. INSERT leadInteractions type=system with student+family IDs

### score endpoint (POST /api/leads/:id/score)
- Pure calculation from lead fields (source, stage, completeness)
- Saves to leads.score, returns badge: hot/warm/cold

### assign endpoint (POST /api/leads/:id/assign)
- Updates leads.assignedTo
- Creates system interaction for audit

### Tenant safety
- All endpoints: eq(leads.tenantId, tenantId)
- families INSERT: uses tenantId from user session
- students INSERT: uses tenantId from user session
- Cannot create family for another tenant's lead

### ConvertModal (UI)
- Pre-fills from lead (fullName, phone, email)
- Payer section toggleable (only creates family if payerName filled)
- Sends full payload to API; errors shown in modal
- On success: triggers fetchAll to refresh lead state

### already_converted protection (T-CRM-111-3)
- Server-side check: `if (lead.convertedToStudentId)` → 409
- ConvertModal shows "Lead-ul a fost deja convertit" message
- No duplicate student created

## Verdict: APPROVED
All integration points verified. Plătitor↔elevi model correctly implemented.
