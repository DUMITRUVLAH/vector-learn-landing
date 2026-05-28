# M1-008 Multi-filiale — Andreea Mitran (director rețea, 6 filiale Lingua School)

**Verdict: MAYBE**

Streak anterioară: MAYBE → BUY ×4 → MAYBE → BUY → BUY. Nu îmi place că rup ritmul, dar pagina asta vorbește exact despre durerea mea zilnică și tocmai de aia o citesc cu lupa. Promite mult, arată curat, dar zonele care mă bagă în insomnie (legal entity, royalty, transfer, scaling) sunt tratate la nivel de bullet de marketing, nu de produs.

## Ce merge

- **Harta + switcher-ul**: gestul corect. Click pe pin → KPI-uri se schimbă instant. Asta e fix interacțiunea pe care o vreau dimineața cu cafeaua: „cum stă Cluj-ul azi?". Aggregation (1.400 elevi, 89 profesori, 4.65/5) e exact formatul pe care îl raportez la board.
- **Pricing books separate per filială** (FAQ #2): „Engleză B2 — 280€ București / 220€ Cluj" — ăsta e detaliul care îmi spune că ați înțeles că rețeaua mea NU e copy-paste. Bravo.
- **Transfer elev atomic** (FAQ #3): „mută istoricul, plățile rămase, accesul la app — toate atomic" + ajustare automată royalty. Dacă chiar funcționează tranzacțional, e singurul motiv pentru care semnez.
- **Branding per filială** cu subdomeniu `cluj.lingua.ro` — corect, nu e doar logo-swap.
- **Row-level security + audit log cross-tenant** — limbaj de adult, nu „permisiuni".

## Ce mă oprește din BUY

1. **Legal entity-per-franciză = zero menționat.** Eu am 6 SRL-uri distincte, fiecare cu CUI, cont bancar, contabil propriu. „Multi-currency Enterprise" e altceva. Vreau să văd: cum mapați un SRL la o filială? Facturare emisă din ce entitate? e-Factura ANAF per CUI? Fără asta, „contracte franciză" e doar un PDF.
2. **Royalty calculation transparency = black box.** „Royalty fix sau % din venit, calculat lunar" — OK, dar: pe ce bază (venit brut? net după reduceri? după refund?), cu ce cutoff date, cu ce formulă vede francizatul, cu ce drept de contestare? Eu am pierdut 2 francizați în 2024 fix pentru că nu puteau valida calculul. Vreau un breakdown vizibil pe pagină, măcar un screenshot al rapotului lunar.
3. **Transfer profesor între filiale = absent.** Aveți transfer elev, dar profesorul care predă 2 zile la București + 1 zi la Ploiești? Cum se împarte salariul, contractul, ore în payroll, cota de royalty? Asta îmi mănâncă 4 ore pe lună acum în Excel.
4. **Dashboard consolidat = promis, nu arătat.** „Heatmap profitabilitate", „Top 5 LTV", „comparație inter-filială" — toate bullets, niciun mockup. La M1-006 (Rapoarte) arătați UI; aici nu. De ce?
5. **Scaling 4 → 50 filiale**: harta cu 4 pin-uri e drăguță, dar la 50 devine spaghetti. Există view de listă/tabel sortabil? Bulk operations (ex: actualizez pricing la 12 filiale simultan)? Onboarding-ul „5 minute per filială" × 50 = 4 ore + 0 garanție că datele istorice se importă corect.
6. **„Manager filială: acces limitat"** — dar managerul rețelei vede ce face managerul filialei în timp real? Audit pe acțiuni, nu doar pe date?

## Ce aș vrea în M2

Spec separat „Franciză 2.0": legal entity mapping + e-Factura per CUI, royalty calculator interactiv pe pagină (slider % → preview sumă), transfer profesor cu split payroll, list-view pentru 20+ filiale, mockup dashboard consolidat real.

**Decizie**: rămân la MAYBE. Cer demo franciză, dar nu semnez până nu văd royalty calculator și răspuns clar pe SRL-per-filială. Dacă răspunsul e „pe Enterprise, custom" — atunci spuneți-o pe pagină, nu mă lăsați să descopăr în call.
