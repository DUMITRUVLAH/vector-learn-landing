---
id: M1-001
title: Orar interactiv — module page
milestone: M1
estimate_hours: 2
priority: P0
---

# M1-001 — Orar interactiv

## Goal
Pagină dedicată `/modules/orar` care prezintă în profunzime modulul de orar și include un demo interactiv funcțional (drag & drop între celule, recuperare, conflict detection).

## User stories
- **Manager academie**: "Vreau să văd cât de rapid pot reprograma o lecție și cum se actualizează automat părintele."
- **Profesor**: "Vreau să înțeleg cum îmi văd orarul personal și cum cer înlocuiri."
- **Director rețea**: "Vreau să văd cum administrez săli și conflicte între filiale."

## Acceptance criteria
- [ ] Pagina e accesibilă la `/modules/orar`
- [ ] Hero cu titlu, sub-titlu, CTA primar și sub-CTA `Înapoi la toate modulele`
- [ ] Demo interactiv: minimum 5 zile × 4 sloturi cu drag & drop între celule (folosește HTML5 DnD, fără libs externe)
- [ ] Cel puțin 4 secțiuni: *Cum funcționează*, *Capabilități cheie*, *Pentru cine*, *FAQ scurt (4 întrebări)*
- [ ] Pe drag & drop: animație de tranziție, toast notification simulat ("Părinte notificat pe WhatsApp")
- [ ] Detectare conflict: dacă plasezi 2 lecții în același slot, evidențiere roșie + alert inline
- [ ] Responsive: funcționează pe 375px mobile (demo poate deveni read-only pe mobile)
- [ ] Dark mode complet
- [ ] Toate culorile prin tokens semantice (zero hex în JSX)

## Files
**Create:**
- `src/pages/modules/OrarPage.tsx`
- `src/components/modules/orar/ScheduleDemo.tsx`
- `src/components/modules/orar/ConflictBadge.tsx`
- `src/components/modules/ModulePageShell.tsx` (refolosit de toate)
- `src/components/modules/ModuleHero.tsx` (refolosit de toate)
- `src/components/modules/ModuleFAQ.tsx` (refolosit de toate)
- `src/__tests__/modules/orar.test.tsx`

**Modify:**
- `src/App.tsx` — adaugă routing simplu prin URL hash sau React Router

## Tests required
- Rendering de bază (component mounts)
- Drag-drop logic (programatic test pe state-ul intern)
- Conflict detection returnează `true` când 2 evenimente au același `day` și `slot`
- Snapshot pentru hero și FAQ

## UX validation
Lansat după build pe persona-manager și persona-student agents pentru raport.

## Definition of done
Toate quality gates din `BACKLOG.md` trec verde. PR este open pe `main`.
