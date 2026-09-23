/**
 * Hârtia trebuie să spună când a fost completată după semnare.
 *
 * Finanțele pot corecta linia de buget sau adăuga descrierea DUPĂ ce cererea a fost semnată
 * (cerere manager financiar, 22.09.2026). Formularul tipărit arată valorile de ACUM — deci, fără
 * nota asta, exemplarul din dosar ar contrazice în tăcere ce au semnat aprobatorii, iar un auditor
 * n-ar avea de unde ști că diferența e o corectură legitimă, nu o falsificare.
 */
import { describe, it, expect } from "vitest";
import { buildParFormDefinition } from "../parFormPdf";
import type { ParFormData } from "../parFormData";

function fixture(amendments?: ParFormData["financeAmendments"]): ParFormData {
  return {
    parId: "55555555-5555-5555-5555-555555555555",
    requestNo: "PAR-2026-0061",
    status: "paid",
    submittedAt: "2026-09-10T08:00:00.000Z",
    approvedAt: "2026-09-11T08:00:00.000Z",
    dateOfRequest: "2026-09-10T08:00:00.000Z",
    requestedByName: "Ana Popa",
    requestorTitle: "Coordonator",
    requestorCode: null,
    departmentName: "Programe",
    dateNeeded: null,
    projectName: "Digital Safeguard",
    eventName: null,
    budgetCodeLabel: "6-2-03 — Administrativ",
    purpose: "Executare plată",
    chargeTo: "program",
    chargeBillingCode: null,
    currency: "MDL",
    totalEstimatedCents: 50000,
    totalMdlCents: null,
    exchangeRate: null,
    endUse: "Traduceri",
    payeeName: "Furnizor SRL",
    payeeIdnp: "1234567890123",
    payeeIban: "MD24AG000225100013104168",
    payeeBank: "OTP Bank S.A.",
    attachmentsPresent: true,
    attachmentsNote: "Act adițional nr. 2",
    lineItems: [{ description: "Traduceri", quantity: 1, unit: "buc", unitPriceCents: 50000, lineTotalCents: 50000 }],
    signatures: [],
    payment: null,
    ...(amendments ? { financeAmendments: amendments } : {}),
  };
}

function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const child of node) texts(child, out);
  else if (node && typeof node === "object") for (const v of Object.values(node as Record<string, unknown>)) texts(v, out);
  return out;
}

describe("formularul PAR — completările de după semnare", () => {
  it("[blocant] hârtia spune ce s-a completat după semnare, de cine și când", () => {
    const printed = texts(
      buildParFormDefinition(
        fixture([{ at: "2026-09-20T09:30:00.000Z", byName: "Violeta B.", fields: ["budget line"] }])
      )
    ).join("\n");
    expect(printed).toContain("Amended by finance after signature");
    expect(printed).toContain("budget line");
    expect(printed).toContain("Violeta B.");
  });

  it("[normal] o cerere necompletată nu primește nota — nu inventăm evenimente pe hârtie", () => {
    const printed = texts(buildParFormDefinition(fixture())).join("\n");
    expect(printed).not.toContain("Amended by finance after signature");
  });

  it("[normal] spune explicit că sumele au rămas cele semnate", () => {
    const printed = texts(
      buildParFormDefinition(fixture([{ at: "2026-09-20T09:30:00.000Z", byName: null, fields: ["end-use description"] }]))
    ).join("\n");
    expect(printed).toMatch(/amounts, payee and line items unchanged/i);
  });
});

describe("formularul PAR — corecturile verificatorului (înainte de aprobatori)", () => {
  it("[blocant] hârtia spune că verificatorul a corectat cererea, ce și cine", () => {
    const data = {
      ...fixture(),
      verifierAmendments: [{ at: "2026-09-23T12:00:00.000Z", byName: "Iulian Lungu", fields: ["budget line", "event"] }],
    };
    const printed = texts(buildParFormDefinition(data)).join("\n");
    expect(printed).toContain("Corrected at verification, before the approvals");
    expect(printed).toContain("budget line, event");
    expect(printed).toContain("Iulian Lungu");
  });

  it("[normal] fără corecturi de verificare, nicio notă", () => {
    const printed = texts(buildParFormDefinition(fixture())).join("\n");
    expect(printed).not.toContain("Corrected at verification");
  });
});
