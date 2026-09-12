/**
 * PAR-DRIVE — conectarea contului Google și starea oglindirii în Drive.
 *
 * Rute (montate în server/app.ts):
 *   GET    /api/par/drive/status          → starea conexiunii + câte dosare sunt sincronizate
 *   GET    /api/par/drive/connect         → pornește consimțământul Google (par_admin)
 *   GET    /api/par/drive/callback        → întoarcerea de la Google; salvează refresh token-ul
 *   PATCH  /api/par/drive/settings        → pornit/oprit, ziua din săptămână, numele rădăcinii
 *   POST   /api/par/drive/sync-now        → rulează un lot acum (par_admin)
 *   POST   /api/par/drive/resync-all      → uită amprentele și reurcă tot (par_admin)
 *   POST   /api/par/drive/disconnect      → revocă token-ul și șterge conexiunea (par_admin)
 *   GET    /api/cron/par-drive/run-weekly  → intrarea cron-ului, apărată de CRON_SECRET
 *
 * Secretul (refresh token-ul) NU iese niciodată din server: `/status` spune doar dacă există o
 * conexiune și pe ce adresă de e-mail.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parDriveConnections, parDriveFiles, parDriveFolders, parRequests } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { encrypt, decrypt } from "../lib/crypto";
import { codeChallengeFromVerifier, generateCodeVerifier, generateState } from "../auth/google";
import {
  buildDriveAuthUrl,
  exchangeDriveCode,
  fetchDriveAccountEmail,
  getDriveConfig,
  revokeDriveToken,
} from "../lib/par/googleDrive";
import { runDriveSyncForTenant, runWeeklyDriveSync } from "../lib/par/driveSync";

export const parDriveRoutes = new Hono<{ Variables: AuthVariables }>();

const STATE_COOKIE = "par_drive_state";
const VERIFIER_COOKIE = "par_drive_verifier";
const COOKIE_PATH = "/api/par/drive";
const OAUTH_COOKIE_TTL_S = 600;
const SECURE_COOKIES = process.env.NODE_ENV === "production";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

/** Pagina de setări, unde se întoarce omul după Google — cu un mesaj de rezultat. */
function settingsUrl(result: string): string {
  return `${appUrl()}/#/business/par/drive?rezultat=${encodeURIComponent(result)}`;
}

// ─── Cron (fără sesiune) ─────────────────────────────────────────────────────
// Montat în afara prefixului /api/par: acolo `app.use("/api/par/*", requireAuth)` răspunde 401
// oricui n-are sesiune, iar un cron n-are cum să aibă una. Aceeași apărare ca la AUTOBILL —
// Vercel atașează singur `Authorization: Bearer <CRON_SECRET>`, iar noi respingem orice altceva.

export const parDriveCronRoutes = new Hono<{ Variables: AuthVariables }>();

parDriveCronRoutes.get("/run-weekly", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return c.json({ error: "cron_not_configured", detail: "CRON_SECRET nu e setat." }, 503);
  }
  if ((c.req.header("authorization") ?? "") !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const summaries = await runWeeklyDriveSync();
  return c.json({ ok: true, tenants: summaries.length, summaries });
});

// ─── Rute cu sesiune ─────────────────────────────────────────────────────────

parDriveRoutes.use("*", requireAuth);

