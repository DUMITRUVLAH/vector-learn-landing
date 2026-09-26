/**
 * Echipa workspace-ului — oamenii cărora li se poate atribui ceva.
 *
 * Montat la /api/team (app.ts).
 *
 * GET /api/team/members — [{ id, fullName, email, role }]
 *
 * De ce exista ruta asta în client, dar nu și pe server: `useTeamMembers` (folosit de fișa
 * leadului, de tabla de leaduri, de „Astăzi" și de „Comunicare") cerea `/api/team/members`, care
 * NU era montată. Cererea cădea pe fallback-ul SPA, hook-ul rămânea cu o listă goală, iar toate
 * ecranele CRM scriau „—" în loc de numele responsabilului — inclusiv acolo unde omul trebuia
 * să ALEAGĂ un responsabil dintr-o listă care era mereu goală. Nimic nu se vedea ca eroare:
 * o listă goală arată exact ca o echipă fără oameni.
 *
 * Cine intră în listă: utilizatorii workspace-ului, FĂRĂ `student` și `parent`. Nu e o
 * restricție de securitate (sunt oricum ai aceluiași tenant), ci una de sens: un lead nu se
 * atribuie unui părinte, iar un selector cu 400 de elevi nu e un selector.
 */
import { Hono } from "hono";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const teamRoutes = new Hono<{ Variables: AuthVariables }>();
teamRoutes.use("/*", requireAuth);

/** Rolurile care NU sunt „echipă": conturi de beneficiar, nu de lucru. */
const NON_STAFF_ROLES: ("student" | "parent")[] = ["student", "parent"];

teamRoutes.get("/members", async (c) => {
  const user = c.get("user");
  try {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(
        and(eq(users.tenantId, user.tenantId), notInArray(users.role, NON_STAFF_ROLES), eq(users.isActive, true))
      )
      .orderBy(asc(users.name));

    // Un lead nu se atribuie cuiva scos din CRM sau cu contul dezactivat (CRM → Echipă): n-ar
    // mai avea cum să-l vadă.
    const revoked = new Set(
      (
        await db
          .select({ userId: crmUserPermissions.userId })
          .from(crmUserPermissions)
          .where(
            and(
              eq(crmUserPermissions.tenantId, user.tenantId),
              eq(crmUserPermissions.permission, "crm.access"),
              eq(crmUserPermissions.granted, false)
            )
          )
          .catch(() => [])
      ).map((r) => r.userId)
    );

    // `fullName`, nu `name`: forma o dictează clientul care exista deja (`src/lib/api/team.ts`).
    return c.json(
      rows
        .filter((r) => r.role === "admin" || !revoked.has(r.id))
        .map((r) => ({ id: r.id, fullName: r.name ?? r.email, email: r.email, role: r.role }))
    );
  } catch (e) {
    // Un selector de oameni nu are voie să dărâme ecranul pe care stă: fără listă, restul fișei
    // rămâne folosibil (regula „degradează în gol, nu în 500" din CLAUDE.md).
    console.error("[team/members] eșec:", e instanceof Error ? e.message : e);
    return c.json([]);
  }
});
