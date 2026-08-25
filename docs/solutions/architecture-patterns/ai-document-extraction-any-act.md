---
title: „Am încărcat un act și nu funcționează" — PDF scanat care nu ajungea la model + gate pe tipul documentului + eroare de API mascată ca „(demo)"
problem_type: architecture_pattern
module: par-ai-prefill, ai-client
tags: [ai, extraction, pdf, ocr, vision, openai, anthropic, docx, xlsx, fallback, error-surfacing]
symptoms: „Documentul nu pare a fi o factură sau bon financiar" + câmpuri goale după încărcarea unui act real; eticheta „(demo)" lângă „Câmpuri propuse de AI"
severity: P1
date: 2026-08-21
---

## Simptom
Un utilizator a încărcat un ACT de primire-predare real (PDF scanat, cu semnătură olografă) în
„Din document (AI)" pe formularul PAR și a primit avertismentul „Documentul nu pare a fi o factură
sau bon financiar", zero câmpuri completate și eticheta discretă „(demo)".

## Cauze (trei, suprapuse)

1. **PDF-ul scanat nu ajungea NICIODATĂ la model.** Ruta trimitea la vision doar `image/*`; pentru
   PDF extrăgea textul cu `unpdf`. Un PDF scanat nu are strat de text → `extractPdfText` întorcea
   `""` (corect, prin design) → modelul primea un document gol. Nimic în UI nu spunea asta.
2. **Tipul actului bloca rezultatul.** `choosePayee` avea o poartă
   `documentClass === "not_invoice" && amountCents == null → niciun beneficiar`, iar UI-ul afișa un
   avertisment pe `not_financial`. Dar un PAR se ridică în mod normal pe acte care NU sunt facturi
   (act de primire-predare, contract, deviz). Eticheta documentului nu e un semnal de plătibilitate.
3. **Eroarea de API era raportată ca succes.** În `callAi`, orice excepție (429 „no credits",
   timeout) era prinsă, textul devenea răspunsul de stub, dar rezultatul rămânea `isStub: false`.
   Extractorul eșua apoi la `JSON.parse` și cădea pe parserul regex cu `isStub: true` — deci un
   serviciu PICAT arăta identic cu „nu e configurată nicio cheie": eticheta „(demo)".

## Fix
- **Orice fișier ajunge la model:** PDF fără strat de text (`< 200` caractere) e trimis ca atașament
  — content part `file` pe OpenAI, bloc `document` pe Anthropic (unde până acum până și `imageDataUrl`
  era ignorat). `.docx`/`.xlsx` sunt citite cu `server/lib/ai/officeText.ts` (import lazy la `jszip` /
  `exceljs`), nu cu `buf.toString("utf8")`, care pe un ZIP producea binar.
- **Semnal din CONȚINUT, nu din etichetă:** poarta pe `documentClass` a dispărut. Nu se propune
  beneficiar doar când documentul nu are NICIO rechizită de plată (fără sumă ȘI fără cod fiscal/IBAN
  la nicio parte). Un proces-verbal rămâne gol; un act de primire-predare cu IBAN se completează.
- **Eșecul se vede:** `AiCallResult.unavailable` (`no_key` | `feature_disabled` | `budget_exceeded` |
  `api_error`) urcă până în UI, care scrie exact de ce nu a rulat AI-ul în loc de „(demo)".

## Lecția
Un fallback tăcut e mai rău decât o eroare. Aici trei straturi de degradare grațioasă
(`extractPdfText` → "", `callAi` → text de stub, extractor → parser regex) s-au compus într-un mesaj
care dădea vina pe DOCUMENTUL utilizatorului („nu pare a fi o factură") pentru o problemă de
infrastructură (cont AI fără credit). Orice cale de fallback trebuie să **transporte motivul** până
la interfață.

## Cum verifici
- `npx vitest run server/__tests__/par-ai-prefill-any-document.routes.test.ts` — postează pe ruta
  reală un PDF fără strat de text și verifică faptul că ajunge la extractor ca atașament.
- `npx vitest run server/__tests__/aiClient.attachments.test.ts` — payload-ul per provider + 429 →
  `unavailable: "api_error"`.
- Live: `POST /api/par/ai-prefill` cu un PDF scanat → 200, iar `aiUnavailable` arată starea reală a
  serviciului AI.
