# SCHED-601 — Code Review

**Verdict: APPROVED**

## Design system compliance
- Drag highlight uses `bg-primary/10 ring-1 ring-inset ring-primary/40` — semantic tokens, correct
- `cursor-grab active:cursor-grabbing` — correct UX signaling
- Opacity 50% on card during PATCH save — correct loading state without blocking

## A11y
- `aria-label` on draggable buttons includes course name, teacher, and "Trage pentru a reprograma" — screen reader can understand the action
- `draggable="true"` on non-draggable lessons correctly set to `false` (via conditional)

## Dark mode
- All new classes use semantic tokens (`bg-primary/10`, `ring-primary/40`) — dark mode compatible

## Architecture
- Server PATCH /api/lessons/:id already existed with conflict detection — no server changes needed
- `patchLesson()` is a thin API wrapper — correct pattern
- `draggingLessonId` uses `useRef` (not `useState`) to avoid re-renders during drag — correct

## Zero `any` — confirmed
