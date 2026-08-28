/**
 * PLATFORM-403 — impersonare pentru superadminul platformei („intră în contul lui X").
 *
 * De ce există: proprietarul platformei e și testerul ei. Când un client spune „nu merge",
 * singurul mod onest de a-l crede e să vezi EXACT ecranul lui — cu datele lui, rolurile lui și
 * erorile lui — nu o reconstituire din memorie. Până acum asta cerea parola clientului.
 *
 * Cum funcționează: se creează o sesiune NOUĂ pe utilizatorul-țintă, marcată
 * `impersonated_by_user_id = <superadmin>`, iar tokenul sesiunii proprii a superadminului e
 * păstrat pe rândul respectiv (`impersonator_token`), ca ieșirea să-l repună în contul lui fără
 * re-logare. Nimic nu se schimbă în contul clientului: nu i se atinge parola, nu i se închid
 * sesiunile, nu se scrie nimic în contul lui doar prin intrare.
 *
 * Limite deliberate (o unealtă de suport, nu o portiță):
 *  - doar superadmin de platformă poate porni (vezi requirePlatformAdmin);
 *  - nu se poate impersona alt superadmin și nici tine însuți;
 *  - o sesiune de impersonare NU poate porni alta (fără lanțuri);
 *  - durata e scurtă (60 min) și expiră singură;
 *  - START și STOP se scriu în `platform_audit_log`, cu cine, pe cine și de pe ce IP.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users, type User } from "../db/schema";
import { platformAdmins } from "../db/schema/par";
import { createSession, dropCachedSession } from "../auth/session";

/** O sesiune de testare nu are de ce să trăiască o lună ca una obișnuită. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000;

export type ImpersonationRefusal =
  | "target_not_found"
  | "target_is_self"
  | "target_is_platform_admin"
  | "target_disabled"
  | "already_impersonating";

export interface ImpersonationStart {
  token: string;
  expiresAt: Date;
  target: User;
}

/** Sesiunea curentă e una de impersonare? Întoarce rândul, ca apelantul să aibă și tokenul de întoarcere. */
export async function getImpersonationSession(token: string) {
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      impersonatedByUserId: sessions.impersonatedByUserId,
      impersonatorToken: sessions.impersonatorToken,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.token, token));
  if (!row?.impersonatedByUserId) return null;
  return row;
}

export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, userId));
  return !!row;
}

/**
 * Deschide o sesiune de impersonare pe `targetUserId`.
 * Întoarce refuzul motivat (nu aruncă) — ruta îl mapează pe cod HTTP.
 */
export async function startImpersonation(params: {
  actor: User;
  actorSessionToken: string;
  targetUserId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ImpersonationStart | { refused: ImpersonationRefusal }> {
  const { actor, actorSessionToken, targetUserId } = params;

  // Fără lanțuri de impersonare: dintr-o sesiune împrumutată nu se mai împrumută alta.
  if (await getImpersonationSession(actorSessionToken)) return { refused: "already_impersonating" };
  if (targetUserId === actor.id) return { refused: "target_is_self" };

  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) return { refused: "target_not_found" };
  if (target.isActive === false) return { refused: "target_disabled" };
  // Un superadmin nu intră în contul altui superadmin: acolo nu e nimic de testat din
  // perspectiva clientului, dar ar fi o cale de escaladare între administratori.
  if (await isPlatformAdminUser(target.id)) return { refused: "target_is_platform_admin" };

  const { token } = await createSession(target.id, {
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  await db
    .update(sessions)
    .set({ impersonatedByUserId: actor.id, impersonatorToken: actorSessionToken, expiresAt })
    .where(eq(sessions.token, token));
  // `createSession` a scris deja rândul; cache-ul de sesiuni s-ar putea să fi prins versiunea
  // fără marcaj dacă ceva a citit-o între timp.
  dropCachedSession(token);

  return { token, expiresAt, target };
}

export interface ImpersonationStop {
  /** Tokenul superadminului, dacă sesiunea lui e încă validă — altfel trebuie re-logare. */
  restoredToken: string | null;
  restoredExpiresAt: Date | null;
  actorUserId: string;
  targetUserId: string;
}

/** Închide sesiunea de impersonare și, dacă se mai poate, repune sesiunea superadminului. */
export async function stopImpersonation(currentToken: string): Promise<ImpersonationStop | null> {
  const row = await getImpersonationSession(currentToken);
  if (!row) return null;

  let restoredToken: string | null = null;
  let restoredExpiresAt: Date | null = null;
  if (row.impersonatorToken) {
    const [original] = await db
      .select({ token: sessions.token, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.token, row.impersonatorToken), eq(sessions.userId, row.impersonatedByUserId!)));
    if (original && original.expiresAt.getTime() > Date.now()) {
      restoredToken = original.token;
      restoredExpiresAt = original.expiresAt;
    }
  }

  await db.delete(sessions).where(eq(sessions.id, row.id));
  dropCachedSession(currentToken);

  return {
    restoredToken,
    restoredExpiresAt,
    actorUserId: row.impersonatedByUserId!,
    targetUserId: row.userId,
  };
}
