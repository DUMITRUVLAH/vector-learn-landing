/**
 * AI-A01 — GDPR-safe pseudonymization layer
 *
 * Replaces personal names and other identifiers with tokens before sending
 * text to any external LLM. Supports round-trip (pseudonymize + depseudonymize).
 *
 * Usage:
 *   const { text, tokenMap } = pseudonymize("Maria a venit la lecție.", ["Maria"]);
 *   // text = "[PERSON_1] a venit la lecție."
 *   const original = depseudonymize(text, tokenMap);
 *   // original = "Maria a venit la lecție."
 */

export interface PseudonymizeResult {
  text: string;
  tokenMap: Record<string, string>; // { "[PERSON_1]": "Maria", ... }
}

/**
 * Replace each name in `names` with a positional token [PERSON_N] in `text`.
 * Case-insensitive matching. Sorts names by length (longest first) to avoid
 * partial replacement of compound names.
 */
export function pseudonymize(text: string, names: string[]): PseudonymizeResult {
  const tokenMap: Record<string, string> = {};
  let result = text;
  let counter = 1;

  // Sort by descending length to handle "Maria Popescu" before "Maria"
  const sortedNames = [...new Set(names.filter((n) => n.trim().length > 0))].sort(
    (a, b) => b.length - a.length
  );

  for (const name of sortedNames) {
    const token = `[PERSON_${counter}]`;
    // Escape special regex chars in name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Replace all case-insensitive occurrences
    const regex = new RegExp(escaped, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, token);
      tokenMap[token] = name;
      counter++;
    }
  }

  return { text: result, tokenMap };
}

/**
 * Reverse the pseudonymization: replace tokens back with original names.
 */
export function depseudonymize(
  text: string,
  tokenMap: Record<string, string>
): string {
  let result = text;
  // Replace tokens in order (token strings are unique so order doesn't matter)
  for (const [token, name] of Object.entries(tokenMap)) {
    // Escape brackets in token for regex
    const escaped = token.replace(/[[\]]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), name);
  }
  return result;
}

/**
 * Extract a flat list of names from common data shapes for convenience.
 * Pass this to pseudonymize() before sending to LLM.
 */
export function extractNames(...args: Array<string | null | undefined>): string[] {
  return args.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
}