/** GET /api/par/drive/status */
parDriveRoutes.get("/status", async (c) => {
  const tenantId = c.get("user").tenantId;
  const config = getDriveConfig();

  const [conn] = await db
    .select()
    .from(parDriveConnections)
    .where(eq(parDriveConnections.tenantId, tenantId));

  const [{ paidCount }] = await db
    .select({ paidCount: sql<number>`count(*)::int` })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "paid")));

  const [{ syncedCount }] = await db
    .select({ syncedCount: sql<number>`count(*)::int` })
    .from(parDriveFiles)
    .where(and(eq(parDriveFiles.tenantId, tenantId), eq(parDriveFiles.status, "synced")));

  const [{ errorCount }] = await db
    .select({ errorCount: sql<number>`count(*)::int` })
    .from(parDriveFiles)
    .where(and(eq(parDriveFiles.tenantId, tenantId), eq(parDriveFiles.status, "error")));

  return c.json({
    configured: !!config,
    connected: !!conn,
    googleEmail: conn?.googleEmail ?? null,
    rootFolderName: conn?.rootFolderName ?? "Dosare PAR plătite",
    rootFolderId: conn?.rootFolderId ?? null,
    syncEnabled: conn?.syncEnabled ?? false,
    syncDayOfWeek: conn?.syncDayOfWeek ?? 1,
    lastSyncAt: conn?.lastSyncAt ?? null,
    lastSyncStatus: conn?.lastSyncStatus ?? null,
    lastSyncMessage: conn?.lastSyncMessage ?? null,
    paidCount,
    syncedCount,
    errorCount,
    pendingCount: Math.max(paidCount - syncedCount, 0),
  });
});

/** GET /api/par/drive/connect — start OAuth (PKCE + state, ca la Sign-in). */
parDriveRoutes.get("/connect", requirePARRole("par_admin"), async (c) => {
  const config = getDriveConfig();
  if (!config) return c.redirect(settingsUrl("neconfigurat"));

  const state = generateState();
  const verifier = generateCodeVerifier();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: SECURE_COOKIES,
    path: COOKIE_PATH,
    maxAge: OAUTH_COOKIE_TTL_S,
  };
  setCookie(c, STATE_COOKIE, state, cookieOpts);
  setCookie(c, VERIFIER_COOKIE, verifier, cookieOpts);

  return c.redirect(buildDriveAuthUrl(config, state, codeChallengeFromVerifier(verifier)));
});

/** GET /api/par/drive/callback — Google ne întoarce cu ?code&state. */
parDriveRoutes.get("/callback", requirePARRole("par_admin"), async (c) => {
  const config = getDriveConfig();
  const user = c.get("user");
  const clearCookies = () => {
    deleteCookie(c, STATE_COOKIE, { path: COOKIE_PATH });
    deleteCookie(c, VERIFIER_COOKIE, { path: COOKIE_PATH });
  };

  if (!config) return c.redirect(settingsUrl("neconfigurat"));
  if (c.req.query("error")) {
    clearCookies();
    return c.redirect(settingsUrl("refuzat"));
  }

  const state = c.req.query("state");
  const code = c.req.query("code");
  const cookieState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  clearCookies();

  if (!state || !code || !verifier || state !== cookieState) {
    return c.redirect(settingsUrl("stare-invalida"));
  }

  let tokens;
  try {
    tokens = await exchangeDriveCode(config, code, verifier);
  } catch {
    return c.redirect(settingsUrl("eroare"));
  }

  // Fără refresh token nu putem rula săptămâna viitoare. Se întâmplă când Google consideră
  // aplicația deja autorizată; de-aia cerem `prompt=consent`. Dacă tot lipsește, spunem clar.
  if (!tokens.refreshToken) {
    return c.redirect(settingsUrl("fara-refresh-token"));
  }

  const email = await fetchDriveAccountEmail(tokens.accessToken);
  const now = new Date();

  await db
    .insert(parDriveConnections)
    .values({
      tenantId: user.tenantId,
      googleEmail: email,
      refreshTokenEnc: encrypt(tokens.refreshToken),
      connectedByUserId: user.id,
      connectedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: parDriveConnections.tenantId,
      set: {
        googleEmail: email,
        refreshTokenEnc: encrypt(tokens.refreshToken),
        connectedByUserId: user.id,
        connectedAt: now,
        // Contul s-a schimbat: mapele vechi trăiau în alt Drive, deci rădăcina se ia de la capăt.
        rootFolderId: null,
        syncEnabled: true,
        lastSyncStatus: null,
        lastSyncMessage: null,
        updatedAt: now,
      },
    });

  // Mapele cache-uite aparțineau contului anterior; ștergerea lor forțează recrearea arborelui.
  await db.delete(parDriveFolders).where(eq(parDriveFolders.tenantId, user.tenantId));

  return c.redirect(settingsUrl("conectat"));
});

