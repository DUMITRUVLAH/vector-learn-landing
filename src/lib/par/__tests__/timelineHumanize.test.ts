/**
 * Jurnalul de activitate se citește de oameni.
 *
 * Testele de aici pornesc de la textele pe care le scrie CHIAR serverul în `par_audit`
 * (le găsești cu `grep -n "detail:" server/routes/par*.ts`) și verifică două lucruri:
 * fraza rezultată e în română și e de înțeles, iar bruta tehnică — uuid-uri, hash-uri,
 * „cents", JSON — nu ajunge niciodată pe ecran.
 */
import { describe, it, expect } from "vitest";
import {
  eventTitle,
  fieldLabel,
  humanizeDetail,
  humanizeDiff,
  humanizeEvent,
} from "../timelineHumanize";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("titluri de eveniment", () => {
  it("traduce evenimentele cunoscute", () => {
    expect(eventTitle("created")).toBe("Cerere creată");
    expect(eventTitle("document_reconciliation_match")).toBe("Actul se potrivește cu cererea");
    expect(eventTitle("fully_approved_to_finance")).toBe("Aprobată complet și trimisă la finanțe");
  });

  it("nu lasă underscore-uri pe ecran pentru un eveniment necunoscut", () => {
    expect(eventTitle("some_new_event")).toBe("Some new event");
  });
});

describe("detalii scrise de server", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["created", "PAR PAR-2026-0004 created as draft", /Cererea PAR-2026-0004 a fost creată ca ciornă/],
    [
      "submitted",
      "PAR PAR-2026-0004 submitted; 3 approval step(s) generated. Body hash: a1b2c3d4…",
      /Trimisă spre aprobare, cu 3 pași de semnat/,
    ],
    ["approved", "Step 2 (Director financiar) approved", /A semnat pasul 2 — Director financiar/],
    [
      "approved",
      "Step 2 (Director) approved — prin delegare de la Ana Chirița",
      /Prin delegare de la Ana Chirița/,
    ],
    ["step_unlocked", "Step 3 unlocked for 2 approver(s)", /S-a deschis pasul 3 pentru 2 aprobatori/],
    ["rejected", "Step 1 rejected. Comment: lipsește contractul", /Respinsă la pasul 1\. Motiv: lipsește contractul/],
    [
      "changes_requested",
      "Step 1 requested changes. Comment: corectează IBAN-ul",
      /S-au cerut modificări la pasul 1\. Motiv: corectează IBAN-ul/,
    ],
    ["paid", "Actual amount: 2340200 cents. Ref: OP-118", /Plătit .*23\D?402,00\s(MDL|L).*OP-118/],
    [
      "reapproval_required",
      "Actual 2600000 exceeds estimated 2340200 by >10% (threshold 10). Re-approval required.",
      /trece cu peste 10% peste estimarea din cerere/,
    ],
    ["in_finance", "Received by user 0973c7b7-9467-4854-aaf7-dcc7e1573e60; assigned to unassigned", /a intrat la finanțe/],
    [
      "approval_limit_exceeded",
      "Final approval blocked: PAR total 2340200 MDL cents exceeds approver limit 1000000 cents.",
      /Aprobarea finală s-a oprit/,
    ],
    ["overage_reapproved", "Overage re-approved by user 12ab. PAR returned to in_finance.", /reaprobată/],
    ["integrity_mismatch", "Hash mismatch: stored=a1b2c3d4…  computed=e5f6a7b8…", /nu mai sunt cele semnate/],
    ["duplicated_from", "Duplicated from PAR-2026-0002 (0973c7b7-9467-4854-aaf7-dcc7e1573e60)", /Copiată după cererea PAR-2026-0002/],
    ["created_from_template", 'Instantiated from template "Chirie lunară" (0973c7b7-9467-4854-aaf7-dcc7e1573e60)', /Creată din șablonul „Chirie lunară”|Creată din șablonul „Chirie lunară"/],
    ["reopened", "PAR PAR-2026-0004 reopened from 'rejected' → 'draft' for revision", /redeschisă ca ciornă/],
    ["po_issued", "Comandă emisă: PO-7 către ATIC SRL (23402 MDL)", /Comanda PO-7 către ATIC SRL/],
    ["goods_received", "Recepție parțială înregistrată (3 linii)", /Recepție parțială pentru 3 poziții/],
    ["vendor_autosaved", "Plătitor salvat automat în registrul de prestatori: 0973c7b7-9467-4854-aaf7-dcc7e1573e60", /salvat în registrul de prestatori/],
  ];

  it.each(cases)("%s — %s", (event, detail, expected) => {
    const lines = humanizeDetail(event, detail);
    expect(lines.join(" ")).toMatch(expected);
  });

  it("nu scapă niciun uuid, hash sau „cents” pe ecran", () => {
    for (const [event, detail] of cases) {
      const text = humanizeDetail(event, detail).join(" ");
      expect(text).not.toMatch(UUID);
      expect(text.toLowerCase()).not.toContain("cents");
      expect(text.toLowerCase()).not.toContain("hash");
    }
  });
});

