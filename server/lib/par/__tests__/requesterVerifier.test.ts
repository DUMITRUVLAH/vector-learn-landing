/**
 * Verificatorul solicitantului — regulile pure (lanțul și dreptul de corectură).
 *
 * Cazul owner-ului (23.09.2026, ATIC): Iulian verifică cererile colegelor lui (Cristina Onicov,
 * Marina Certan) înaintea aprobatorilor workspace-ului, le poate corecta sau întoarce. Testul de
 * rută (`server/__tests__/par-requester-verifier.routes.test.ts`) le probează capăt la capăt.
 */
import { describe, it, expect } from "vitest";
import type { ApprovalStep } from "../doa";
import { withProjectPreApproval, PRE_APPROVAL_LABEL } from "../preApprovers";
import {
  canVerifierAmend,
  openVerifierStep,
  VERIFIER_AMENDABLE_FIELDS,
  VERIFIER_LABEL,
  verifierAmendedFieldLabels,
  verifierBlockedMessage,
  withRequesterVerification,
} from "../requesterVerifier";
import { splitAmendment } from "../postSignatureEdit";

const CRISTINA = "cristina";
const IULIAN = "iulian";
const ANA = "ana";
const IRINA = "irina";

/** Matricea ATIC de pe producție: Ana și Irina, pe nume, pe același pas (paralel). */
const atic: ApprovalStep[] = [
  { step: 1, approverRoleLabel: "Aprobator", approverUserId: ANA, approverParRole: null },
  { step: 1, approverRoleLabel: "Aprobator", approverUserId: IRINA, approverParRole: null },
];

describe("withRequesterVerification — lanțul", () => {
  it("fără verificator, lanțul rămâne neatins", () => {
    expect(withRequesterVerification(atic, null, CRISTINA)).toEqual(atic);
  });

  it("verificatorul intră pe pasul 1, singur, iar aprobatorii urcă un nivel împreună", () => {
    const chain = withRequesterVerification(atic, IULIAN, CRISTINA);
    expect(chain[0]).toEqual({ step: 1, approverRoleLabel: VERIFIER_LABEL, approverUserId: IULIAN, approverParRole: null });
    expect(chain.filter((s) => s.step === 1)).toHaveLength(1);
    expect(chain.slice(1).map((s) => [s.step, s.approverUserId])).toEqual([
      [2, ANA],
      [2, IRINA],
    ]);
  });

  it("cine își e propriul verificator nu se verifică singur", () => {
    expect(withRequesterVerification(atic, CRISTINA, CRISTINA)).toEqual(atic);
  });

  it("pe PRIMUL nivel, rândul verificatorului se scoate — ar semna de două ori la rând", () => {
    const withIulianFirst: ApprovalStep[] = [
      ...atic,
      { step: 1, approverRoleLabel: "Aprobator", approverUserId: IULIAN, approverParRole: null },
    ];
    const chain = withRequesterVerification(withIulianFirst, IULIAN, CRISTINA);
    expect(chain.filter((s) => s.approverUserId === IULIAN)).toHaveLength(1);
    expect(chain[0].approverRoleLabel).toBe(VERIFIER_LABEL);
    expect(chain.filter((s) => s.step === 2).map((s) => s.approverUserId)).toEqual([ANA, IRINA]);
  });

  it("pe un nivel MAI TÂRZIU rândul lui rămâne — ordinea DOA și plafoanele nu se inversează", () => {
    // Directorul e și verificatorul: dacă i-am scoate pasul DOA, semnătura finală ar rămâne la
    // un nivel inferior, cu plafon mic — cererea s-ar bloca sau banda de două persoane s-ar prăbuși.
    const withDirectorLater: ApprovalStep[] = [
      { step: 1, approverRoleLabel: "Manager", approverUserId: null, approverParRole: "approver" },
      { step: 2, approverRoleLabel: "Director", approverUserId: IULIAN, approverParRole: null },
    ];
    const chain = withRequesterVerification(withDirectorLater, IULIAN, CRISTINA);
    expect(chain.map((s) => [s.step, s.approverRoleLabel, s.approverUserId])).toEqual([
      [1, VERIFIER_LABEL, IULIAN],
      [2, "Manager", null],
      [3, "Director", IULIAN],
    ]);
  });

  it("pașii pe ROL nu se ating (acolo nu se știe cine semnează)", () => {
    const byRole: ApprovalStep[] = [{ step: 1, approverRoleLabel: "Aprobator", approverUserId: null, approverParRole: "approver" }];
    const chain = withRequesterVerification(byRole, IULIAN, CRISTINA);
    expect(chain).toHaveLength(2);
    expect(chain[1]).toMatchObject({ step: 2, approverUserId: null, approverParRole: "approver" });
  });

  it("stă ÎNAINTEA pre-aprobării de proiect — nimeni nu semnează o variantă pe care el o mai poate corecta", () => {
    const withPre = withProjectPreApproval(atic, ["manager-proiect"], CRISTINA);
    const chain = withRequesterVerification(withPre, IULIAN, CRISTINA);
    expect(chain.map((s) => [s.step, s.approverRoleLabel])).toEqual([
      [1, VERIFIER_LABEL],
      [2, PRE_APPROVAL_LABEL],
      [3, "Aprobator"],
      [3, "Aprobator"],
    ]);
  });
});

