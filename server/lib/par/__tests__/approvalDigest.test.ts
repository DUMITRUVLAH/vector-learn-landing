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
  type FinanceItem,
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
  const counts = (approvals = 0, finance = 0, updates = 0) => ({ approvals, finance, updates });

  it("numără cererile de aprobat în subiect, la singular și plural", () => {
    expect(digestSubject(counts(1))).toContain("o cerere așteaptă aprobarea ta");
    expect(digestSubject(counts(7))).toContain("7 cereri așteaptă aprobarea ta");
  });

  it("VM5-13: coada de plată a finanțelor apare separat de cea de aprobat", () => {
    expect(digestSubject(counts(0, 1))).toContain("o cerere de plătit");
    expect(digestSubject(counts(0, 4))).toContain("4 cereri de plătit");
  });

  it("VM5-13: cine e și aprobator și finanțe primește UN subiect cu ambele", () => {
    const s = digestSubject(counts(2, 3));
    expect(s).toContain("2 cereri așteaptă aprobarea ta");
    expect(s).toContain("3 cereri de plătit");
  });

  it("VM5-13: doar update-uri → subiectul spune asta, nu un „0 cereri” gol", () => {
    expect(digestSubject(counts(0, 0, 2))).toContain("ce s-a întâmplat");
  });

  it("toate variantele încep cu prefixul pe care anti-dublura îl caută", () => {
    for (const c of [counts(1), counts(0, 1), counts(0, 0, 1), counts(1, 1, 1)]) {
      expect(digestSubject(c).startsWith("[PAR] Digest")).toBe(true);
    }
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

  it("numește orele, ca omul să știe când e următorul email", () => {
    expect(body([item({ requestNo: "PAR-1" })])).toContain("09:00 și la 16:00");
  });

  it("promite instant DOAR ce chiar pleacă instant — urgentele incluse", () => {
    // Emailul per-cerere s-a oprit (VM5-13); singurele care mai sparg digestul sunt urgențele,
    // respingerile și cererile de modificare. Dacă textul promite altceva, omul așteaptă degeaba.
    expect(body([item({ requestNo: "PAR-1" })])).toContain("URGENT");
  });
});

describe("buildDigestBody() — secțiunea de finanțe (VM5-13)", () => {
  const financeBody = (financeItems: FinanceItem[], items: DigestItem[] = []) =>
    buildDigestBody({
      items,
      financeItems,
      inboxUrl: "https://finflow.best/#/business/par/inbox",
      financeUrl: "https://finflow.best/#/business/par/finante",
      parUrl: (id) => `https://finflow.best/#/business/par/${id}`,
    });

  const fin = (o: Partial<FinanceItem> & { requestNo: string }): FinanceItem => ({
    parId: `id-${o.requestNo}`,
    amountLabel: "7.400,00 MDL",
    payeeName: "ACME SRL",
    waitingDays: 0,
    ...o,
  });

  it("listează cererile de plătit cu sumă, beneficiar și de când așteaptă", () => {
    const text = financeBody([fin({ requestNo: "PAR-2026-0040", waitingDays: 2 })]);
    expect(text).toContain("PAR-2026-0040 — 7.400,00 MDL");
    expect(text).toContain("către ACME SRL");
    expect(text).toContain("aprobată de 2 zile");
    expect(text).toContain("Deschide coada de plăți");
  });

  it("urgentele stau primele și în coada de plăți", () => {
    const text = financeBody([
      fin({ requestNo: "PAR-NORMAL", waitingDays: 9 }),
      fin({ requestNo: "PAR-URGENT", urgent: true, waitingDays: 0 }),
    ]);
    expect(text.indexOf("PAR-URGENT")).toBeLessThan(text.indexOf("PAR-NORMAL"));
  });

  it("cine e și aprobator și finanțe primește UN email cu ambele secțiuni", () => {
    // Asta e toată miza: două roluri nu înseamnă două emailuri.
    const text = financeBody([fin({ requestNo: "DE-PLATIT" })], [item({ requestNo: "DE-APROBAT" })]);
    expect(text).toContain("DE-APROBAT");
    expect(text).toContain("DE-PLATIT");
    expect(text).toContain("așteaptă aprobarea ta");
    expect(text).toContain("așteaptă plata");
  });

  it("fără rol de finanțe, secțiunea lipsește cu totul", () => {
    expect(body([item({ requestNo: "PAR-1" })])).not.toContain("așteaptă plata");
  });
});

describe("buildDigestBody() — ce s-a întâmplat cu cererile aprobate (VM5-13)", () => {
  it("spune aprobatorului ce s-a ales de cererea pe care a semnat-o", () => {
    const text = buildDigestBody({
      items: [],
      updates: [{ parId: "id-9", text: "Plata către ACME SRL a fost achitată (cererea PAR-9)." }],
      inboxUrl: "https://finflow.best/#/business/par/inbox",
      parUrl: (id) => `https://finflow.best/#/business/par/${id}`,
    });
    expect(text).toContain("Ce s-a întâmplat cu cererile pe care le-ai aprobat");
    expect(text).toContain("a fost achitată");
    expect(text).toContain("https://finflow.best/#/business/par/id-9");
  });

  it("fără update-uri, secțiunea nu apare goală", () => {
    expect(body([item({ requestNo: "PAR-1" })])).not.toContain("Ce s-a întâmplat");
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
