# AI Assistant — User Stories

## US-AI-01: Chat AI cu context tenant
**As a** Manager, **I want to** întreb AI-ul "câți elevi noi am avut săpt asta", **so that** primesc răspuns fără să caut.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Claude/GPT integration cu function calling
  - [ ] Functions: querySQL, listStudents, getStats
  - [ ] Răspunsuri în română
  - [ ] Citează datele (link la rândurile sursă)

## US-AI-02: Sumarizare lecție pentru părinte
**As a** Profesor, **I want to** după lecție, AI generează sumar 5 rânduri din notițele mele, **so that** trimit părintelui rapid.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Generate summary" cu notele profesorului
  - [ ] AI returnează: progres, dificultăți, recomandări
  - [ ] Profesor aprobă/editează înainte de send

## US-AI-03: Răspuns auto WhatsApp
**As a** Recepționer, **I want to** AI propune răspuns la întrebări frecvente părinți, **so that** răspund în secunde.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Detectează intent (preț, orar, anulare)
  - [ ] Propune răspuns cu confidence
  - [ ] Manager aprobă cu un click

## US-AI-04: Predicție churn cu motive
**As a** Director, **I want to** AI prezice cine pleacă luna viitoare + de ce, **so that** intervin preventiv.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Features: attendance, payment, engagement
  - [ ] Output: probability % + top 3 motive
  - [ ] Action sugerată per elev

## US-AI-05: Suggest mentor session pe baza performanță
**As an** AI, **I want to** dacă elev sub 60% la simulare → sugerez sesiune 1:1 cu mentor, **so that** recuperează.
- **Status**: backlog
- **Priority**: P1

## US-AI-06: Plan studiu personalizat
**As a** Student, **I want to** AI îmi spune "azi 30 min pe X + 20 min pe Y", **so that** am ghid clar.
- **Status**: backlog
- **Priority**: P1

## US-AI-07: Generate quiz automat din curriculum
**As a** Profesor, **I want to** AI generează 10 întrebări din capitolul predat, **so that** testez înțelegerea fără să compun manual.
- **Status**: backlog
- **Priority**: P1

## US-AI-08: Corectare temă cu poza scrisă
**As an** AI, **I want to** primesc poza temei + OCR + corect, **so that** profesorul economisește timp.
- **Status**: backlog
- **Priority**: P2

## US-AI-09: Sumar săptămânal pentru părinte (email)
**As a** Părinte, **I want to** primesc email vineri seara cu "Maria a făcut progres pe Past Perfect, are dificultate cu listening", **so that** știu unde sunt.
- **Status**: backlog
- **Priority**: P1

## US-AI-10: Auto-pricing recommendation
**As a** Director, **I want to** AI îmi spune "ar trebui să crești prețul Engleză B2 cu 12%" pe baza demand, **so that** optimizez revenue.
- **Status**: backlog
- **Priority**: P2

## US-AI-11: Topic suggestion pentru lecția următoare
**As a** Profesor, **I want to** AI sugerează tema următoare pe baza progresului grupei, **so that** nu mă blochez pe content.
- **Status**: backlog
- **Priority**: P2

## US-AI-12: Detecție sentiment în feedback părinți
**As a** Director, **I want to** AI clasifică feedback (positive/neutral/negative) + extract issues, **so that** procesez în volume mari.
- **Status**: backlog
- **Priority**: P2

## US-AI-13: Lead qualification automată
**As a** Vânzător, **I want to** AI sortează leadurile noi în hot/warm/cold, **so that** prioritizez.
- **Status**: backlog
- **Priority**: P1

## US-AI-14: Translate template-uri (DeepL/AI)
**As a** Marketing, **I want to** un click traduce template RO → EN+UA+RU, **so that** acopăr diaspora.
- **Status**: backlog
- **Priority**: P2

## US-AI-15: Voice-to-text apel telefon
**As a** Recepționer, **I want to** apelul înregistrat → transcript text + summary, **so that** salvez în lead-card fără să transcriu manual.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Whisper API
  - [ ] Diarization (cine vorbește)

## US-AI-16: GDPR-safe data usage
**As an** Owner, **I want to** datele trimise la OpenAI/Anthropic să fie pseudonimizate, **so that** GDPR compliant.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Replace nume cu tokens înainte de send
  - [ ] DPA cu provider semnat

## US-AI-17: Cost cap per tenant
**As a** Billing, **I want to** sistem oprește AI după X € consumat lunar per tenant, **so that** nu pierd bani.
- **Status**: backlog
- **Priority**: P1

## US-AI-18: Human-in-the-loop pentru mesaje externe
**As a** Risk manager, **I want to** AI propune draft → om aprobă înainte de send extern, **so that** previn erori publice.
- **Status**: backlog
- **Priority**: P0

## US-AI-19: Self-hosted Mistral (Enterprise)
**As an** Enterprise customer, **I want to** rulez Mistral on-prem, **so that** zero data leaves my infrastructure.
- **Status**: backlog
- **Priority**: P2

## US-AI-20: Audit log AI actions
**As a** Compliance, **I want to** loguri pentru fiecare AI call (input, output, model, cost), **so that** dovedesc conformitate.
- **Status**: backlog
- **Priority**: P0
