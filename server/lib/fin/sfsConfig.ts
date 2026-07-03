/**
 * STMT-003: Shared SFS configuration loader.
 * Extracted from server/routes/finEinvoices.ts (was a private function).
 * Exported so both finEinvoices.ts and finStatement.ts can reuse it without duplication.
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { finSfsSettings } from "../../db/schema/finEinvoices";
import { decrypt } from "../crypto";
import type { EfacturaMdConfig } from "../efacturaMoldova";

export async function loadSfsConfig(
  tenantId: string
): Promise<{ config: EfacturaMdConfig; settings: typeof finSfsSettings.$inferSelect } | null> {
  const rows = await db
    .select()
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, tenantId))
    .limit(1);

  if (rows.length === 0) return null;

  const s = rows[0];
  const hasCredentials = !!(s.usernameEncrypted && s.passwordEncrypted);

  const config: EfacturaMdConfig = {
    endpoint: "https://efactura-api.sfs.md/Service.svc",
    username: hasCredentials ? decrypt(s.usernameEncrypted!) : "",
    password: hasCredentials ? decrypt(s.passwordEncrypted!) : "",
    supplierIdno: s.idno,
    supplierBankAccount: s.bankAccount,
    // mock when: environment=mock OR no credentials
    mock: s.environment === "mock" || !hasCredentials,
  };

  return { config, settings: s };
}
