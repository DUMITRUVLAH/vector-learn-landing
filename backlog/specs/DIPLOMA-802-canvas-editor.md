---
id: DIPLOMA-802
title: "Diplome: editor vizual canvas cu drag&drop câmpuri + salvare template — portat din copy-roas"
milestone: DIPLOMA
phase: 1
status: pending
depends_on: [DIPLOMA-801]
slug: canvas-editor
---

## Goal

Portează editorul vizual de certificate din copy-roas (`src/pages/DiplomaGenerator.tsx`, partea de
canvas) — cea mai impresionantă piesă tehnică a proiectului. Editor `<canvas>` 3508×2480 cu câmpuri
poziționabile prin **drag & drop** peste un fundal încărcat, salvabile ca template (DIPLOMA-801).

## Idei de cod trase din copy-roas (referință)

`src/pages/DiplomaGenerator.tsx`:
- Câmpuri (`FieldKey`): `nume_prenume, nume_curs, mentor, data_finalizare, certificat_id`. Fiecare cu
  `{ x, y (procente 0..100), fontSize, color, fontFamily, bold, visible, maxWidth, label, value }`.
  `DEFAULT_FIELDS` dă pozițiile inițiale — portează-le.
- Canvas la `CANVAS_W=3508, CANVAS_H=2480`; `drawPreview()` desenează fundalul + fiecare câmp la
  `(x/100)*W, (y/100)*H`, font `${bold}${fontSize*3}px '${fontFamily}'`, cu **word-wrap** la `maxWidth`
  (funcția `wrapText`). Portează `drawPreview` + `wrapText` + `normalizeCertificateText` (curăță
  spațiile/diacriticele NFC; util important pentru nume copy-paste din Excel).
- Interacțiune mouse: `getCanvasCoords` (scalează clientX/Y la coordonatele canvas), `hitTest`
  (ce câmp e sub cursor), `handleMouseDown/Move/Up` pentru drag. Portează logica de drag.
- Panou de control stânga: per câmp — font (5 opțiuni: Onest, Playfair Display, Cormorant Garamond,
  Montserrat, Lora), X/Y %, fontSize, culoare (`<input type=color>`), bold, maxWidth, visible (Switch).
- Bloc QR config: `{ x, y, size, visible }` (desenat ca placeholder în editor; QR real în DIPLOMA-803).
- Upload fundal: PNG/JPG/**PDF** (PDF rasterizat cu `pdfjs-dist` — `pdfToImage`, scale 3). Portează.
- Salvare template: „Salvează Global" / „Salvează pt Curs" → upsert `certificate_templates`
  (`fields_config` = toate câmpurile + `qr_code`). „Reset" reîncarcă default.
- Toggle „Folosește template specific cursului" (override global cu per-curs).

## In scope

- Pagina `src/pages/app/DiplomaPage.tsx` (`/app/diplome`), secțiunile 1 (selectare curs/cohortă/mentor/
  dată) + 2 (editor canvas + panou câmpuri).
- Componente: `CertificateCanvas.tsx` (canvas + drag), `FieldControls.tsx` (panoul de config),
  `useCertificateTemplate.ts` (load/save template din DIPLOMA-801).
- Upload fundal (PNG/JPG/PDF) prin endpointul din DIPLOMA-801; dependențe `pdfjs-dist` adăugate
  (justificate în PR).
- Fonturile web (Onest deja în proiect; restul încărcate via `document.fonts` / @font-face).
- Salvare/încărcare template global + per curs, override toggle.

## Out of scope

- Randarea QR real + export PDF/JPG (DIPLOMA-803).
- Bulk ZIP / Drive (DIPLOMA-804).

## User stories

- **US-1**: Ca manager, vreau să-mi încarc fundalul de diplomă și să pozitionez numele/cursul/mentorul
  prin tragere directă, fără să umblu în cod.
- **US-2**: Ca manager, vreau să salvez aspectul ca template ca să-l refolosesc.

## Acceptance criteria

- [ ] AC1: Upload PNG/JPG/PDF → fundal randat pe canvas (PDF rasterizat corect).
- [ ] AC2: Drag pe un câmp îi schimbă `x,y`; valorile se reflectă în panou și invers.
- [ ] AC3: word-wrap la `maxWidth` funcționează; `normalizeCertificateText` curăță spațiile.
- [ ] AC4: „Salvează Global"/„pt Curs" persistă `fields_config`; reîncărcare restaurează pozițiile.
- [ ] AC5: 5 fonturi selectabile; bold/culoare/size aplicate live.
- [ ] AC6: 0 axe critical/serious pe controale; dark mode pe UI (canvas e WYSIWYG, exceptat);
      zero `any`; fără hex hardcodat în UI (canvas folosește culori din field config — OK).

## Files

### New
- `src/pages/app/DiplomaPage.tsx`
- `src/components/modules/diploma/CertificateCanvas.tsx`
- `src/components/modules/diploma/FieldControls.tsx`
- `src/hooks/useCertificateTemplate.ts`
- `src/lib/certificateText.ts` (`normalizeCertificateText`, `wrapText`)
- `src/__tests__/diploma/certificate-text.test.ts`
- `src/__tests__/diploma/canvas-editor.test.tsx`

### Modified
- router (`/app/diplome`), index module (card Diplome)
- `package.json` (`pdfjs-dist`, justificat)

## Tests

- **T-DIPLOMA-802-1** `[blocant]` `normalizeCertificateText("Ion   Popescu ")` → „Ion Popescu".
- **T-DIPLOMA-802-2** `[blocant]` `wrapText` rupe la lățime dată (mock measureText).
- **T-DIPLOMA-802-3** `[blocant]` Salvare template → payload conține toate câmpurile + qr_code.
- **T-DIPLOMA-802-4** Update field x/y din panou → re-render canvas (state corect).

## Definition of Done

- [ ] AC-uri; T-DIPLOMA-802-1..4 trec; build+typecheck+lint+test verzi
- [ ] Lighthouse + axe pe UI control panel verzi
