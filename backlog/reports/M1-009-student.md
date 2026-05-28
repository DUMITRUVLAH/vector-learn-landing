STUDENT_REVIEW: SKIP
PARENT_REVIEW: DISLIKES
ID: M1-009

MARIA_FIRST_REACTION: "Stripe, Asterisk, 1C... ce-i asta, un site de contabilitate? Inchid."
CRISTINA_FIRST_REACTION: "Stai, scrie 'Facebook Pixel + CAPI' — adica datele copilului meu ajung la Facebook? Si in exemplu vad email-ul si telefonul scrise direct, fara nicio criptare?"

VISUAL_APPEAL: neutral
NOTIFICATION_CLARITY: n/a
APP_PREVIEW_REALISM: n/a
PRIVACY_FEEL: alarming
GAMIFICATION: absent
LANGUAGE_REGISTER: adult-only

FRICTION_POINTS (max 5):
- [major] (Cristina) "Card-ul 'Facebook Pixel + CAPI' scrie 'Conversion API server-side cu PII hashing' — eu ca parinte nu inteleg 'PII hashing', dar inteleg 'Facebook' si ma sperie. Daca trimit datele Mariei catre Meta ca sa-mi vand mie reclame mai bine, e o linie pe care n-o vreau trecuta fara consimtamant explicit."
- [major] (Cristina) "In exemplul de cod webhook scrie literal `email, phone` in clear text si `consent_at: new Date()` — adica consimtamantul se seteaza automat la momentul primirii lead-ului? Asta nu-i consimtamant, e bifa automata. Pentru un parinte care a citit despre GDPR, e steag rosu."
- [major] (Cristina) "Nicaieri pe pagina nu apare cuvantul 'GDPR', 'Data Processing Agreement' sau 'sub-procesatori'. Pentru o lista de 350+ integrari, ar trebui sa vad clar care din ele primesc PII si care nu."
- [minor] (Cristina) "TikTok Ads, Google Ads, Meta — toate trei la categoria Analytics, toate scriu de 'audience matching' / 'offline conversion'. Inteleg ca scoala vrea reclame mai eficiente, dar nu vad o sectiune 'ce NU plecam catre advertiser-i'."
- [minor] (Maria) "Pagina e plina de cuvinte de IT — webhooks, OpenAPI, OAuth. Eu n-am ce cauta aici, inchid in 4 secunde."

WINS (max 3):
- Mentiunea "PII hashing" la card-ul Facebook Pixel ARATA ca echipa tehnica stie ce face — daca s-ar explica in limbaj de parinte ("nu trimitem email-ul brut, doar o amprenta criptata"), ar fi un win major in loc de un termen care suna a jargon.
- FAQ-ul mentioneaza "audit log accesibil 90 zile" si "retry exponențial" — Cristina apreciaza transparenta operationala, chiar daca nu e pe partea de privacy.
- Categoria "Telefonie / Plăți / Contabilitate" arata serios si european (1C, SAGA, e-Factura ANAF) — pentru un parinte care a vazut scandaluri cu scoli private, semnaleaza maturitate.

QUOTE_MARIA: "N-am inteles nimic, e o pagina pentru parintii prietenilor mei care lucreaza in IT."
QUOTE_CRISTINA: "Daca scoala Mariei foloseste Vector Learn, vreau sa stiu DACA si CE pleaca la Facebook, nu sa descopar dintr-un exemplu de cod ca emailul ei zboara in clar prin webhooks."

VERDICT: Pagina e construita pentru cumparatorul tehnic (CTO, integrator, owner curios) si la nivelul acela isi face treaba — 32 integratii filtrabile, exemplu de cod, FAQ operational solid. Insa pentru parintele end-user, pagina are doua semnale de alarma concrete: (1) Facebook Pixel + CAPI listat fara context despre ce se trimite si ce consimtamant e necesar, (2) exemplul de webhook arata email+telefon in clear cu consent_at auto-setat — ambele lucruri sunt probabil ok in practica reala, dar pe o pagina publica de marketing transmit exact mesajul opus. Recomandare pentru M2: adauga o sectiune "Privacy & Sub-procesatori" sau un badge pe fiecare card care primeste PII, si rescrie exemplul de cod sa arate hash-ing-ul explicit (SHA-256 pe email inainte de trimitere). Maria — irelevant, pagina nu e pentru ea si e ok asa.
