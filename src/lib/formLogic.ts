/**
 * FORMS-004 — Funcții pure pentru logica condițională a formularelor.
 *
 * Fără dependențe React sau DB — testabile izolat în vitest.
 */

export type LogicOperator =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "lt"
  | "is_empty"
  | "is_not_empty";

export interface LogicCondition {
  operator: LogicOperator;
  value?: string | number;
}

export type LogicAction = "jump_to_field" | "jump_to_end";

export interface FormLogicRule {
  id: string;
  formId: string;
  fromFieldId: string;
  condition: LogicCondition;
  action: LogicAction;
  targetFieldId: string | null;
  position: number;
}

export interface FieldRef {
  id: string;
  position: number;
}

// ─── evaluateCondition ────────────────────────────────────────────────────────

/**
 * Evaluează dacă răspunsul `answer` satisface condiția `condition`.
 *
 * @param condition - regula de condiție
 * @param answer    - răspunsul curent al câmpului (poate fi orice tip)
 * @returns true dacă condiția e satisfăcută
 */
export function evaluateCondition(
  condition: LogicCondition,
  answer: unknown
): boolean {
  const { operator, value } = condition;

  const strAnswer = String(answer ?? "").trim();
  const isEmpty = answer === undefined || answer === null || strAnswer === "";

  switch (operator) {
    case "is_empty":
      return isEmpty;

    case "is_not_empty":
      return !isEmpty;

    case "eq":
      if (isEmpty) return false;
      if (value === undefined || value === null) return false;
      return strAnswer.toLowerCase() === String(value).toLowerCase();

    case "neq":
      if (isEmpty) return true; // gol ≠ orice valoare
      if (value === undefined || value === null) return true;
      return strAnswer.toLowerCase() !== String(value).toLowerCase();

    case "contains":
      if (isEmpty || value === undefined || value === null) return false;
      return strAnswer.toLowerCase().includes(String(value).toLowerCase());

    case "gt": {
      if (isEmpty || value === undefined || value === null) return false;
      const num = parseFloat(strAnswer);
      const threshold = typeof value === "number" ? value : parseFloat(String(value));
      return !isNaN(num) && !isNaN(threshold) && num > threshold;
    }

    case "lt": {
      if (isEmpty || value === undefined || value === null) return false;
      const num = parseFloat(strAnswer);
      const threshold = typeof value === "number" ? value : parseFloat(String(value));
      return !isNaN(num) && !isNaN(threshold) && num < threshold;
    }

    default:
      return false;
  }
}

// ─── getNextFieldIndex ────────────────────────────────────────────────────────

/**
 * Calculează indexul câmpului următor în `visibleFields`, ținând cont de regulile de logică.
 *
 * @param currentIdx    - indexul curent în `visibleFields`
 * @param visibleFields - câmpurile vizibile (non-hidden), ordonate
 * @param rules         - regulile de logică ale formularului
 * @param answers       - răspunsurile curente
 * @returns indexul câmpului următor, sau "end" dacă formularul trebuie finalizat
 */
export function getNextFieldIndex(
  currentIdx: number,
  visibleFields: FieldRef[],
  rules: FormLogicRule[],
  answers: Record<string, unknown>
): number | "end" {
  const currentField = visibleFields[currentIdx];
  if (!currentField) return "end";

  const currentAnswer = answers[currentField.id];

  // Ia regulile pentru câmpul curent, ordonate după position
  const relevantRules = rules
    .filter((r) => r.fromFieldId === currentField.id)
    .sort((a, b) => a.position - b.position);

  for (const rule of relevantRules) {
    if (evaluateCondition(rule.condition, currentAnswer)) {
      if (rule.action === "jump_to_end") {
        return "end";
      }
      if (rule.action === "jump_to_field" && rule.targetFieldId) {
        const targetIdx = visibleFields.findIndex((f) => f.id === rule.targetFieldId);
        if (targetIdx >= 0) return targetIdx;
      }
    }
  }

  // Nicio regulă aplicată → câmpul următor natural
  const nextIdx = currentIdx + 1;
  return nextIdx >= visibleFields.length ? "end" : nextIdx;
}
