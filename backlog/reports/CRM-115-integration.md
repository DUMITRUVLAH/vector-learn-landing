# CRM-115 Integration Architecture Review

**Verdict: CONNECTED**

## Module connectivity

### Tags
- `lead_tags` table stores per-lead tags (normalized lowercase)
- `GET /api/leads/:id/tags` → `{ tags: string[] }`
- `TagsInline` component in LeadCardPage left column uses listTags/addTag/removeTag
- Idempotent insert: duplicate tag returns 200 without creating duplicate row

### Custom fields
- `custom_fields` defines tenant-level field schema (key, label, type, options)
- `lead_field_values` stores per-lead values (upsert pattern)
- `FieldsTab` in LeadCardPage renders fields dynamically; calls `upsertFieldValue` on change
- Settings route: `/api/settings/custom-fields` for tenant owners/managers

### Tenant safety
- All tag/field queries filtered by `tenantId`
- `getLeadForTenant()` helper verifies lead ownership before tag/field operations
- `DELETE /api/settings/custom-fields/:id` cascades to `lead_field_values`

## No gaps found.