describe("verificarea actului față de cerere", () => {
  const detail = JSON.stringify({
    attachmentId: "0973c7b7-9467-4854-aaf7-dcc7e1573e60",
    fileName: "68339_CA_ATIC_25Aug26.pdf",
    warnings: 1,
    checks: [
      { field: "sumă", expected: 2340200, found: 1000000, matches: false },
      { field: "valută", expected: "MDL", found: "MDL", matches: true },
      { field: "IBAN", expected: null, found: null, matches: null },
    ],
  });

  it("scrie fraze, nu JSON", () => {
    const lines = humanizeDetail("document_reconciliation_warning", detail);
    const text = lines.join(" ");
    expect(text).toContain("68339_CA_ATIC_25Aug26.pdf");
    expect(text).toMatch(/Nu coincid: suma/);
    expect(text).toMatch(/Coincid: valuta/);
    expect(text).toMatch(/Nu s-au putut verifica: IBAN-ul/);
    expect(text).not.toContain("{");
    expect(text).not.toContain("matches");
    expect(text).not.toMatch(UUID);
  });

  it("arată sumele în lei, nu în bani", () => {
    const text = humanizeDetail("document_reconciliation_warning", detail).join(" ");
    expect(text).toMatch(/23\D?402,00\s(MDL|L)/);
    expect(text).not.toContain("2340200");
  });
});

describe("diferențele de la editare", () => {
  it("traduce numele câmpului și valoarea", () => {
    const lines = humanizeDiff(JSON.stringify({ payeeType: { from: null, to: "juridic" } }));
    expect(lines).toEqual(["Tipul beneficiarului: persoană juridică (era necompletat)"]);
  });

  it("acceptă și forma before/after", () => {
    const lines = humanizeDiff(JSON.stringify({ endUse: { before: "A", after: "B" } }));
    expect(lines).toEqual(["Destinația finală: A → B"]);
  });

  it("nu afișează uuid-uri, ci direcția schimbării", () => {
    const lines = humanizeDiff(
      JSON.stringify({
        projectId: { from: null, to: "0973c7b7-9467-4854-aaf7-dcc7e1573e60" },
      }),
    );
    expect(lines).toEqual(["Proiectul: completat"]);
  });

  it("nu arată datele bancare redactate, doar că s-au completat", () => {
    const lines = humanizeDiff(JSON.stringify({ payeeIban: { from: null, to: "***" } }));
    expect(lines).toEqual(["IBAN-ul beneficiarului: completat (valoarea nu se afișează)"]);
    expect(lines[0]).not.toContain("***");
  });

  it("scrie sumele ca bani, nu ca numere de bani", () => {
    const lines = humanizeDiff(
      JSON.stringify({ totalEstimatedCents: { from: 100000, to: 2340200 } }),
    );
    expect(lines[0]).toMatch(/Suma estimată: .*1\D?000,00\s(MDL|L) → .*23\D?402,00\s(MDL|L)/);
  });

  it("dă un nume citibil unui câmp necunoscut", () => {
    expect(fieldLabel("someNewField")).toBe("Some new field");
  });

  it("nu se rupe pe un diff stricat", () => {
    expect(humanizeDiff("nu-i JSON")).toEqual([]);
    expect(humanizeDiff(null)).toEqual([]);
  });
});

describe("evenimentul complet", () => {
  it("nu repetă „Updated fields” când diferențele sunt deja scrise", () => {
    const human = humanizeEvent({
      event: "edited",
      detail: "Updated fields: payeeType",
      diff: JSON.stringify({ payeeType: { from: null, to: "juridic" } }),
    });
    expect(human.lines).toEqual(["Tipul beneficiarului: persoană juridică (era necompletat)"]);
  });

  it("dacă nu există diff, spune totuși ce s-a schimbat, cu nume de om", () => {
    const human = humanizeEvent({
      event: "edited",
      detail: "Updated fields: payeeType, endUse",
      diff: null,
    });
    expect(human.lines).toEqual(["A schimbat: tipul beneficiarului, destinația finală."]);
  });

  it("un eveniment fără detaliu rămâne doar cu titlul", () => {
    const human = humanizeEvent({ event: "cancelled", detail: null, diff: null });
    expect(human.title).toBe("Anulată");
    expect(human.lines).toEqual([]);
  });
});
