# PAR-101 Persona: Andreea Mitran (Manager)

**Verdict: BUY**

"Tocmai am văzut că sistemul generează automat PAR-2026-0001, PAR-2026-0002 — exact ce avem nevoie pentru contabilitate. Nu mai e nevoie să ținem minte ce număr am ajuns. Faptul că un draft poate fi salvat și continuat later e perfect — uneori completez cererea în mai mulți pași când aștept confirmarea bugetului."

**What works:**
- Sequential request numbering per tenant per year (PAR-2026-NNNN) — critical for audit trail
- Draft lifecycle allows partial completion across sessions
- Role-based visibility: requestors see only their own PARs, approvers/finance see all
- PATCH locked to draft/changes_requested — prevents accidental edits after submission

**Friction noted:**
- Would be nice to have a "continue draft" shortcut from the dashboard (UI — PAR-105)
- Budget code note field is useful for the "according to monthly budget planning" case
