/**
 * Pre-aprobarea de proiect — funcția pură care pune nivelul nou în fața lanțului DOA.
 *
 * Testele apără exact cele trei promisiuni făcute owner-ului (16.09.2026): cererea asistentului
 * trece întâi pe la managerul de proiect, cine depune nu se pre-aprobă singur, și nimeni nu e pus
 * să semneze de două ori aceeași cerere.
 */
import { describe, it, expect, vi } from "vitest";

// `withProjectPreApproval` e pură; importul de DB există doar pentru helperii vecini.
vi.mock("../../../db/client", () => ({ db: {} }));

import { withProjectPreApproval, PRE_APPROVAL_LABEL } from "../preApprovers";
import type { ApprovalStep } from "../doa";

const step = (o: Partial<ApprovalStep> & { step: number }): ApprovalStep => ({
  approverRoleLabel: "Aprobator",
  approverUserId: null,
  approverParRole: null,
  ...o,
});

const DOA_CHAIN: ApprovalStep[] = [
  step({ step: 1, approverRoleLabel: "Aprobator", approverParRole: "approver" }),
  step({ step: 2, approverRoleLabel: "Director financiar", approverParRole: "finance" }),
];

describe("withProjectPreApproval", () => {
  it("proiect fără pre-aprobatori → lanțul DOA rămâne neatins", () => {
    expect(withProjectPreApproval(DOA_CHAIN, [], "asistent")).toEqual(DOA_CHAIN);
  });

  it("pune pre-aprobatorul pe pasul 1 și decalează lanțul DOA cu un nivel", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian"], "asistent");

    expect(chain).toHaveLength(3);
    expect(chain[0]).toEqual({
      step: 1,
      approverRoleLabel: PRE_APPROVAL_LABEL,
      approverUserId: "iulian",
      approverParRole: null,
    });
    // Ordinea relativă a pașilor DOA se păstrează, doar numerotarea urcă.
    expect(chain.slice(1).map((s) => [s.step, s.approverParRole])).toEqual([
      [2, "approver"],
      [3, "finance"],
    ]);
  });

  it("mai mulți pre-aprobatori stau pe ACELAȘI pas — toți semnează, în ce ordine vor", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian", "cristina"], "asistent");
    const pre = chain.filter((s) => s.approverRoleLabel === PRE_APPROVAL_LABEL);
    expect(pre.map((s) => s.step)).toEqual([1, 1]);
    expect(pre.map((s) => s.approverUserId)).toEqual(["iulian", "cristina"]);
    // Lanțul DOA se decalează cu UN nivel, nu cu numărul de pre-aprobatori.
    expect(chain.filter((s) => s.approverRoleLabel !== PRE_APPROVAL_LABEL).map((s) => s.step)).toEqual([2, 3]);
  });

  it("cine depune cererea nu se pre-aprobă singur (a semnat deja la pasul 0)", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian"], "iulian");
    expect(chain).toEqual(DOA_CHAIN);
  });

  it("singurul pre-aprobator e solicitantul → lanțul rămâne cel DOA, nu se golește", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian"], "iulian");
    expect(chain.map((s) => s.step)).toEqual([1, 2]);
  });

  it("cu doi pre-aprobatori, doar solicitantul cade; celălalt rămâne", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian", "cristina"], "iulian");
    const pre = chain.filter((s) => s.approverRoleLabel === PRE_APPROVAL_LABEL);
    expect(pre.map((s) => s.approverUserId)).toEqual(["cristina"]);
  });

  it("un pre-aprobator fixat și mai târziu în DOA semnează O SINGURĂ dată, la pre-aprobare", () => {
    const pinned: ApprovalStep[] = [
      step({ step: 1, approverUserId: "ana", approverRoleLabel: "Aprobator" }),
      step({ step: 2, approverUserId: "iulian", approverRoleLabel: "Director de program" }),
    ];
    const chain = withProjectPreApproval(pinned, ["iulian"], "asistent");
    expect(chain.map((s) => s.approverUserId)).toEqual(["iulian", "ana"]);
    expect(chain.map((s) => s.step)).toEqual([1, 2]);
  });

  it("pașii pe ROL nu se ating — acolo nu se știe cine va semna", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["cristina"], "asistent");
    expect(chain.filter((s) => s.approverParRole === "finance")).toHaveLength(1);
  });

  it("dublurile din configurare nu produc două semnături pentru același om", () => {
    const chain = withProjectPreApproval(DOA_CHAIN, ["iulian", "iulian"], "asistent");
    expect(chain.filter((s) => s.approverRoleLabel === PRE_APPROVAL_LABEL)).toHaveLength(1);
  });
});
