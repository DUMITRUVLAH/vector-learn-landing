/**
 * Completarea de după semnare — lista albă de câmpuri și cine are voie.
 *
 * De ce contează testul ăsta mai mult decât pare: regula spune „sumele nu se mai modifică după
 * semnare și plată". Dacă un câmp nou din formular ajunge din greșeală pe lista permisă, nimic nu
 * mai strigă — nici tipurile, nici compilatorul. Aici strigă.
 */
import { describe, it, expect } from "vitest";
import {
  blockedFieldsMessage,
  canFinanceAmend,
  FINANCE_AMENDABLE_FIELDS,
  hasFinanceRole,
  isFinanceStageStatus,
  splitFinanceAmendment,
} from "../postSignatureEdit";

describe("postSignatureEdit — cine poate completa", () => {
  it("[blocant] doar rolul de finanțe (plus administratorul modulului)", () => {
    expect(hasFinanceRole(["finance"])).toBe(true);
    expect(hasFinanceRole(["par_admin"])).toBe(true);
    expect(hasFinanceRole(["requestor"])).toBe(false);
    expect(hasFinanceRole(["approver"])).toBe(false);
    expect(hasFinanceRole([])).toBe(false);
    expect(hasFinanceRole(null)).toBe(false);
  });

  it("[blocant] doar după ce cererea a trecut de semnături", () => {
    for (const status of ["approved", "in_finance", "reapproval_required", "paid"]) {
      expect(isFinanceStageStatus(status)).toBe(true);
    }
    for (const status of ["draft", "pending_approval", "changes_requested", "rejected", "cancelled"]) {
      expect(isFinanceStageStatus(status)).toBe(false);
    }
  });

  it("[blocant] aprobatorul nu poate completa nici după semnare, finanțele nu pot înainte", () => {
    expect(canFinanceAmend({ roles: ["approver"], status: "paid" })).toBe(false);
    expect(canFinanceAmend({ roles: ["requestor"], status: "in_finance" })).toBe(false);
    expect(canFinanceAmend({ roles: ["finance"], status: "pending_approval" })).toBe(false);
    expect(canFinanceAmend({ roles: ["finance"], status: "draft" })).toBe(false);
    expect(canFinanceAmend({ roles: ["finance"], status: "approved" })).toBe(true);
    expect(canFinanceAmend({ roles: ["finance"], status: "paid" })).toBe(true);
  });
});

describe("postSignatureEdit — ce se poate completa", () => {
  it("[blocant] lista permisă e exact: linia de buget (+ notă), descrierea, nota anexelor", () => {
    expect([...FINANCE_AMENDABLE_FIELDS].sort()).toEqual(
      ["attachments_note", "budget_code_id", "budget_code_note", "end_use"].sort()
    );
  });

  it("[blocant] cererea managerului financiar trece întreagă", () => {
    const { amendment, blocked } = splitFinanceAmendment({
      budget_code_id: "b1f7c0de-0000-4000-8000-000000000001",
      budget_code_note: "linia corectă",
      end_use: "Servicii de traducere pentru atelierul din septembrie",
      attachments_note: "Act adițional nr. 2 din 12.09.2026",
    });
    expect(blocked).toEqual([]);
    expect(Object.keys(amendment).sort()).toEqual(
      ["attachments_note", "budget_code_id", "budget_code_note", "end_use"].sort()
    );
  });

  it("[blocant] sumele și tot ce ține de bani rămân blocate", () => {
    const { amendment, blocked } = splitFinanceAmendment({
      end_use: "descriere nouă",
      currency: "EUR",
      payee_iban: "MD24AG000225100013104168",
      payee_name: "Alt beneficiar SRL",
      vendor_id: "b1f7c0de-0000-4000-8000-000000000002",
      is_urgent: true,
      date_needed: "2026-10-01T00:00:00.000Z",
    });
    expect(Object.keys(amendment)).toEqual(["end_use"]);
    expect(blocked.sort()).toEqual(
      ["currency", "date_needed", "is_urgent", "payee_iban", "payee_name", "vendor_id"].sort()
    );
  });

  it("[normal] câmpurile neatinse (undefined) nu blochează un formular care retrimite tot", () => {
    const { amendment, blocked } = splitFinanceAmendment({
      end_use: "descriere",
      payee_iban: undefined,
      currency: undefined,
    });
    expect(blocked).toEqual([]);
    expect(amendment).toEqual({ end_use: "descriere" });
  });

  it("[normal] `null` e o schimbare explicită, nu un câmp neatins", () => {
    const { amendment, blocked } = splitFinanceAmendment({ budget_code_id: null, payee_name: null });
    expect(amendment).toEqual({ budget_code_id: null });
    expect(blocked).toEqual(["payee_name"]);
  });

  it("[normal] refuzul se citește în română, cu numele câmpurilor", () => {
    const msg = blockedFieldsMessage(["payee_iban", "currency"]);
    expect(msg).toContain("După semnare");
    expect(msg).toContain("payee_iban");
  });
});

describe("postSignatureEdit — cheile trimise, nu cele fabricate de validator", () => {
  it("[blocant] un câmp pe care zod-ul îl completează singur cu null NU blochează completarea", () => {
    // Regresie 22.09.2026: `updateParSchema` are `.transform()` pe payee_name/payee_bank, iar
    // transformarea rulează și pe câmpurile absente → apăreau în corpul validat ca `null`.
    // Cu lista de chei din corpul BRUT, o completare curată trece.
    const validated = {
      budget_code_id: "b1f7c0de-0000-4000-8000-000000000001",
      payee_name: null,
      payee_bank: null,
    };
    const { amendment, blocked } = splitFinanceAmendment(validated, ["budget_code_id"]);
    expect(blocked).toEqual([]);
    expect(amendment).toEqual({ budget_code_id: "b1f7c0de-0000-4000-8000-000000000001" });
  });

  it("[blocant] dacă beneficiarul CHIAR a fost trimis, rămâne blocat", () => {
    const { blocked } = splitFinanceAmendment(
      { end_use: "x", payee_name: "Alt beneficiar" },
      ["end_use", "payee_name"]
    );
    expect(blocked).toEqual(["payee_name"]);
  });

  it("[normal] o cheie necunoscută, pe care zod-ul o taie, tot se refuză", () => {
    const { blocked } = splitFinanceAmendment({ end_use: "x" }, ["end_use", "total_estimated_cents"]);
    expect(blocked).toEqual(["total_estimated_cents"]);
  });
});
