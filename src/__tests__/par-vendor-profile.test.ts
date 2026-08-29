/**
 * PAR-VENDOR360 — regulile fișei de furnizor, testate acolo unde sunt scrise: în logica pură.
 *
 * Accentul cade pe semnalele de risc. Un semnal fals costă mai mult decât unul lipsă: dacă „IBAN
 * schimbat" apare pe un furnizor care doar și-a completat rechizitele, oamenii învață să ignore
 * avertismentele — și atunci nu mai prinde nici pe cel real.
 */
import { describe, it, expect } from "vitest";
import {
  slugifyCategory,
  summarizeRatings,
  computeVendorKpis,
  detectRiskFlags,
  compareOffersByUnit,
  requestMdlCents,
  type VendorRequestRow,
} from "../../server/lib/par/vendorProfile";

describe("slugifyCategory", () => {
  it("normalizează diacriticele românești", () => {
    expect(slugifyCategory("Alimentație / catering")).toBe("alimentatie-catering");
    expect(slugifyCategory("Birotică și consumabile")).toBe("birotica-si-consumabile");
    expect(slugifyCategory("Servicii Juridice")).toBe("servicii-juridice");
  });

  it("dă aceeași cheie pentru aceleași cuvinte scrise diferit — altfel apar domenii duplicate", () => {
    expect(slugifyCategory("SERVICII  juridice ")).toBe(slugifyCategory("Servicii juridice"));
  });
});

describe("summarizeRatings", () => {
  it("mediază doar criteriile completate, nu le tratează pe cele lipsă drept zero", () => {
    const s = summarizeRatings([
      { stars: 5, qualityStars: 5, timelinessStars: null, wouldUseAgain: true },
      { stars: 3, qualityStars: 3, timelinessStars: 2, wouldUseAgain: false },
    ]);
    expect(s.avg).toBe(4);
    expect(s.quality).toBe(4);
    expect(s.timeliness).toBe(2); // o singură valoare completată
    expect(s.wouldUseAgainPct).toBe(50);
    expect(s.distribution[5]).toBe(1);
    expect(s.distribution[3]).toBe(1);
  });

  it("fără evaluări nu inventează o notă", () => {
    const s = summarizeRatings([]);
    expect(s.avg).toBeNull();
    expect(s.wouldUseAgainPct).toBeNull();
    expect(s.count).toBe(0);
  });
});

describe("computeVendorKpis", () => {
  const rows: VendorRequestRow[] = [
    {
      id: "1",
      status: "paid",
      currency: "MDL",
      totalEstimatedCents: 100_000,
      actualAmountCents: 105_000,
      submittedAt: "2026-01-01T00:00:00Z",
      approvedAt: "2026-01-03T00:00:00Z",
      paidAt: "2026-01-08T00:00:00Z",
    },
    { id: "2", status: "pending_approval", currency: "MDL", totalEstimatedCents: 50_000 },
    { id: "3", status: "draft", currency: "MDL", totalEstimatedCents: 999_999 },
    { id: "4", status: "cancelled", currency: "MDL", totalEstimatedCents: 777_777 },
  ];

  it("plătit înseamnă suma chiar ieșită din cont, nu estimarea", () => {
    expect(computeVendorKpis(rows).paidCents).toBe(105_000);
  });

  it("angajat = bani promiși dar neieșiți; draftul și anulatul nu se pun la socoteală", () => {
    const k = computeVendorKpis(rows);
    expect(k.committedCents).toBe(50_000);
    expect(k.avgRequestCents).toBe(Math.round((105_000 + 50_000) / 2));
  });

  it("măsoară cât durează de la aprobare până la plată", () => {
    const k = computeVendorKpis(rows);
    expect(k.avgDaysApprovalToPayment).toBe(5);
    expect(k.avgDaysSubmitToPayment).toBe(7);
    expect(k.lastPaidAt).toBe("2026-01-08T00:00:00.000Z");
  });

  it("valuta străină intră prin echivalentul MDL, nu prin cifra nativă", () => {
    expect(
      requestMdlCents({
        id: "x",
        status: "paid",
        currency: "EUR",
        totalEstimatedCents: 10_000,
        totalMdlCents: 195_000,
        actualAmountCents: 10_000,
      })
    ).toBe(195_000);
  });
});

