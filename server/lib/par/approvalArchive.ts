/**
 * Arhivarea deciziilor de aprobare înainte ca lanțul să fie șters.
 *
 * SECURITY / AUDIT (audit 2026-08-29): la `reopen`, `withdraw` și la re-trimiterea după
 * „modificări cerute", codul făcea `DELETE FROM par_approvals` — adică semnăturile deja date
 * (cine, când, cu ce comentariu) dispăreau definitiv. Într-un sistem de controale financiare,
 * întrebarea „cine a aprobat versiunea anterioară a acestei cereri de 500.000?" trebuie să aibă
 * un răspuns; după ștergere nu mai avea niciunul.
 *
 * Nu schimbăm schema (un `superseded` în enum ar cere migrare pe o tabelă vie): serializăm
 * deciziile REALE în `par_audit`, care e append-only și n-are rută de UPDATE/DELETE. Lanțul
 * curent rămâne ștears, ca regenerarea la re-trimitere să funcționeze exact ca înainte.
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db/client";
import { parApprovals, parAudit } from "../../db/schema/par";

/**
 * Scrie în audit deciziile luate până acum pe această cerere. Se apelează ÎNAINTE de ștergerea
 * lanțului. Fără decizii (doar pași `pending`) nu scrie nimic — nu poluăm jurnalul cu zgomot.
 */
export async function archiveApprovalsBeforeReset(
  tenantId: string,
  parId: string,
  actorUserId: string | null,
  reason: "reopen" | "withdraw" | "resubmit"
): Promise<number> {
  const decided = await db
    .select({
      step: parApprovals.step,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      decision: parApprovals.decision,
      decidedAt: parApprovals.decidedAt,
      comment: parApprovals.comment,
      signatureName: parApprovals.signatureName,
    })
    .from(parApprovals)
    .where(and(
      eq(parApprovals.parId, parId),
      eq(parApprovals.tenantId, tenantId),
      ne(parApprovals.decision, "pending"),
    ));

  if (decided.length === 0) return 0;

  await db.insert(parAudit).values({
    tenantId,
    parId,
    actorUserId,
    event: "approvals_superseded",
    detail:
      `${decided.length} decizii de aprobare au fost anulate (${reason}). Sunt păstrate integral în diff.`,
    diff: JSON.stringify({
      reason,
      supersededAt: new Date().toISOString(),
      approvals: decided.map((row) => ({
        ...row,
        decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      })),
    }),
  });
  return decided.length;
}
