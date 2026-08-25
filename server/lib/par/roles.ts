/**
 * Pure role predicates for PAR. Kept free of DB imports so unit tests (and any pure caller) can
 * use them without booting a database client.
 */

/** Workspace-level admins keep the support view over everything, including others' drafts. */
export function isWorkspaceAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}
