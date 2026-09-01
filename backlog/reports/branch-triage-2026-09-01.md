# Ce nu era în producție, pe 1 septembrie 2026 — și ce s-a întâmplat cu fiecare

Cerință owner: „push tot ce nu este în FinFlow în producție".

Punctul de plecare: **≈250 de ramuri locale, 40 de PR-uri deschise**. Nu se merge-uiesc în bloc —
exact asta a produs căderea de 2 iunie 2026 (§3.5.1ter). Fiecare ramură a fost verificată: ce
conține, dacă a ajuns deja pe `main` pe altă cale, dacă mai are sens azi.

## Livrat în producție azi

| Ce | De unde | Verificat pe prod |
|----|---------|-------------------|
| Pagini publice de feature (aprobări multi-nivel, AI care citește documentul) | `feat/platform-impersonation` (6 commit-uri noi din 23) | ✅ ambele randează pe www.finflow.best |
| SEO + GEO: `robots.txt`, `sitemap.xml`, `llms.txt`, canonical, date structurate | idem | ✅ toate trei răspund 200 |
| Contul de plată cu vânzătorul în antet se autocompletează | `fix/PAR-prefill-cont-de-plata` | ✅ (server pornește, e2e verde) |
| Pagina de detaliu spune DE CE nu se poate trimite cererea | `fix/par-submit-validation-reasons` (PR #300) | ✅ |
| Spațiu de nume `shell.*` în dicționarele i18n | `feat/i18n-ro-en` | ✅ |
| **Securitate:** registrul fiscal răspunde doar despre organizația din sesiune | valoarea din `fix/security-batch-1`, rescrisă pe main | ✅ `?tenantId=` străin nu mai întoarce nimic |
| **Securitate:** erorile 500 nu mai trimit clientului mesajul intern | idem | ✅ |
| Lecția de împachetare exceljs (documentație) | `fix/STMT-007-bundle-exceljs` | — |

## Deja în producție (ramura era doar o copie mai veche)

`fix/email-finflow-logo` (main are lockup-ul FinFlow în emailuri), `fix/PAR-qa-blind-150` și
`feat/platform-console-faza-2` (9 din 12 commit-uri deja pe main; celelalte 3 — buton roșu de
anulare, reîncărcarea filei cu bundle vechi, montarea `finOrgRoutes` — există deja în cod),
`fix/par-cancel-red`, `fix/par-ai-prefill-ron-currency` (RON scos deja, VM1-03),
`feat/PAR-faza-conectare-invite-validare-shell` (PR #203 — `parInvites` + legarea la `par_members`
sunt pe main), `feat/VIOLETA-faza-evenimente-foldere` (diferă doar `backlog/STATE.json`).

## NU se livrează, cu motiv

| Ramuri | De ce |
|--------|-------|
| `feat/TB-faza-1…6` (PR #256–261) | TaskBoard a fost mutat de owner în **crm-vector**; nu e produsul ăsta. |
| `feat/CRM-1xx`, `M1/M2/M3`, `MVP-*`, `HR-*`, `SCHED-*`, `COMM-*`, `REP-*`, `GAP-*`, `WAVE2-*` | Era CRM-ului educațional, 800–900 commit-uri în urmă; produsul s-a separat. |
| `feat/FIN-*`, `feat/ITPARK-*`, `feat/SPLIT-*` (iunie) | Fazele FinDesk/ITPark sunt live; ramurile sunt schelele lor, 450 de commit-uri în urmă. |
| PR #197–#202 (PAR→act, PAR→factură, autocomplete din document, registru unificat) | Refăcute între timp: `parAiPrefill`, `/api/docs/from-par`, `parEfactura`, registrul de furnizori. |
| `perf/scaling-hot-path` | Atinge `server/db/client.ts` (configurația de pool). Un pool prost configurat a blocat deja prod-ul o dată; se reface deliberat, nu se merge-uiește dintr-o ramură de acum 280 de commit-uri. |
| `feat/cont-plata-pdf` | PDF prin html2canvas — adică poză. Avem de ieri generator vectorial (DC-102); se reface cu el. |
| `demo/*`, `preview/*`, `pr213/214/215`, `main-verify` | Asamblări de demo și ramuri de verificare, nu cod de producție. |

## Muncă nesalvată în alte worktree-uri (nu e a acestei sesiuni)

- `/Users/dima/vector-learn-landing` (`feat/platform-impersonation`): modificările vizuale la
  inbox/coadă erau **deja pe main**; singura diferență rămasă era ștergerea insignelor „urgent" și
  „datat în urmă" din rând — refuzată intenționat, aprobatorul trebuie să le vadă înainte de semnătură.
- `/Users/dima/vl-i18n` (`feat/i18n-ro-en`): 26 de fișiere convertite la chei `t(...)`, dar
  dicționarele nu au încă acele chei — **1698 de erori de tip**. Nelivrabil până nu se scrie și
  jumătatea de dicționar; sesiunea care lucrează acolo trebuie s-o termine.

## Ce am învățat azi (a costat un deploy picat)

Un `cherry-pick` dintr-o ramură veche poate **dubla** cod fără conflict; serverul n-a mai pornit,
deși build-ul frontend și testele erau verzi. Poarta `check-undefined-refs` gatează acum și pe
redeclarări (TS2451/TS2393). Detalii: `docs/solutions/build-errors/cherry-pick-duplicated-block-server-would-not-boot.md`.
