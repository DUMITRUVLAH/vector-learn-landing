/**
 * Denumirea și logoul organizației — antetul actelor și expeditorul e-mailurilor.
 * Mutat din routes/docs.ts (CRM-U03) ca și e-mailurile din CRM să semneze cu numele firmei.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parSettings } from "../../db/schema/par";
import { finOrgProfile } from "../../db/schema/finCore";
import { tenants } from "../../db/schema/tenants";

/** Antetul actului (denumirea și logoul organizației) — aceleași date în PDF, ZIP și e-mail. */
export async function loadOrg(tenantId: string): Promise<{ name: string | null; logoUrl: string | null }> {
  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId))
    .limit(1);
  if (settings?.orgLegalName) return { name: settings.orgLegalName, logoUrl: settings.orgLogoUrl ?? null };
  // CRM-U03: un workspace doar-CRM n-are setări PAR — numele vine din „Datele firmei" (CRM-D04),
  // apoi din numele workspace-ului. Altfel antetul PDF-ului și expeditorul e-mailului ieșeau fără firmă.
  const [profile] = await db
    .select({ legalName: finOrgProfile.legalName, logoUrl: finOrgProfile.logoUrl })
    .from(finOrgProfile)
    .where(eq(finOrgProfile.tenantId, tenantId))
    .limit(1)
    .catch(() => [] as { legalName: string; logoUrl: string | null }[]);
  const [tenant] = profile?.legalName
    ? []
    : await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return {
    name: profile?.legalName || tenant?.name || null,
    logoUrl: settings?.orgLogoUrl ?? profile?.logoUrl ?? null,
  };
}

