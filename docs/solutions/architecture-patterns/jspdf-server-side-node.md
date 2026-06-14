---
title: "jsPDF în Node.js (server-side) pentru generare PDF fără browser"
problem_type: architecture-pattern
module: FISC
tags: [pdf, jspdf, server, nodejs, declaration]
symptoms: "Need to generate PDFs on the server without html2canvas or headless browser"
severity: medium
date: 2026-06-14
---

## Symptom

Ai nevoie de generare PDF pe server (în rute Hono/Express) fără browser, html2canvas, sau
Playwright. Exemple: declarații fiscale, rapoarte, facturi.

## Root cause

jsPDF (^4.x) funcționează nativ în Node.js — nu necesită browser sau DOM. Limitare: fonturile
built-in nu suportă diacritice românești (ș/ț/ă/î) dacă folosești `doc.text()` cu text român.
Workaround: ascii-safe text (fără diacritice) sau TTF embedding.

## Fix

```ts
import { jsPDF } from "jspdf";

export function generatePdf(): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(12);
  doc.text("Declaratie TVA", 20, 20); // fără diacritice
  return Buffer.from(doc.output("arraybuffer"));
}
```

Returnează `Buffer` din `arraybuffer`. Trimitere ca răspuns Hono:

```ts
return new Response(buf, {
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="declaratie.pdf"`,
  },
});
```

## How to avoid next time

- jsPDF funcționează în Node.js — nu adăuga dependențe suplimentare (puppeteer, wkhtmltopdf)
- Evită diacriticele în textul PDF (folosesc varianta ASCII-safe)
- html2canvas e CLIENT-ONLY (necesită DOM) — folosit în `src/lib/*.ts`, nu în `server/`
- Testare: `const buf = generatePdf(); expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');`
