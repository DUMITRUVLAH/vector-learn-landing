# MOB-102 Code Review — Mobile schedule + homework + grading

**Reviewer**: code-reviewer-vl
**Date**: 2026-06-02
**Verdict**: APPROVED

## Summary
Homework schema (tables + migration), API endpoints, and UI pages implemented cleanly.
Migration `0031` correctly contains only the new `homework` and `homework_submissions` tables — duplicates from prior migrations removed.

## Design system
- `HomeworkPage.tsx`: semantic tokens throughout. Status classes use `text-warning`, `text-success`, `text-primary`.
- `GradingPage.tsx`: uses `AppShell` correctly — consistent with other admin pages.
- No hardcoded hex values.

## Schema
- `homework_status` enum: `pending|submitted|graded` — covers the full lifecycle.
- Proper FK cascade: lesson delete → homework delete, student delete → homework delete.
- Index on `(student_id, deadline)` is exactly what the query uses — efficient.

## API
- `GET /api/m/homework?filter=overdue` — uses `lt(deadline, now)` which is correct for timezone-aware comparison.
- `POST /api/m/homework/:id/submit` — validates at least one of text/image, returns 409 on re-submit, 404 on not found. No raw `.execute().rows` — uses ORM throughout.
- `GET /api/m/grading` — returns submitted homework for teacher. Correct scope.

## Minor findings
1. GradingPage shows studentId UUID — should show student name (needs a join). Non-blocking for this PR; add in next grading polish pass.
2. Image upload in HomeworkPage shows `image_url` field in schema but the UI only accepts text. Image upload (camera) deferred to MOB-104 scope. Acceptable.

**Verdict: APPROVED**
