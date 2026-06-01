/**
 * FORMS-004 — Logică condițională tests
 *
 * T-FORMS-004-2 [blocant]: evaluateCondition — operator "eq" correct
 * T-FORMS-004-3 [blocant]: getNextFieldIndex — cu regulă eq:Da → returnează index target; fără → default +1
 * T-FORMS-004-5 [normal]:  evaluateCondition — operators: neq, contains, gt, lt, is_empty, is_not_empty
 * T-FORMS-004-6 [normal]:  getNextFieldIndex → "end" când target lipsește sau regulă jump_to_end
 * T-FORMS-004-9 [blocant]: tipuri exportate corect (FormLogicRule, evaluateCondition, getNextFieldIndex)
 */
import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  getNextFieldIndex,
  type FormLogicRule,
  type FieldRef,
} from "../../lib/formLogic";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeField(id: string, position: number): FieldRef {
  return { id, position };
}

function makeRule(overrides: Partial<FormLogicRule>): FormLogicRule {
  return {
    id: "rule-1",
    formId: "form-1",
    fromFieldId: "field-1",
    condition: { operator: "eq", value: "Nu" },
    action: "jump_to_field",
    targetFieldId: "field-3",
    position: 0,
    ...overrides,
  };
}

// ─── evaluateCondition tests ──────────────────────────────────────────────────

describe("FORMS-004 — evaluateCondition", () => {
  it("T-FORMS-004-2a [blocant]: eq: answer matches value → true", () => {
    expect(evaluateCondition({ operator: "eq", value: "Nu" }, "Nu")).toBe(true);
    expect(evaluateCondition({ operator: "eq", value: "Da" }, "Da")).toBe(true);
  });

  it("T-FORMS-004-2b [blocant]: eq: answer does not match → false", () => {
    expect(evaluateCondition({ operator: "eq", value: "Nu" }, "Da")).toBe(false);
    expect(evaluateCondition({ operator: "eq", value: "Nu" }, "")).toBe(false);
  });

  it("T-FORMS-004-2c [blocant]: eq is case-insensitive", () => {
    expect(evaluateCondition({ operator: "eq", value: "da" }, "Da")).toBe(true);
    expect(evaluateCondition({ operator: "eq", value: "DA" }, "da")).toBe(true);
  });

  it("T-FORMS-004-5a [normal]: neq: different value → true", () => {
    expect(evaluateCondition({ operator: "neq", value: "Nu" }, "Da")).toBe(true);
    expect(evaluateCondition({ operator: "neq", value: "Nu" }, "Nu")).toBe(false);
  });

  it("T-FORMS-004-5b [normal]: contains: value in answer → true", () => {
    expect(evaluateCondition({ operator: "contains", value: "test" }, "am testat ceva")).toBe(true);
    expect(evaluateCondition({ operator: "contains", value: "xyz" }, "am testat ceva")).toBe(false);
  });

  it("T-FORMS-004-5c [normal]: gt: number comparison", () => {
    expect(evaluateCondition({ operator: "gt", value: 5 }, "10")).toBe(true);
    expect(evaluateCondition({ operator: "gt", value: 5 }, "3")).toBe(false);
    expect(evaluateCondition({ operator: "gt", value: 5 }, "5")).toBe(false);
  });

  it("T-FORMS-004-5d [normal]: lt: number comparison", () => {
    expect(evaluateCondition({ operator: "lt", value: 10 }, "5")).toBe(true);
    expect(evaluateCondition({ operator: "lt", value: 10 }, "15")).toBe(false);
  });

  it("T-FORMS-004-5e [normal]: is_empty: empty/undefined/null → true", () => {
    expect(evaluateCondition({ operator: "is_empty" }, "")).toBe(true);
    expect(evaluateCondition({ operator: "is_empty" }, undefined)).toBe(true);
    expect(evaluateCondition({ operator: "is_empty" }, null)).toBe(true);
    expect(evaluateCondition({ operator: "is_empty" }, "ceva")).toBe(false);
  });

  it("T-FORMS-004-5f [normal]: is_not_empty: non-empty → true", () => {
    expect(evaluateCondition({ operator: "is_not_empty" }, "ceva")).toBe(true);
    expect(evaluateCondition({ operator: "is_not_empty" }, "")).toBe(false);
    expect(evaluateCondition({ operator: "is_not_empty" }, null)).toBe(false);
  });
});

