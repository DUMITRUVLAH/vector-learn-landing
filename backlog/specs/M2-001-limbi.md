---
id: M2-001
title: Pentru centre de limbi străine
milestone: M2
estimate_hours: 2
priority: P0
---

# M2-001 — Pentru centre de limbi străine

## Goal
Pagina `/pentru/limbi` — landing tailored pentru directori de centre de limbi străine. Limba ta vorbește pain-urile specifice (nivele CEFR, certificări Cambridge/IELTS, grupe pe abilitate, examene interne) și arată modulele Vector Learn care le rezolvă.

## User stories
- **Manager centru limbi**: "Văd că Vector Learn înțelege diferența între un curs general și pregătire IELTS"
- **Director rețea limbi**: "Vreau exemple cu cifre de la centre de limbi similare cu al meu"

## Acceptance criteria
- [ ] Pagina la `/pentru/limbi`
- [ ] Hero specific limbilor (nivele CEFR vizual, certificări menționate)
- [ ] Secțiune "Pain-uri specifice" — 4-6 probleme concrete (grupe mixte CEFR, drop-off după A2, sezonalitate, examene externe)
- [ ] Secțiune "Cum rezolvă Vector Learn" — 3-4 module relevante (Orar pe niveluri, CRM cu pipeline trial→A1→A2, Rapoarte progres CEFR, Aplicație cu vocabulary trainer)
- [ ] Case study cu cifre (anonimizat: "Lingua School Bucuresti, 1.400 elevi")
- [ ] CTA: "Vezi demo pentru centre de limbi"
- [ ] FAQ 4 întrebări specifice domeniului
- [ ] Responsive + dark mode

## Files
- `src/pages/audiences/LimbiPage.tsx`
- `src/components/audiences/AudiencePageShell.tsx` (refolosit M2-002..M2-006)
- `src/components/audiences/AudienceHero.tsx` (refolosit)
- `src/components/audiences/PainSolutionGrid.tsx` (refolosit)
- `src/components/audiences/CaseStudyCard.tsx` (refolosit)
- `src/__tests__/audiences/limbi.test.tsx`

## Tests required
- Hero renders with badge
- Pain points list count
- Module links render and point to correct /modules/*
- FAQ items render

## DoD
Quality gates pass.
