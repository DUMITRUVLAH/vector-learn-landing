/**
 * VM5-11 — „Emailurile să vină în batch-uri de aprobare."
 *
 * Testele apără forma pe care o citește omul dimineața: ce e primul, ce scrie pe fiecare rând și ce
 * promisiune face emailul (că respingerile continuă să vină imediat).
 */
import { describe, it, expect } from "vitest";
import {
  buildDigestBody,
  daysWaiting,
  digestSubject,
  sortDigestItems,
  waitingLabel,
  type DigestItem,
} from "../approvalDigest";

const item = (o: Partial<DigestItem> & { requestNo: string }): DigestItem => ({
  parId: `id-${o.requestNo}`,
  amountLabel: "1.000,00 MDL",
  requestorName: "Iulian Lungu",
  projectName: "Tekwill",
  waitingDays: 0,
  ...o,
});

const body = (items: DigestItem[]) =>
  buildDigestBody({
    items,
    inboxUrl: "https://finflow.best/#/business/par/inbox",
    parUrl: (id) => `https://finflow.best/#/business/par/${id}`,
    workspace: "ATIC",
    toAddress: "ana@atic.md",
  });

describe("digestSubject()", () => {
  it("numără cererile în subiect, la singular și plural", () => {
    expect(digestSubject(1)).toContain("O cerere");
    expect(digestSubject(7)).toContain("7 cereri");
  });
});

describe("sortDigestItems()", () => {
  it("urgentele primele", () => {
    const out = sortDigestItems([item({ requestNo: "B" }), item({ requestNo: "A", urgent: true })]);
    expect(out[0].requestNo).toBe("A");
  });

  it("apoi cele care așteaptă de cel mai mult — ele blochează pe cineva", () => {
    const out = sortDigestItems([
      item({ requestNo: "B", waitingDays: 1 }),
      item({ requestNo: "C", waitingDays: 9 }),
      item({ requestNo: "A", waitingDays: 4 }),
    ]);
    expect(out.map((i) => i.requestNo)).toEqual(["C", "A", "B"]);
  });

  it("la egalitate, ordinea e stabilă (după număr), ca două emailuri să arate la fel", () => {
    const out = sortDigestItems([item({ requestNo: "PAR-2" }), item({ requestNo: "PAR-1" })]);
    expect(out.map((i) => i.requestNo)).toEqual(["PAR-1", "PAR-2"]);
  });
});

describe("waitingLabel()", () => {
  it("scrie timpul ca un om", () => {
    expect(waitingLabel(0)).toBe("azi");
    expect(waitingLabel(1)).toBe("de ieri");
    expect(waitingLabel(5)).toBe("de 5 zile");
  });
});

describe("buildDigestBody()", () => {
  it("pune fiecare cerere cu sumă, solicitant, proiect și link", () => {
    const text = body([item({ requestNo: "PAR-2026-0031", amountLabel: "12.500,00 MDL", waitingDays: 3 })]);
    expect(text).toContain("PAR-2026-0031 — 12.500,00 MDL");
    expect(text).toContain("de la Iulian Lungu");
    expect(text).toContain("Tekwill");
    expect(text).toContain("așteaptă de 3 zile");
    expect(text).toContain("https://finflow.best/#/business/par/id-PAR-2026-0031");
  });

  it("marchează urgențele și documentele nepotrivite pe rândul cererii", () => {
    const text = body([item({ requestNo: "PAR-1", urgent: true, documentWarnings: 2 })]);
    expect(text).toContain("URGENT");
    expect(text).toContain("2 nepotriviri de documente");
  });

  it("spune explicit că respingerile vin în continuare imediat", () => {
    // Fără propoziția asta, cine primește digestul presupune că TOT ce ține de PAR e întârziat
    // cu opt ore și începe să se uite în aplicație „ca să fie sigur" — adică exact ce evităm.
    expect(body([item({ requestNo: "PAR-1" })])).toMatch(/modificare .*imediat/s);
  });

  it("duce la inbox, nu doar la cereri una câte una", () => {
    expect(body([item({ requestNo: "PAR-1" })])).toContain("Deschide inboxul de aprobare");
  });

  it("spune în ce workspace și pe ce cont duce linkul", () => {
    const text = body([item({ requestNo: "PAR-1" })]);
    expect(text).toContain("Workspace: ATIC");
    expect(text).toContain("Cont destinatar: ana@atic.md");
  });

  it("la o singură cerere vorbește la singular", () => {
    expect(body([item({ requestNo: "PAR-1" })])).toContain("O cerere așteaptă aprobarea ta");
  });
});

describe("daysWaiting()", () => {
  it("numără zilele întregi de la depunere", () => {
    const now = new Date("2026-09-12T10:00:00Z");
    expect(daysWaiting("2026-09-12T08:00:00Z", now)).toBe(0);
    expect(daysWaiting("2026-09-09T08:00:00Z", now)).toBe(3);
  });

  it("o dată lipsă sau stricată nu produce numere negative", () => {
    expect(daysWaiting(null)).toBe(0);
    expect(daysWaiting("nu e o dată")).toBe(0);
    expect(daysWaiting(new Date(Date.now() + 86_400_000))).toBe(0);
  });
});
