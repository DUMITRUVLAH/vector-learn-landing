/**
 * Shared @hono/zod-validator failure hook.
 *
 * Without a hook, zod-validator's default response is the raw ZodError — the client
 * (src/lib/api.ts) can only surface that as ONE generic, unscoped message (e.g. "String must
 * contain at most 300 character(s)"), with no way to say which field is wrong or highlight it
 * inline. Reformat into `{error: "validation_failed", errors: [{field, message}]}`, the shape
 * PAR's ParCreateForm.tsx (and any other form using the same ApiError.details convention)
 * already knows how to map onto per-field errors.
 */
import type { Context } from "hono";
import type { ZodError } from "zod";

export function zodFieldErrorsHook(
  result: { success: boolean; error?: ZodError },
  c: Context,
) {
  if (result.success || !result.error) return;
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "form",
    message: issue.message,
  }));
  return c.json({ error: "validation_failed", errors }, 400);
}
