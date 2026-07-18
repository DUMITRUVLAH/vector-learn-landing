import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { parPayerMembers, parPayerModules, parPayers } from "../../db/schema/par";

type ScopeExecutor = Pick<typeof db, "select" | "insert">;

function parseScope(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Apply the payer scope carried by an invitation inside the same transaction as role creation. */
export async function grantInvitePayerScope(
  executor: ScopeExecutor,
  invite: { tenantId: string; payerScope: string | null },
  userId: string,
): Promise<void> {
  let payerIds = parseScope(invite.payerScope);
  if (!payerIds.length) {
    const enabled = await executor.select({ payerId: parPayerModules.payerId }).from(parPayerModules).where(and(
      eq(parPayerModules.tenantId, invite.tenantId), eq(parPayerModules.moduleKey, "par"), eq(parPayerModules.enabled, true),
    ));
    payerIds = enabled.map((row) => row.payerId);
  }
  if (!payerIds.length) return;
  const valid = await executor.select({ id: parPayers.id }).from(parPayers).where(and(
    eq(parPayers.tenantId, invite.tenantId), inArray(parPayers.id, payerIds), eq(parPayers.active, true),
  ));
  if (!valid.length) return;
  await executor.insert(parPayerMembers).values(valid.map((payer) => ({
    tenantId: invite.tenantId, payerId: payer.id, userId,
  }))).onConflictDoNothing();
}
