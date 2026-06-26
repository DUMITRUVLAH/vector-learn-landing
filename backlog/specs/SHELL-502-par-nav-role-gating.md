---
id: SHELL-502
title: "Requestor (project manager) vede în nav doar partea lui — gating PAR pe rol"
milestone: SHELL
phase: "SHELL3"
status: done
attempts: 1
depends_on: [SHELL-501]
spec: backlog/specs/SHELL-502-par-nav-role-gating.md
---

## Problema (din E2E, 2026-06-26)

Securitatea pe backend e corectă (toate endpoint-urile privilegiate dau 403 pentru requestor — verificat
live), **dar UI-ul over-expune**: sidebar-ul PAR (`PAR_NAV_GROUPS` în BusinessShell) era identic pentru
toate rolurile. Un requestor („project manager") **vedea** „Inbox aprobare", „Coadă finanțe",
„Administrare PAR", „Rapoarte" — link-uri pe care le poate accesa doar ca să primească pagini goale (403).
Owner-ul a cerut explicit: requestor-ul *„should not see that"*.

## Goal

Filtrează nav-ul PAR pe rolul real al userului (din `/api/par/me`), oglindind exact guard-urile de
backend (`requirePARRole`). Un requestor vede DOAR „Cereri de plată" (lista lui + creare + upload).
Nu schimbăm backend-ul (deja corect) — aliniem UI-ul cu drepturile.

## Acceptance criteria

- [x] `NavItem` capătă `roles?: ParNavRole[]` (undefined = orice membru PAR)
- [x] Inbox aprobare → `approver|par_admin`; Coadă finanțe → `finance|par_admin`; Foldere+Rapoarte → `approver|finance|par_admin`; Administrare → `par_admin`
- [x] Filtru aplicat universal pe nav (meniul PAR-module ȘI secțiunea PAR din meniul Business), grupurile goale dispar
- [x] Nav-ul mobil (bottom bar) gat­at la fel; grid se adaptează la 1–4 item-uri
- [x] Tenant-admin primește implicit `par_admin` (via `/api/par/me`) → vede tot, corect
- [x] check-refs + vite build verzi

## Files

**Modified:**
- `src/components/business/BusinessShell.tsx` — `roles` pe NavItem, role pe item-urile PAR, filtru per-item universal + nav mobil

## Tests

- **T-SHELL-502-1** [blocant] requestor: nav PAR arată DOAR „Cereri de plată"; fără Inbox/Finanțe/Admin/Rapoarte
- **T-SHELL-502-2** [normal] finance: vede Coadă finanțe + Rapoarte, nu Administrare
- **T-SHELL-502-3** [normal] par_admin (sau tenant-admin): vede tot

## DoD

- Build verde · verificat că backend-ul rămâne sursa de adevăr (403) · deploy
