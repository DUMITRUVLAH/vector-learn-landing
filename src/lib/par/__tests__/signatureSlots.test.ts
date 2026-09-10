/**
 * VM5-15 — casetele de semnătură nu se mai pot schimba între două descărcări.
 *
 * Cazul real (Iulian Lungu, ATIC): PAR-2026-0025 are TREI rânduri pe pasul 1 — două aprobate și
 * unul în așteptare. Formularul avea două casete și lua primele două rânduri din listă, în ordinea
 * bazei de date. Când rândul nedecis ajungea primul, o semnătură dată dispărea de pe hârtie.
 */
import { describe, it, expect } from "vitest";
import { orderSignatureSlots, type SignatureSlotInput } from "../signatureSlots";

const row = (o: Partial<SignatureSlotInput> & { id: string; step: number }): SignatureSlotInput => ({
  decision: "approved",
  decidedAt: null,
  ...o,
});

/** Rândurile lui PAR-2026-0025, așa cum arată în producție. */
const PAR_0025: SignatureSlotInput[] = [
  row({ id: "a-req", step: 0, decidedAt: "2026-09-08T09:00:00Z" }),
  row({ id: "a-irina", step: 1, decidedAt: "2026-09-08T10:00:00Z" }),
  row({ id: "a-dumitru", step: 1, decidedAt: "2026-09-08T11:00:00Z" }),
  row({ id: "a-pending", step: 1, decision: "pending", decidedAt: null }),
];

describe("orderSignatureSlots()", () => {
  it("nu lasă un rând în așteptare să treacă înaintea unei aprobări date", () => {
    const { approvers } = orderSignatureSlots([PAR_0025[3], PAR_0025[1], PAR_0025[2]]);
    expect(approvers.map((a) => a.id)).toEqual(["a-irina", "a-dumitru", "a-pending"]);
  });

  it("dă același rezultat indiferent de ordinea în care vin rândurile din API", () => {
    const permutations = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ];
    const results = permutations.map((p) => {
      const slots = orderSignatureSlots(p.map((i) => PAR_0025[i]));
      return [slots.requestor?.id, ...slots.approvers.map((a) => a.id)].join("|");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("a-req|a-irina|a-dumitru|a-pending");
  });

  it("păstrează ordinea lanțului: pașii cresc, iar în pas ordinea e cea a semnării", () => {
    const { approvers } = orderSignatureSlots([
      row({ id: "s2", step: 2, decidedAt: "2026-09-08T12:00:00Z" }),
      row({ id: "s1-b", step: 1, decidedAt: "2026-09-08T11:00:00Z" }),
      row({ id: "s1-a", step: 1, decidedAt: "2026-09-08T10:00:00Z" }),
    ]);
    expect(approvers.map((a) => a.id)).toEqual(["s1-a", "s1-b", "s2"]);
  });

  it("desparte solicitantul (pasul 0) de aprobatori", () => {
    const { requestor, approvers } = orderSignatureSlots(PAR_0025);
    expect(requestor?.id).toBe("a-req");
    expect(approvers.every((a) => a.step > 0)).toBe(true);
  });

  it("rândurile fără dată de decizie nu împing rândurile decise la coadă", () => {
    const { approvers } = orderSignatureSlots([
      row({ id: "fara-data", step: 1, decision: "approved", decidedAt: null }),
      row({ id: "cu-data", step: 1, decision: "approved", decidedAt: "2026-09-08T10:00:00Z" }),
    ]);
    expect(approvers.map((a) => a.id)).toEqual(["cu-data", "fara-data"]);
  });

  /**
   * Regresie găsită pe date REALE (ATIC, PAR-2026-0024): pasul 1 are două rânduri pentru aceeași
   * persoană — cel fixat pe ea plus unul bazat pe rol, rămas din driftul reparat pe 10 septembrie.
   * Formularul o tipărea semnând în ambele casete, ca și cum ar fi fost doi aprobatori.
   */
  it("nu tipărește același om de două ori pe același pas", () => {
    const { approvers } = orderSignatureSlots([
      row({ id: "rol", step: 1, approverUserId: null, signatureName: "Irina Oriol", decidedAt: "2026-09-08T10:00:00Z" }),
      row({ id: "fixat", step: 1, approverUserId: "u-irina", approverName: "Irina Oriol", decidedAt: "2026-09-08T10:05:00Z" }),
    ]);
    expect(approvers).toHaveLength(1);
    expect(approvers[0].id).toBe("rol"); // semnătura dată prima rămâne pe hârtie
  });

  it("două persoane diferite pe același pas rămân două casete (nivel paralel real)", () => {
    const { approvers } = orderSignatureSlots([
      row({ id: "ana", step: 1, approverUserId: "u-ana", approverName: "Ana Chirita", decidedAt: "2026-09-08T10:00:00Z" }),
      row({ id: "irina", step: 1, approverUserId: "u-irina", approverName: "Irina Oriol", decidedAt: "2026-09-08T11:00:00Z" }),
    ]);
    expect(approvers.map((a) => a.id)).toEqual(["ana", "irina"]);
  });

  it("rândurile fără nicio identitate nu se contopesc între ele", () => {
    // Două semnături care încă lipsesc rămân două casete goale — altfel formularul ar ascunde
    // faptul că mai e nevoie de o semnătură.
    const { approvers } = orderSignatureSlots([
      row({ id: "gol-1", step: 1, decision: "pending", decidedAt: null }),
      row({ id: "gol-2", step: 1, decision: "pending", decidedAt: null }),
    ]);
    expect(approvers).toHaveLength(2);
  });

  it("un om care semnează la pași diferiți primește caseta lui la fiecare pas", () => {
    const { approvers } = orderSignatureSlots([
      row({ id: "p1", step: 1, approverUserId: "u-ana", decidedAt: "2026-09-08T10:00:00Z" }),
      row({ id: "p2", step: 2, approverUserId: "u-ana", decidedAt: "2026-09-08T12:00:00Z" }),
    ]);
    expect(approvers.map((a) => a.id)).toEqual(["p1", "p2"]);
  });

  it("o listă goală nu produce nimic de tipărit", () => {
    expect(orderSignatureSlots([])).toEqual({ requestor: null, approvers: [] });
  });

  it("nu modifică lista primită", () => {
    const input = [...PAR_0025];
    orderSignatureSlots(input);
    expect(input.map((a) => a.id)).toEqual(PAR_0025.map((a) => a.id));
  });
});