describe("canVerifierAmend — când poate corecta", () => {
  const steps = [
    { id: "s0", step: 0, approverUserId: CRISTINA, approverRoleLabel: "Requestor", decision: "approved", locked: false },
    { id: "s1", step: 1, approverUserId: IULIAN, approverRoleLabel: VERIFIER_LABEL, decision: "pending", locked: false },
    { id: "s2", step: 2, approverUserId: ANA, approverRoleLabel: "Aprobator", decision: "pending", locked: true },
  ];

  it("pasul lui e deschis, e încă verificatorul, cererea așteaptă → DA", () => {
    expect(canVerifierAmend({ status: "pending_approval", steps, userId: IULIAN, currentVerifierUserId: IULIAN })).toBe(true);
    expect(openVerifierStep(steps, IULIAN)?.id).toBe("s1");
  });

  it("după ce a semnat, cererea e la alții → NU", () => {
    const signed = steps.map((s) => (s.id === "s1" ? { ...s, decision: "approved" } : s));
    expect(canVerifierAmend({ status: "pending_approval", steps: signed, userId: IULIAN, currentVerifierUserId: IULIAN })).toBe(false);
  });

  it("administratorul l-a schimbat între timp → poate semna pasul rămas, dar nu rescrie cererea", () => {
    expect(canVerifierAmend({ status: "pending_approval", steps, userId: IULIAN, currentVerifierUserId: null })).toBe(false);
    expect(canVerifierAmend({ status: "pending_approval", steps, userId: IULIAN, currentVerifierUserId: "altcineva" })).toBe(false);
  });

  it("cererea întoarsă (modificări cerute) e din nou a solicitantului → NU", () => {
    expect(canVerifierAmend({ status: "changes_requested", steps, userId: IULIAN, currentVerifierUserId: IULIAN })).toBe(false);
  });

  it("un pas DOA numit tot „Verificare”, deschis DUPĂ ce altcineva a semnat → NU rescrie cererea", () => {
    const lateLabel = [
      steps[0],
      { id: "d1", step: 1, approverUserId: ANA, approverRoleLabel: "Aprobator", decision: "approved", locked: false },
      { id: "d2", step: 2, approverUserId: IULIAN, approverRoleLabel: VERIFIER_LABEL, decision: "pending", locked: false },
    ];
    expect(canVerifierAmend({ status: "pending_approval", steps: lateLabel, userId: IULIAN, currentVerifierUserId: IULIAN })).toBe(false);
  });

  it("un aprobator obișnuit, chiar cu pasul deschis, nu e verificator → NU", () => {
    const aprobator = [{ ...steps[2], locked: false }];
    expect(canVerifierAmend({ status: "pending_approval", steps: aprobator, userId: ANA, currentVerifierUserId: ANA })).toBe(false);
  });
});

describe("lista albă a verificatorului", () => {
  it("linia de buget, evenimentul, descrierea, data trec; suma și beneficiarul se refuză", () => {
    const body = { budget_code_id: "bc", end_use: "x", event_id: "ev", date_needed: "2026-10-01T00:00:00.000Z", payee_iban: "MD..." };
    const { amendment, blocked } = splitAmendment(body, VERIFIER_AMENDABLE_FIELDS, Object.keys(body));
    expect(Object.keys(amendment).sort()).toEqual(["budget_code_id", "date_needed", "end_use", "event_id"]);
    expect(blocked).toEqual(["payee_iban"]);
  });

  it("mesajul de refuz îi spune ce să facă: să întoarcă cererea", () => {
    expect(verifierBlockedMessage(["payee_iban"])).toMatch(/Cere modificări/);
  });

  it("jurnalul se citește în română, pe câmpuri, nu pe coloane", () => {
    const diff = JSON.stringify({ budgetCodeId: { from: "a", to: "b" }, dateNeeded: { from: null, to: "x" } });
    expect(verifierAmendedFieldLabels(diff)).toEqual(["linia de buget", "data necesară"]);
    expect(verifierAmendedFieldLabels("nu e json")).toEqual([]);
  });
});
