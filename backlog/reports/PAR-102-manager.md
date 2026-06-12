# PAR-102 Persona: Andreea Mitran (Manager)

**Verdict: BUY**

"Suma calculată automat — exact ce voiam. Înainte suma era scrisă de mână și mereu apăreau discrepanțe. Flagul 'above_micro_threshold' care apare când totalul depășește pragul e excelent — eu ca aprobar vreau să știu din prima că se aplică regula de 10% re-aprobare."

**What works:**
- Server-side computation of line_total_cents — requestors can't manipulate totals
- Auto-recalculation of par total on every line add/edit/delete
- above_micro_threshold flag surfaces the 10% overage rule prominently
- Position sequencing (item #1, #2, ...) matches the paper form exactly

**Friction noted:**
- Need to see the line items table in the UI with running total (PAR-105)
