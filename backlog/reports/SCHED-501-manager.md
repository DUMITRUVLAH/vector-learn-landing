# SCHED-501 Persona Review — Andreea Mitran (Manager)

**Date**: 2026-05-30
**Verdict**: BUY

## Scenario tested
Andreea manages 6 locations, each with multiple rooms (Sala A, Sala B, Lab informatică, Sala dans). She needs to prevent double-booking of physical rooms when scheduling classes.

## Feedback

**What works well:**
- Room dropdown appears automatically when rooms are configured — zero friction for centers that don't use rooms yet
- "Sala este ocupată la această oră." error is clear and immediate — no guessing
- The conflict detection prevents the embarrassing situation of two teachers showing up to the same room
- Room is optional — centers that teach online or at student homes don't need to fill this

**Concerns:**
- There's no room management page (add/edit/delete rooms from UI) — rooms can only be added via API right now. But this is a Phase 1 item; a Rooms CRUD page would be a logical SCHED-5xx follow-up.
- Capacity is stored but not enforced (out of scope per spec) — acceptable for now

**Verdict reasoning**: The core pain (double-booking prevention) is solved. The room dropdown integrates cleanly into the existing schedule workflow. No new concepts to learn — it's just a new optional field in the "add lesson" form.

**Quote**: "Asta îmi lipsea — să știu că nu trimit doi profesori în aceeași sală. Acum pot programa fără să sun pe cineva să verify."
