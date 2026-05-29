# REP-304 Integration Report

## Verdict: CONNECTED

- export/payments reads payments + students tables, tenant-scoped, CSV output
- export/students reads students table, tenant-scoped
- Content-Type text/csv with attachment filename
- ExportPage calls fetch with credentials for session auth
