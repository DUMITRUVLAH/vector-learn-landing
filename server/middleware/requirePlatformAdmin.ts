import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformAdmins } from "../db/schema/par";
import { users } from "../db/schema";
import { isPlatformOwnerEmail } from "../lib/platformOwner";
import type { AuthVariables } from "./requireAuth";

/**
 * Superadmin al platformei: rând în `platform_admins` SAU email de proprietar
 * (vezi lib/platformOwner). Pentru proprietar rândul se materializează la prima
 * accesare, ca restul codului să poată citi doar tabela.
 */
export const requirePlatformAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  const [admin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, user.id));
  if (admin) {
    await next();
    return;
  }
  if (isPlatformOwnerEmail(user.email)) {
    // SECURITY (audit 2026-08-29): fallback-ul pe email e strict de BOOTSTRAP. Scopul lui e
    // ca proprietarul să-și poată deschide consola fără un INSERT manual în Supabase — atât.
    // De îndată ce există MĂCAR UN rând în `platform_admins`, bootstrap-ul s-a consumat și
    // singura autoritate rămâne tabela. Fără asta, oricine reușea să creeze un cont cu emailul
    // proprietarului (vezi lib/platformOwner) devenea superadmin oricând, nu doar la început.
    let bootstrapConsumed = false;
    let ownerRow: { id: string } | undefined;
    try {
      const existing = await db.select({ id: platformAdmins.id }).from(platformAdmins).limit(1);
      bootstrapConsumed = existing.length > 0;
      ownerRow = existing[0];
    } catch (e) {
      // Tabelă lipsă imediat după deploy: tratăm ca „încă neinițializat" ca proprietarul să
      // poată intra exact în unealta cu care repară situația.
      console.warn("[requirePlatformAdmin] platform_admins unreadable:", e instanceof Error ? e.message : e);
    }
    if (bootstrapConsumed) {
      console.warn(
        `[requirePlatformAdmin] REFUZ: ${user.email} (user ${user.id}, tenant ${user.tenantId}) a cerut acces de ` +
          `superadmin pe baza emailului, dar platform_admins e deja inițializat (${ownerRow?.id}). ` +
          `Dacă nu ești tu, cineva a creat un cont cu emailul tău într-un alt workspace.`
      );
      return c.json({ error: "platform_admin_required" }, 403);
    }
    // A doua verificare: emailul rezervat trebuie să existe într-un SINGUR cont. Mai multe
    // conturi cu același email (posibil doar prin alt tenant) înseamnă că cineva a încercat
    // deja revendicarea — refuzăm și lăsăm urmă, în loc să ghicim care e cel bun.
    try {
      const claimants = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email.trim().toLowerCase()));
      if (claimants.length > 1) {
        console.error(
          `[requirePlatformAdmin] ALERTĂ: ${claimants.length} conturi folosesc emailul rezervat ${user.email}. ` +
            `Bootstrap-ul de superadmin e blocat până când rămâne unul singur.`
        );
        return c.json({ error: "platform_admin_required" }, 403);
      }
    } catch (e) {
      console.warn("[requirePlatformAdmin] claimant check skipped:", e instanceof Error ? e.message : e);
    }
    // Best-effort: dacă inserarea eșuează (tabelă lipsă imediat după deploy), accesul
    // rămâne acordat pe baza emailului — altfel proprietarul ar fi blocat afară din
    // exact unealta cu care ar repara situația.
    try {
      await db.insert(platformAdmins).values({ userId: user.id }).onConflictDoNothing();
    } catch (e) {
      console.warn("[requirePlatformAdmin] owner self-provision skipped:", e instanceof Error ? e.message : e);
    }
    await next();
    return;
  }
  return c.json({ error: "platform_admin_required" }, 403);
};
