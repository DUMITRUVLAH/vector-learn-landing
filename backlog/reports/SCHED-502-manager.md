# SCHED-502 Persona Review — Andreea Mitran (Manager)

**Date**: 2026-05-30
**Verdict**: BUY

## Scenario tested
Andreea creates a new "Engleză B2" group that meets every Monday at 14:00 for 12 weeks. Previously she had to create each lesson individually (12 clicks). Now she clicks "Repetă", fills in the form once, and gets 12 lessons in one go.

## Feedback

**What works well:**
- "Creează 12 lecții" button is explicit — no ambiguity about what will happen
- Conflict check before creation (all-or-nothing) prevents partial series that would confuse teachers
- The "Anulează lecțiile viitoare" concept (bulk cancel from a date) is exactly what she needs when a teacher goes on medical leave — she'd need a UI for that, but the backend is ready
- Room assignment works the same as single lessons — consistent UX

**Concerns:**
- There's no way to cancel future lessons FROM THE UI yet (the DELETE endpoint exists but there's no button in ViewLessonModal for series). This is a follow-up item.
- No indication in the calendar view which lessons belong to the same series — would be helpful to visually group them. Future improvement.
- Max 52 occurrences is fine for a school year

**Verdict reasoning**: The core pain (creating recurring schedules without clicking 12 times) is solved cleanly. The modal is simple enough that even a stressed academy director gets it right on first try.

**Quote**: "Asta îmi salvează 20 minute la fiecare grupă nouă. Am 40+ grupe active, înmulțești..."