describe("detectRiskFlags", () => {
  const emptyRatings = summarizeRatings([]);

  it("ridică IBAN schimbat DOAR când există două conturi diferite pe cereri", () => {
    const twoIbans = detectRiskFlags({
      vendor: { idnp: "1012600012345" },
      requests: [
        { id: "1", status: "paid", currency: "MDL", totalEstimatedCents: 1, payeeIban: "MD24AG000225100013104168" },
        { id: "2", status: "paid", currency: "MDL", totalEstimatedCents: 1, payeeIban: "MD11AG000225100013109999" },
      ],
      ratings: emptyRatings,
    });
    expect(twoIbans.find((f) => f.code === "iban_changed")?.severity).toBe("critical");

    const sameIbanTwice = detectRiskFlags({
      vendor: { idnp: "1012600012345" },
      requests: [
        { id: "1", status: "paid", currency: "MDL", totalEstimatedCents: 1, payeeIban: "MD24 AG00 0225 1000 1310 4168" },
        { id: "2", status: "paid", currency: "MDL", totalEstimatedCents: 1, payeeIban: "md24ag000225100013104168" },
        { id: "3", status: "paid", currency: "MDL", totalEstimatedCents: 1, payeeIban: null },
      ],
      ratings: emptyRatings,
    });
    // Spațiile și literele mici sunt același cont; un IBAN lipsă nu e un cont nou.
    expect(sameIbanTwice.some((f) => f.code === "iban_changed")).toBe(false);
  });

  it("blochează vizibil, cu motiv", () => {
    const flags = detectRiskFlags({
      vendor: { relationship: "blocked", blockedReason: "Nu a onorat comanda", idnp: "1" },
      requests: [],
      ratings: emptyRatings,
    });
    const blocked = flags.find((f) => f.code === "blocked");
    expect(blocked?.severity).toBe("critical");
    expect(blocked?.message).toContain("Nu a onorat comanda");
  });

  it("nota mică se semnalează abia după a doua părere", () => {
    const one = detectRiskFlags({
      vendor: { idnp: "1" },
      requests: [],
      ratings: summarizeRatings([{ stars: 1 }]),
    });
    expect(one.some((f) => f.code === "low_rating")).toBe(false);

    const two = detectRiskFlags({
      vendor: { idnp: "1" },
      requests: [],
      ratings: summarizeRatings([{ stars: 1 }, { stars: 2 }]),
    });
    expect(two.some((f) => f.code === "low_rating")).toBe(true);
  });

  it("distinge documentul expirat de cel care expiră în curând", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const flags = detectRiskFlags({
      vendor: { idnp: "1" },
      requests: [],
      ratings: emptyRatings,
      now,
      documents: [
        { title: "Contract 2025", kind: "contract", validUntil: "2026-05-01T00:00:00Z" },
        { title: "Licență", kind: "licenta", validUntil: "2026-06-20T00:00:00Z" },
        { title: "Certificat lung", kind: "certificat", validUntil: "2027-01-01T00:00:00Z" },
      ],
    });
    expect(flags.filter((f) => f.code === "document_expired")).toHaveLength(1);
    expect(flags.filter((f) => f.code === "document_expiring")).toHaveLength(1);
  });

  it("semnalează furnizorul plătit pe care nu l-a evaluat nimeni", () => {
    const flags = detectRiskFlags({
      vendor: { idnp: "1" },
      requests: [{ id: "1", status: "paid", currency: "MDL", totalEstimatedCents: 1 }],
      ratings: emptyRatings,
    });
    expect(flags.some((f) => f.code === "never_rated")).toBe(true);
  });
});

describe("compareOffersByUnit", () => {
  it("compară doar oferte cu aceeași unitate — altfel comparația e dezinformare", () => {
    const groups = compareOffersByUnit([
      { id: "a", vendorId: "v1", unitLabel: "persoană", unitPriceCents: 12_500, offeredAt: "2026-01-01" },
      { id: "b", vendorId: "v2", unitLabel: "Persoană", unitPriceCents: 9_900, offeredAt: "2026-02-01" },
      { id: "c", vendorId: "v3", unitLabel: "top hârtie", unitPriceCents: 8_000, offeredAt: "2026-02-01" },
      { id: "d", vendorId: "v4", unitLabel: null, unitPriceCents: 100, offeredAt: "2026-02-01" },
    ]);
    expect(groups).toHaveLength(1); // „top hârtie" are o singură ofertă, deci nu se compară cu nimic
    expect(groups[0].unitLabel).toBe("persoană");
    expect(groups[0].bestId).toBe("b");
  });
});
