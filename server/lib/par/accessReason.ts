/**
 * DE CE nu poate fi deschisă o cerere PAR.
 *
 * Toate căile de citire răspund 404 `not_found` — intenționat, ca un ID din alt workspace să nu
 * fie confirmat printr-un 403. Problema e că utilizatorul primea DOAR codul `not_found`, care nu
 * spune nimic: incidentul real (2026-08-28) a fost un link din emailul de notificare deschis
 * într-o sesiune logată în ALT workspace — cererea exista, sesiunea era greșită, iar ecranul zicea
 * doar „not_found".
 *
 * Aici construim motivul, cu grijă la ce divulgăm:
 *  - `other_workspace`          — cererea e în alt workspace ȘI utilizatorul are cont acolo cu
 *                                 același email ⇒ îi spunem numele workspace-ului, e al lui.
 *  - `other_workspace_no_account` — cererea e în alt workspace, dar emailul curent nu are cont
 *                                 acolo ⇒ spunem doar „alt workspace", fără nume. Un uuid v4 e
 *                                 neghicibil, deci confirmarea existenței lui nu divulgă date.
 *  - `unknown_id`               — nu există nicăieri (sau id invalid).
 *  - restul                     — cererea e în workspace-ul curent, dar drepturile nu ajung.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { parRequests } from "../../db/schema/par";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";

export type ParDenialReason =
  | "other_workspace"
  | "other_workspace_no_account"
  | "unknown_id"
  | "not_requestor"
  | "draft_private"
  | "out_of_scope"
  | "module_disabled";

export interface ParDenial {
  error: "not_found";
  reason: ParDenialReason;
  /** Emailul contului cu care e deschisă sesiunea — ca omul să vadă „cu ce cont sunt". */
  currentEmail: string | null;
  /** Numele workspace-ului sesiunii curente. */
  currentWorkspace: string | null;
  /** Numele workspace-ului care deține cererea. DOAR pentru `other_workspace`. */
  workspace?: string;
}

interface DenialUser {
  id: string;
  email: string | null;
  tenantId: string;
}

async function tenantName(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row?.name ?? null;
}

/** Motivul pentru o cerere care ESTE în workspace-ul curent, dar nu poate fi citită. */
export async function parDenial(
  user: DenialUser,
  reason: Exclude<ParDenialReason, "other_workspace" | "other_workspace_no_account">
): Promise<ParDenial> {
  return {
    error: "not_found",
    reason,
    currentEmail: user.email ?? null,
    currentWorkspace: await tenantName(user.tenantId),
  };
}

/**
 * Motivul pentru o cerere care NU s-a găsit în workspace-ul curent: fie e în altul (cazul
 * linkului din email), fie id-ul nu există deloc. Nu aruncă niciodată — dacă interogările de
 * diagnostic pică, rămâne `unknown_id`, adică exact comportamentul de dinainte.
 */
export async function explainMissingPar(user: DenialUser, parId: string): Promise<ParDenial> {
  const base: ParDenial = {
    error: "not_found",
    reason: "unknown_id",
    currentEmail: user.email ?? null,
    currentWorkspace: null,
  };
  try {
    base.currentWorkspace = await tenantName(user.tenantId);

    const [owner] = await db
      .select({ tenantId: parRequests.tenantId })
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), ne(parRequests.tenantId, user.tenantId)));
    if (!owner) return base;

    const email = user.email?.trim().toLowerCase();
    if (email) {
      const [twin] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, owner.tenantId),
            sql`lower(${users.email}) = ${email}`
          )
        );
      if (twin) {
        return {
          ...base,
          reason: "other_workspace",
          workspace: (await tenantName(owner.tenantId)) ?? undefined,
        };
      }
    }
    return { ...base, reason: "other_workspace_no_account" };
  } catch {
    return base;
  }
}
