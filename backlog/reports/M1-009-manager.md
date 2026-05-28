# M1-009 Integrări — Review Andreea Mitran

**Persona:** director academie, 6 locații, 1.400 elevi
**Streak context:** M → B → B → B → B → M → B → B → M (a noua review)
**Verdict:** MIXED — aproape, dar mai am două lucruri care mă opresc să zic „da".

---

## Ce-mi place (și de ce contează pentru mine)

**1. ANAF SPV e-Factura e listat corect.** „WMS / Anaf SPV", UBL 2.1, OUG 120/2021 — exact terminologia pe care o caut. Din ianuarie 2024 e obligatoriu B2B și am avut deja două amenzi pe alt furnizor care „uitase" să updateze. Faptul că ați pus referința legală arată că știți ce livrați.

**2. 1C + SAGA + SmartBill prezente.** Cele trei pe care le folosesc real centrele din RO. SAGA e popular la contabilii externalizați, 1C la rețele mai mari, SmartBill la cei care vor cloud. Acoperire bună.

**3. MobilPay + PayU + Netopia.** Trio-ul corect pentru România. Stripe e bonus. Faptul că Netopia menționează split TVA și 3DS — exact ce întreabă contabilul meu primul.

**4. Asterisk self-hosted listat primul în telefonie.** Două din șase locații rulează Asterisk on-prem pentru că nu vrem să trimitem audio în cloud străin. Recording + transcriere apeluri menționate explicit. Bifat.

**5. FAQ-ul despre downtime și retry exponențial.** „Retry exponențial automat (1, 5, 15, 60 min, 6h, 24h)... outbox local... event-sourced cu replay" — ăsta e singurul răspuns care mă face să cred că ați mai trecut printr-o picare ANAF. Asta vând eu mai departe la board.

**6. Custom integration SLA 10 zile lucrătoare pe Enterprise.** Concret, măsurabil, scris în FAQ. Pot să-l folosesc în decizie.

---

## Ce mă oprește

**1. „WMS / Anaf SPV" — numele e confuz.** WMS = Warehouse Management System în limbajul meu. Aici amestecați două lucruri. Separați-le: o integrare distinctă „ANAF e-Factura (SPV)" și, dacă chiar aveți WMS, alta. Acum pare neglijent exact pe item-ul cel mai sensibil legal. Asta mă opresc concret.

**2. e-Transport ANAF lipsește.** Dacă mișcați materiale didactice între 6 locații și valoarea > 10k lei, intri sub obligația e-Transport. Nu e edge case pentru mine. Adaugă-l sau spune explicit pe pagină că vine în roadmap.

**3. Revisal / REGES-ONLINE lipsește.** Am 40+ profesori angajați. Sincronizarea contractelor de muncă spre Revisal e ce vrea HR-ul meu. Fără ăsta, „contabilitate" e jumătate de poveste.

**4. Connection health menționat în FAQ dar nu vizibil pe pagină.** Spuneți „success rate, latență, ultimul sync" în panou — arătați-mi un screenshot mock în secțiunea API. Promisiunea fără proba vizuală nu trece la procurement.

**5. API REST — credibil dar incomplet.** OpenAPI 3.1, OAuth 2, rate limit configurabil — bun. Lipsește: versioning policy (cât timp suportați v1 după ce iese v2?), sandbox environment, și SLA uptime pe API-ul vostru (99.5%? 99.9%?). Astea sunt întrebări 1 și 2 de la orice IT lead serios.

**6. WhatsApp Business — 45 min setup pare optimist.** Verificare Meta + template approval durează zile, nu minute. Fie clarificați că „setup tehnic" ≠ „aprobare Meta", fie creșteți cifra. Sunt sensibilă la promisiuni care se sparg în primele 48h.

---

## Decizia mea

Conțin entuziasmul. Conținutul RO-specific e clar peste media pieței și asta e principalul meu criteriu. Dar numele „WMS / Anaf SPV" și absența Revisal mă fac să nu pot duce pagina la board așa cum e. Reparați cele două și avem MATCH ferm.

**Streak update:** M → B → B → B → B → M → B → B → M → **M**