const settingsSchema = z.object({
  syncEnabled: z.boolean().optional(),
  /** ISO-8601: 1 = luni … 7 = duminică. */
  syncDayOfWeek: z.number().int().min(1).max(7).optional(),
  rootFolderName: z.string().min(1).max(120).optional(),
});

/** PATCH /api/par/drive/settings */
parDriveRoutes.patch(
  "/settings",
  requirePARRole("par_admin"),
  zValidator("json", settingsSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const [conn] = await db
      .select()
      .from(parDriveConnections)
      .where(eq(parDriveConnections.tenantId, tenantId));
    if (!conn) return c.json({ error: "not_connected" }, 409);

    const renamed = body.rootFolderName !== undefined && body.rootFolderName !== conn.rootFolderName;
    await db
      .update(parDriveConnections)
      .set({
        ...(body.syncEnabled !== undefined ? { syncEnabled: body.syncEnabled } : {}),
        ...(body.syncDayOfWeek !== undefined ? { syncDayOfWeek: body.syncDayOfWeek } : {}),
        ...(body.rootFolderName !== undefined ? { rootFolderName: body.rootFolderName } : {}),
        // Numele rădăcinii s-a schimbat: următoarea rulare creează mapa nouă. Cea veche rămâne
        // în Drive cu dosarele de până acum — nu ștergem nimic din Drive-ul omului.
        ...(renamed ? { rootFolderId: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(parDriveConnections.id, conn.id));

    if (renamed) {
      await db.delete(parDriveFolders).where(eq(parDriveFolders.tenantId, tenantId));
      await db
        .update(parDriveFiles)
        .set({ contentHash: null, driveFileId: null, updatedAt: new Date() })
        .where(eq(parDriveFiles.tenantId, tenantId));
    }

    return c.json({ ok: true, renamed });
  }
);

/** POST /api/par/drive/sync-now — un lot, acum, pentru workspace-ul curent. */
parDriveRoutes.post("/sync-now", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const summary = await runDriveSyncForTenant(tenantId);
  return c.json(summary);
});

/**
 * POST /api/par/drive/resync-all — uită amprentele și reurcă tot.
 *
 * Necesar când cineva a șters manual fișiere din Drive: pentru noi ele erau „sincronizate", deci
 * nimic nu le-ar fi adus înapoi. Rulează primul lot imediat; restul intră în rulările următoare.
 */
parDriveRoutes.post("/resync-all", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  await db
    .update(parDriveFiles)
    .set({ contentHash: null, updatedAt: new Date() })
    .where(eq(parDriveFiles.tenantId, tenantId));
  const summary = await runDriveSyncForTenant(tenantId, { force: true });
  return c.json(summary);
});

/** POST /api/par/drive/disconnect — revocă accesul și uită tot ce știam despre Drive-ul lui. */
parDriveRoutes.post("/disconnect", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const [conn] = await db
    .select()
    .from(parDriveConnections)
    .where(eq(parDriveConnections.tenantId, tenantId));
  if (!conn) return c.json({ ok: true });

  try {
    await revokeDriveToken(decrypt(conn.refreshTokenEnc));
  } catch {
    // Token deja invalid la Google — deconectarea locală rămâne validă.
  }

  await db.delete(parDriveFolders).where(eq(parDriveFolders.tenantId, tenantId));
  await db.delete(parDriveFiles).where(eq(parDriveFiles.tenantId, tenantId));
  await db.delete(parDriveConnections).where(eq(parDriveConnections.id, conn.id));

  // Fișierele urcate RĂMÂN în Drive-ul organizației: sunt documentele ei, nu ale aplicației.
  return c.json({ ok: true });
});