// ─── getNextFieldIndex tests ──────────────────────────────────────────────────

describe("FORMS-004 — getNextFieldIndex", () => {
  const fields = [
    makeField("field-A", 0),
    makeField("field-B", 1),
    makeField("field-C", 2),
  ];

  it("T-FORMS-004-3a [blocant]: regulă eq:Da pe field-A → returnează index B (1)", () => {
    const rules = [makeRule({
      fromFieldId: "field-A",
      condition: { operator: "eq", value: "Da" },
      action: "jump_to_field",
      targetFieldId: "field-C",
    })];
    const answers = { "field-A": "Da" };
    const result = getNextFieldIndex(0, fields, rules, answers);
    // field-C is at index 2
    expect(result).toBe(2);
  });

  it("T-FORMS-004-3b [blocant]: regulă nu se aplică (answer ≠ value) → default +1", () => {
    const rules = [makeRule({
      fromFieldId: "field-A",
      condition: { operator: "eq", value: "Da" },
      action: "jump_to_field",
      targetFieldId: "field-C",
    })];
    const answers = { "field-A": "Nu" }; // nu se aplică regula
    const result = getNextFieldIndex(0, fields, rules, answers);
    expect(result).toBe(1); // default +1
  });

  it("T-FORMS-004-6a [normal]: jump_to_end returnează 'end'", () => {
    const rules = [makeRule({
      fromFieldId: "field-A",
      condition: { operator: "eq", value: "Nu" },
      action: "jump_to_end",
      targetFieldId: null,
    })];
    const answers = { "field-A": "Nu" };
    const result = getNextFieldIndex(0, fields, rules, answers);
    expect(result).toBe("end");
  });

  it("T-FORMS-004-6b [normal]: ultimul câmp fără regulă → 'end'", () => {
    const result = getNextFieldIndex(2, fields, [], {});
    expect(result).toBe("end");
  });

  it("T-FORMS-004-6c [normal]: câmp cu targetFieldId inexistent → default +1", () => {
    const rules = [makeRule({
      fromFieldId: "field-A",
      condition: { operator: "eq", value: "Da" },
      action: "jump_to_field",
      targetFieldId: "field-X-inexistent",
    })];
    const answers = { "field-A": "Da" };
    const result = getNextFieldIndex(0, fields, rules, answers);
    expect(result).toBe(1); // fallback la +1 când target nu există
  });

  it("T-FORMS-004-6d [normal]: regulile sunt ordonate după position", () => {
    // Două reguli pe field-A: prima (pos 0) la end, a doua (pos 1) la field-C
    // Prima care se aplică e cea cu position mai mic
    const rules = [
      makeRule({
        id: "rule-2",
        fromFieldId: "field-A",
        condition: { operator: "is_not_empty" },
        action: "jump_to_field",
        targetFieldId: "field-C",
        position: 1,
      }),
      makeRule({
        id: "rule-1",
        fromFieldId: "field-A",
        condition: { operator: "is_not_empty" },
        action: "jump_to_end",
        targetFieldId: null,
        position: 0,
      }),
    ];
    const answers = { "field-A": "orice" };
    const result = getNextFieldIndex(0, fields, rules, answers);
    // Regula cu position=0 (jump_to_end) ar trebui să câștige
    expect(result).toBe("end");
  });
});

describe("FORMS-004 — Type exports", () => {
  it("T-FORMS-004-9 [blocant]: formLogic module exports are correct", async () => {
    const module = await import("../../lib/formLogic");
    expect(typeof module.evaluateCondition).toBe("function");
    expect(typeof module.getNextFieldIndex).toBe("function");
  });
});
