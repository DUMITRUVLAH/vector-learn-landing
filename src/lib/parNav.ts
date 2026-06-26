/**
 * PAR navigation base resolver.
 *
 * PAR pages are reachable under two roots:
 *   /business/par/*  — inside the dedicated Business-Suite PAR section (ParShell)
 *   /app/par/*       — the legacy/standalone root (CRM AppShell)
 *
 * In-PAR navigation (row clicks, "Cerere nouă", detail back-links, duplicate) must
 * STAY in whichever root the user is in — otherwise a click inside /business/par/*
 * ejects them into the /app/par/* CRM shell, defeating the dedicated section.
 *
 * `parBase(path)` returns the active root for the current router path; `parHref`
 * builds a full path under it. Pass `useRouter().path` (it carries the hash route).
 */
export function parBase(path: string): "/business/par" | "/app/par" {
  return path.startsWith("/business/par") ? "/business/par" : "/app/par";
}

/** Build an in-PAR href under the active root. `sub` may be "" (root), "new", or an id. */
export function parHref(path: string, sub = ""): string {
  const base = parBase(path);
  return sub ? `${base}/${sub}` : base;
}

/** Extract the PAR id from a detail path under either root (/app/par/:id or /business/par/:id). */
export function parIdFromPath(path: string): string {
  return path.replace(/^\/(?:app|business)\/par\//, "").split(/[/?]/)[0];
}
