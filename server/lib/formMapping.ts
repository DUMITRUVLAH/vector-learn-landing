/**
 * FORMS-001 — Funcții pure de mapare câmp→lead și validare
 *
 * Fără dependențe de DB — pot fi testate izolat în vitest.
 */

export interface FieldDef {
  id: string;
  leadMapping: string | null | undefined;
  required: boolean;
  hidden?: boolean | null;
}

export interface MappedLead {
  fullName?: string;
  phone?: string;
  email?: string;
  interestCourse?: string;
  tags: string[];
}

/**
 * Transformă răspunsurile unui formular în date de lead, pe baza `leadMapping` al fiecărui câmp.
 *
 * @param fields  - definiția câmpurilor formularului (cu leadMapping setat)
 * @param answers - { [fieldId]: value } — valorile completate de vizitator
 * @returns obiect parțial de lead + lista de taguri
 */
export function mapAnswersToLead(
  fields: FieldDef[],
  answers: Record<string, unknown>
): MappedLead {
  const result: MappedLead = { tags: [] };

  for (const field of fields) {
    const rawValue = answers[field.id];
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;

    const value = String(rawValue).trim();
    if (!value) continue;

    switch (field.leadMapping) {
      case "fullName":
        result.fullName = value;
        break;
      case "phone":
        result.phone = value;
        break;
      case "email":
        result.email = value;
        break;
      case "interestCourse":
        result.interestCourse = value;
        break;
      case "tag":
        // Un câmp cu leadMapping=tag adaugă valoarea ca tag
        result.tags.push(value);
        break;
      case "none":
      default:
        // fără mapare explicită — datele se stochează doar în form_submissions.answers
        break;
    }
  }

  return result;
}

/**
 * Validează că toate câmpurile `required` au un răspuns non-gol.
 *
 * @param fields  - definiția câmpurilor cu flag `required`
 * @param answers - răspunsurile vizitatorului
 * @returns array de fieldId-uri care lipsesc (gol = totul OK)
 */
export function validateRequired(
  fields: FieldDef[],
  answers: Record<string, unknown>
): string[] {
  const missing: string[] = [];

  for (const field of fields) {
    if (!field.required) continue;
    const value = answers[field.id];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      missing.push(field.id);
    }
  }

  return missing;
}
