# CRM e2e — 1181 scenarii

Rulat: 2026-09-26T11:00:31.903Z · țintă http://localhost:3150 · 0.7s · **1179 trec, 2 pică**

| Grup | Trec | Pică |
|---|---:|---:|
| matrix:anon | 152 | 0 |
| matrix:catalog | 1 | 0 |
| matrix:corp-stricat | 498 | 0 |
| matrix:id-inexistent | 118 | 0 |
| matrix:id-invalid | 177 | 0 |
| matrix:izolare | 90 | 2 |
| matrix:rol-agent | 48 | 0 |
| matrix:valori-ostile | 95 | 0 |

## Ce pică

- **[matrix:izolare]** clientul B nu citește prin query · GET /api/crm/audit?leadId=:lead — lista conține rânduri ale clientului A
- **[matrix:izolare]** clientul B nu citește prin query · GET /api/crm/leads?companyId=:company — lista conține rânduri ale clientului A
