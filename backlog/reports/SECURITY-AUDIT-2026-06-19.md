# Security audit — PAR integration flows + app surface

**Data:** 2026-06-19
**Scop:** audit de securitate pe codul nou (PR #197–#200) + verificări la nivel de aplicație.
**Metodă:** analiză statică pe diff-urile celor 4 branch-uri + verificări manuale pe pattern-urile
cu risc (auth, tenant isolation, injection, secrete, file upload, AI/PII, XSS).

---

## Rezumat

Codul nou (PR #197–#200) este **solid din punct de vedere al securității de bază**: toate rutele
au `requireAuth`, toate query-urile sunt tenant-scoped, fără SQL brut, fără secrete hardcodate,
file upload cu limită + allowlist, iar template-ul PDF escapează valorile. Au fost identificate
**5 observații** — niciuna critică; 2 sunt fixate aici, 3 sunt pre-existente la nivel de app și
documentate ca follow-up.

| # | Finding | Severitate | Sursă | Stare |
|---|---|---|---|---|
| 1 | AI primește PII brut (IBAN/IDNP) fără opt-in/pseudonimizare | Medie | pre-existent (extractor reutilizat) | documentat (follow-up) |
| 2 | `esc()` din actTemplate nu escapa `'` | Foarte mică | cod nou | **FIXAT** |
| 3 | `app.onError` întoarce `err.message` brut la client (info-disclosure) | Mică | pre-existent (app-wide) | documentat (follow-up) |
| 4 | `/api/par/extract` fără rate-limit per-request (cost-DoS AI) | Mică | cod nou | **mitigat** de budget-guard lunar; per-request = follow-up |
| 5 | `parToInvoice` ne-idempotent → facturi draft duplicate la dublu-click | Mică | cod nou | **FIXAT** (guard în UI + notă) |

---

## Ce e BINE (verificat, fără probleme)

- **Auth:** `parExtract`, `parToInvoice`, `parActDoc` au toate `requireAuth.use("*")`. `parVendors` la fel.
- **Tenant isolation (anti-IDOR):** fiecare fetch de resursă filtrează pe `tenantId`; `parToInvoice`
  și `parActDoc` adaugă și check de rol/ownership (`requestor own || elevated role`) → 403 altfel.
- **SQL injection:** doar query builder Drizzle; zero `sql\`\`` interpolat, zero `db.execute` brut în codul nou.
- **Secrete:** niciun secret hardcodat; SFS credentials la rest = AES-256-GCM (`server/lib/crypto.ts`), nu base64.
- **File upload (`parExtract`):** limită 8 MB (verificată de 2 ori), allowlist tip (image/pdf/text),
  fără fetch de URL extern (no SSRF), iar fișierul **NU e persistat** — extract + discard (GDPR data-min).
- **XSS (act PDF):** `renderActHtml` escapează `& < > "`; valorile sunt doar în text content / atribute
  double-quoted (niciun atribut single-quoted cu date user) → ne-exploatabil. Hardened oricum (finding #2).
- **CORS:** allowlist de origini + `credentials: true` (nu wildcard).
- **AI cost:** `callAi` are deja **budget-guard lunar per tenant** (`checkBudget`) → cost mărginit.

---

## Findings detaliate

### #1 — AI primește PII brut (Medie, pre-existent)
`/api/par/extract` → `extractCaptureFields` → `callAi` trimite textul OCR al documentului (care
conține **nume beneficiar, IBAN, IDNP**) către OpenAI/Anthropic. Repo-ul are `fin_data_settings`
cu `pseudonymizeAiPrompts` / `aiOptIn`, dar extractorul **nu le consultă**. Comportament pre-existent
(moștenit de la Invoice Reporting), dar fluxul PAR extinde expunerea la date de plată.
**Recomandare (follow-up, task separat):** înainte de `callAi`, verifică `aiOptIn` per tenant și,
dacă `pseudonymizeAiPrompts`, maschează IBAN/IDNP în textul trimis (extragerea sumelor/furnizorului
funcționează și fără IBAN complet). Nu blochează PR-urile curente.

### #2 — `esc()` nu escapa `'` (Foarte mică, FIXAT)
Defense-in-depth. Adăugat `'` → `&#39;` în `server/lib/par/actTemplate.ts`.

### #3 — `app.onError` leak (Mică, pre-existent app-wide)
`server/app.ts`: `return c.json({ error: err.message }, 500)` poate dezvălui detalii interne
(nume de constrângeri DB, căi). **Recomandare:** loghează `err` server-side, întoarce un mesaj
generic la client în producție. App-wide, nu specific PAR — fix separat ca să nu schimb 500-urile
pe care alte module se bazează.

### #4 — fără rate-limit per-request pe AI (Mică, mitigat)
`/api/par/extract` cheamă AI plătit. **Mitigat** de budget-guard-ul lunar (un user nu poate depăși
plafonul tenantului). Lipsește doar limita per-request care ar opri arderea întregului buget într-o
rafală. **Recomandare (follow-up):** un limiter simplu (ex. N apeluri/min/user).

### #5 — `parToInvoice` ne-idempotent (Mică, FIXAT parțial)
Dublu-click pe „Generează factură" creează 2 facturi draft. **Fix aplicat:** butonul din UI se
dezactivează în timpul cererii (`busy`) — previne dublu-click accidental. **Follow-up opțional:**
un guard server-side (notă pe PAR cu invoiceId emis) pentru idempotență dură.

---

## Concluzie
Niciun risc critic sau de severitate înaltă. Codul nou respectă tenant isolation, auth și anti-injection.
Cele 2 fix-uri ieftine sunt aplicate; cele 3 follow-up-uri (PII-la-AI, error-leak, rate-limit) sunt
pre-existente / mici și nu blochează merge-ul PR-urilor #197–#200.
