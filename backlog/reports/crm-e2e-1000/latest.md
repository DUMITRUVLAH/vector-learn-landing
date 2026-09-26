# CRM e2e — 1181 scenarii

Rulat: 2026-09-26T11:00:43.145Z · țintă http://localhost:3150 · 0.7s · **1180 trec, 1 pică**

| Grup | Trec | Pică |
|---|---:|---:|
| matrix:anon | 152 | 0 |
| matrix:catalog | 1 | 0 |
| matrix:corp-stricat | 498 | 0 |
| matrix:id-inexistent | 118 | 0 |
| matrix:id-invalid | 177 | 0 |
| matrix:izolare | 91 | 1 |
| matrix:rol-agent | 48 | 0 |
| matrix:valori-ostile | 95 | 0 |

## Ce pică

- **[matrix:izolare]** clientul B nu citește prin query · GET /api/crm/reports/funnel?pipelineId=:pipeline — răspunsul conține id-ul pipeline al clientului A
