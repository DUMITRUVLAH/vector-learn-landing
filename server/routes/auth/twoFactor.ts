/**
 * AUTH-004: 2FA TOTP routes.
 *
 * POST /api/auth/2fa/setup    — generate secret + QR URI (does not enable 2FA yet)
 * POST /api/auth/2fa/enable   — verify first TOTP code, save secret, generate recovery codes
 * POST /api/auth/2fa/disable  — disable 2FA (requires password + active TOTP code)
 * POST /api/auth/2fa/verify   — complete login for a pending-2FA session
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { twoFactorSettings, sessions, users } from "../../db/schema";
import { requireAuth, type AuthVariables } from "../../middleware/requireAuth";
import { verifyPassword } from "../../auth/password";
import {
  generateTotpSecret,
  generateQrCodeUri,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  verifyRecoveryCode,
  type RecoveryCode,
} from "../../auth/twoFactor";
import { SESSION_COOKIE } from "../../auth/session";

export const twoFactorRoutes = new Hono<{ Variables: AuthVariables }>();

// ── POST /api/auth/2fa/setup ───────────────────────────────────────────────────
// Authenticated. Generates a fresh TOTP secret + QR URI. Does NOT enable 2FA.
twoFactorRoutes.post("/setup", requireAuth, async (c) => {
  const user = c.get("user");
  const secret = generateTotpSecret();
  const qrCodeUri = generateQrCodeUri(secret, user.email);
  return c.json({ qrCodeUri, secret });
});

// ── POST /api/auth/2fa/enable ──────────────────────────────────────────────────
// Authenticated. Receives the plaintext secret + TOTP code from the user's
// authenticator. If valid: encrypts + stores the secret, generates recovery codes.
twoFactorRoutes.post(
  "/enable",
  requireAuth,
  zValidator("json", z.object({ secret: z.string().min(1), code: z.string().length(6) })),
  async (c) => {
    const user = c.get("user");
    const { secret, code } = c.req.valid("json");

    if (!verifyTotpCode(secret, code)) {
      return c.json({ error: "invalid_totp_code" }, 400);
    }

    const secretEncrypted = encryptSecret(secret);
    const recoveryCodes = generateRecoveryCodes(8);
    const recoveryCodesJson = JSON.stringify(recoveryCodes);
    const enabledAt = new Date();

    await db
      .insert(twoFactorSettings)
      .values({ userId: user.id, secretEncrypted, recoveryCodesJson, enabledAt })
      .onConflictDoUpdate({
        target: twoFactorSettings.userId,
        set: { secretEncrypted, recoveryCodesJson, enabledAt, updatedAt: new Date() },
      });

    // Return recovery codes only once (front-end must display them for the user to save)
    return c.json({ ok: true, enabledAt: enabledAt.toISOString(), recoveryCodes });
  }
);

// ── POST /api/auth/2fa/disable ─────────────────────────────────────────────────
// Authenticated. Requires current password + a valid TOTP code (extra confirmation).
twoFactorRoutes.post(
  "/disable",
  requireAuth,
  zValidator("json", z.object({ password: z.string().min(1), code: z.string().length(6) })),
  async (c) => {
    const user = c.get("user");
    const { password, code } = c.req.valid("json");

    const userRow = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!userRow) return c.json({ error: "user_not_found" }, 404);

    const passwordOk = await verifyPassword(password, userRow.passwordHash);
    if (!passwordOk) return c.json({ error: "invalid_password" }, 401);

    const tfRow = await db.query.twoFactorSettings.findFirst({
      where: eq(twoFactorSettings.userId, user.id),
    });
    if (!tfRow || !tfRow.enabledAt) return c.json({ error: "2fa_not_enabled" }, 400);

    let secret: string;
    try {
      secret = decryptSecret(tfRow.secretEncrypted);
    } catch {
      return c.json({ error: "secret_decrypt_error" }, 500);
    }

    if (!verifyTotpCode(secret, code)) {
      return c.json({ error: "invalid_totp_code" }, 400);
    }

    await db.delete(twoFactorSettings).where(eq(twoFactorSettings.userId, user.id));

    return c.json({ ok: true });
  }
);

// ── POST /api/auth/2fa/verify ──────────────────────────────────────────────────
// Used after a login where 2FA is required. The session is in twoFactorPending state.
// Accepts a TOTP code OR a recovery code.
twoFactorRoutes.post(
  "/verify",
  zValidator("json", z.object({ code: z.string().min(1).max(20) })),
  async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ error: "unauthenticated" }, 401);

    // Find the pending session (twoFactorPending = true and not expired)
    const session = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
    if (!session) return c.json({ error: "session_not_found" }, 401);
    if (!session.twoFactorPending) return c.json({ error: "session_not_pending" }, 400);
    if (session.expiresAt.getTime() < Date.now()) return c.json({ error: "session_expired" }, 401);

    const tfRow = await db.query.twoFactorSettings.findFirst({
      where: eq(twoFactorSettings.userId, session.userId),
    });
    if (!tfRow || !tfRow.enabledAt) return c.json({ error: "2fa_not_configured" }, 400);

    let secret: string;
    try {
      secret = decryptSecret(tfRow.secretEncrypted);
    } catch {
      return c.json({ error: "secret_decrypt_error" }, 500);
    }

    const { code } = c.req.valid("json");
    let verified = false;

    if (code.length === 6 && /^\d+$/.test(code)) {
      // TOTP code
      verified = verifyTotpCode(secret, code);
    } else {
      // Recovery code
      const existing: RecoveryCode[] = JSON.parse(tfRow.recoveryCodesJson);
      const result = verifyRecoveryCode(existing, code);
      verified = result.valid;
      if (verified) {
        await db
          .update(twoFactorSettings)
          .set({ recoveryCodesJson: JSON.stringify(result.updatedCodes), updatedAt: new Date() })
          .where(eq(twoFactorSettings.userId, session.userId));
      }
    }

    if (!verified) return c.json({ error: "invalid_code" }, 400);

    // Mark session as no longer pending
    await db
      .update(sessions)
      .set({ twoFactorPending: false, lastActiveAt: new Date() })
      .where(eq(sessions.id, session.id));

    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (!user) return c.json({ error: "user_not_found" }, 500);

    return c.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }
);
