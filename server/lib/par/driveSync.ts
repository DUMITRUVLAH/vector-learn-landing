/**
 * PAR-DRIVE — jobul care oglindește dosarele PLĂTITE în Google Drive.
 *
 * Ce face, o dată pe săptămână (sau la cerere, din setări): ia cererile cu status `paid`, le
 * construiește dosarul cu ACELAȘI generator ca butonul „Descarcă dosarul" (lib/par/buildDosar.ts)
 * și le urcă în Drive într-un arbore identic cu cel din ecranul de foldere:
 *
 *     <rădăcina aleasă> / <Proiect> / [<Eveniment>] / Plătite / Dosar_PAR_<nr>.pdf
 *
 * Trei lucruri fac jobul rulabil pe Vercel, unde o funcție moare la 60 de secunde:
 *
 *  1. **Amprenta sursei.** Nu hash-uim PDF-ul (are data generării în el, deci s-ar schimba la
 *     fiecare rulare și am reurca tot, săptămână de săptămână). Hash-uim datele DIN CARE se naște
 *     dosarul — cererea, atașamentele, aprobările, plata. Dacă n-a mișcat nimic, nici măcar nu
 *     mai construim PDF-ul.
 *  2. **Buget de timp.** Runner-ul se oprește singur înainte de limită și raportează `partial`;
 *     ce a rămas se ia la următoarea rulare, în ordinea plății. Nimic nu se pierde.
 *  3. **Idempotență.** Fiecare cerere are un rând în `par_drive_files` cu ID-ul fișierului din
 *     Drive: a doua oară facem UPDATE pe același fișier, nu un duplicat. Link-urile trimise pe
 *     e-mail rămân valide, iar Drive păstrează versiunile.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parApprovals,
  parAttachments,
  parDriveConnections,
  parDriveFiles,
  parDriveFolders,
  parEvents,
  parPayments,
  parProjects,
  parRequests,
  type ParDriveConnection,
} from "../../db/schema/par";
import { decrypt } from "../crypto";
import { buildDosar } from "./buildDosar";
import {
  createFolder,
  ensureFolder,
  fileExists,
  getDriveConfig,
  moveFile,
  refreshDriveAccessToken,
  uploadPdf,
} from "./googleDrive";
import { ancestorKeys, driveFolderPathFor, type DriveFolderPath } from "./driveTree";

/** Câte dosare urcăm într-o singură rulare, ca invocarea să nu atingă limita de 60s a Vercel. */
export const DEFAULT_BATCH_LIMIT = 8;
/** Ne oprim cu 15 secunde înainte de limita platformei, ca să apucăm să scriem starea în DB. */
export const DEFAULT_TIME_BUDGET_MS = 45_000;

export interface DriveSyncOptions {
  limit?: number;
  timeBudgetMs?: number;
  /** Reurcă tot, chiar dacă amprenta n-a mișcat (folosit de „Resincronizează tot"). */
  force?: boolean;
}

export interface DriveSyncSummary {
  tenantId: string;
  status: "ok" | "partial" | "error" | "skipped";
  uploaded: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** Câte cereri plătite au mai rămas de urcat după această rulare. */
  remaining: number;
  message: string;
}

/** Amprenta datelor din care se naște dosarul. Se schimbă doar când se schimbă conținutul. */
function sourceFingerprint(parts: Array<string | number | Date | null | undefined>): string {
  const h = createHash("sha256");
  for (const p of parts) {
    h.update(p instanceof Date ? p.toISOString() : String(p ?? ""));
    h.update(" ");
  }
  return h.digest("hex");
}

interface FolderCtx {
  accessToken: string;
  tenantId: string;
  rootFolderId: string;
  /** pathKey → folderId, populat din DB la începutul rulării și completat pe parcurs. */
  cache: Map<string, string>;
}

/**
 * Creează (sau regăsește) lanțul de mape pentru o cale și întoarce ID-ul mapei-frunză.
 *
 * Cache-ul din DB e ce ține jobul ieftin: fără el, fiecare dosar ar însemna 2–3 căutări în Drive.
 * Când o mapă a fost ștearsă manual din Drive, `ensureFolder` o caută după nume și o recreează —
 * așa nu apar mape-surori cu același nume.
 */
async function ensureFolderChain(ctx: FolderCtx, path: DriveFolderPath): Promise<string> {
  const keys = ancestorKeys(path);
  let parentId = ctx.rootFolderId;

  for (let i = 0; i < path.segments.length; i++) {
    const key = keys[i];
    const name = path.segments[i];
    const cached = ctx.cache.get(key);
    if (cached) {
      parentId = cached;
      continue;
    }
    const folderId = await ensureFolder(ctx.accessToken, name, parentId);
    ctx.cache.set(key, folderId);
    await db
      .insert(parDriveFolders)
      .values({ tenantId: ctx.tenantId, pathKey: key, folderId, name })
      .onConflictDoUpdate({
        target: [parDriveFolders.tenantId, parDriveFolders.pathKey],
        set: { folderId, name },
      });
    parentId = folderId;
  }
  return parentId;
}

/** Rădăcina: o creăm noi (scope-ul `drive.file` nu ne lasă să vedem mapele existente ale omului). */
async function ensureRootFolder(conn: ParDriveConnection, accessToken: string): Promise<string> {
  if (conn.rootFolderId && (await fileExists(accessToken, conn.rootFolderId))) {
    return conn.rootFolderId;
  }
  // Ștearsă din Drive (sau primul sync): o recreăm și reținem noul ID. Mapele-copil cache-uite
  // rămân orfane, așa că le uităm — se vor recrea sub rădăcina nouă.
  const rootId = await createFolder(accessToken, conn.rootFolderName, null);
  await db.delete(parDriveFolders).where(eq(parDriveFolders.tenantId, conn.tenantId));
  await db
    .update(parDriveConnections)
    .set({ rootFolderId: rootId, updatedAt: new Date() })
    .where(eq(parDriveConnections.id, conn.id));
  return rootId;
}

/** Rulează sincronizarea pentru UN workspace. Nu aruncă: erorile ajung în rezumat și în DB. */
export async function runDriveSyncForTenant(
  tenantId: string,
  options: DriveSyncOptions = {}
): Promise<DriveSyncSummary> {
  const limit = options.limit ?? DEFAULT_BATCH_LIMIT;
  const deadline = Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const empty = { uploaded: 0, updated: 0, unchanged: 0, failed: 0, remaining: 0 };

  const config = getDriveConfig();
  if (!config) {
    return { tenantId, status: "skipped", ...empty, message: "Google OAuth nu e configurat pe server." };
  }

  const [conn] = await db
    .select()
    .from(parDriveConnections)
    .where(eq(parDriveConnections.tenantId, tenantId));
  if (!conn) {
    return { tenantId, status: "skipped", ...empty, message: "Drive-ul nu e conectat." };
  }
  if (!conn.syncEnabled) {
    return { tenantId, status: "skipped", ...empty, message: "Sincronizarea e oprită din setări." };
  }

  const fail = async (message: string): Promise<DriveSyncSummary> => {
    await db
      .update(parDriveConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "error",
        lastSyncMessage: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(parDriveConnections.id, conn.id));
    return { tenantId, status: "error", ...empty, message };
  };

  let accessToken: string;
  try {
    accessToken = await refreshDriveAccessToken(config, decrypt(conn.refreshTokenEnc));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "necunoscut";
    return fail(
      msg === "drive_reauth_required"
        ? "Accesul la Google Drive a fost revocat. Reconectează contul din setări."
        : `Nu am putut obține un token de Drive: ${msg}`
    );
  }

  let rootFolderId: string;
  try {
    rootFolderId = await ensureRootFolder(conn, accessToken);
  } catch (err) {
    return fail(`Nu am putut crea mapa-rădăcină: ${err instanceof Error ? err.message : "necunoscut"}`);
  }

  // Cererile plătite, cele mai vechi întâi (ordinea plății = ordinea din dosarul fizic).
  const paid = await db
    .select({
      id: parRequests.id,
      requestNo: parRequests.requestNo,
      projectId: parRequests.projectId,
      eventId: parRequests.eventId,
      updatedAt: parRequests.updatedAt,
      paidAt: parRequests.paidAt,
    })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "paid")))
    .orderBy(asc(parRequests.paidAt));

  if (paid.length === 0) {
    const message = "Nu există cereri plătite de sincronizat.";
    await db
      .update(parDriveConnections)
      .set({ lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncMessage: message, updatedAt: new Date() })
      .where(eq(parDriveConnections.id, conn.id));
    return { tenantId, status: "ok", ...empty, message };
  }

  const parIds = paid.map((p) => p.id);
  const [existingFiles, attachments, approvals, payments, projects, events] = await Promise.all([
    db.select().from(parDriveFiles).where(eq(parDriveFiles.tenantId, tenantId)),
    db
      .select({ id: parAttachments.id, parId: parAttachments.parId, updatedAt: parAttachments.updatedAt })
      .from(parAttachments)
      .where(inArray(parAttachments.parId, parIds)),
    db
      .select({ id: parApprovals.id, parId: parApprovals.parId, decidedAt: parApprovals.decidedAt })
      .from(parApprovals)
      .where(inArray(parApprovals.parId, parIds)),
    db
      .select({ parId: parPayments.parId, updatedAt: parPayments.updatedAt })
      .from(parPayments)
      .where(inArray(parPayments.parId, parIds)),
    db
      .select({ id: parProjects.id, name: parProjects.name })
      .from(parProjects)
      .where(eq(parProjects.tenantId, tenantId)),
    db
      .select({ id: parEvents.id, name: parEvents.name })
      .from(parEvents)
      .where(eq(parEvents.tenantId, tenantId)),
  ]);

  const fileByPar = new Map(existingFiles.map((f) => [f.parId, f]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));

  const folderRows = await db
    .select()
    .from(parDriveFolders)
    .where(eq(parDriveFolders.tenantId, tenantId));
  const ctx: FolderCtx = {
    accessToken,
    tenantId,
    rootFolderId,
    cache: new Map(folderRows.map((f) => [f.pathKey, f.folderId])),
  };

  let uploaded = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let processed = 0;
  let stoppedEarly = false;
  let reauthNeeded = false;

  for (const par of paid) {
    if (processed >= limit || Date.now() >= deadline) {
      stoppedEarly = true;
      break;
    }

    const fingerprint = sourceFingerprint([
      par.updatedAt,
      par.paidAt,
      ...attachments
        .filter((a) => a.parId === par.id)
        .map((a) => `${a.id}:${a.updatedAt?.toISOString() ?? ""}`)
        .sort(),
      ...approvals
        .filter((a) => a.parId === par.id)
        .map((a) => `${a.id}:${a.decidedAt?.toISOString() ?? ""}`)
        .sort(),
      payments.find((p) => p.parId === par.id)?.updatedAt,
    ]);

    const existing = fileByPar.get(par.id);
    const path = driveFolderPathFor({
      projectId: par.projectId,
      projectName: par.projectId ? projectName.get(par.projectId) ?? null : null,
      eventId: par.eventId,
      eventName: par.eventId ? eventName.get(par.eventId) ?? null : null,
    });

    const sameContent =
      !options.force &&
      existing?.status === "synced" &&
      existing.contentHash === fingerprint &&
      existing.folderPathKey === path.pathKey &&
      !!existing.driveFileId;
    if (sameContent) {
      unchanged += 1;
      continue;
    }

    processed += 1;
    try {
      const built = await buildDosar(par.id, tenantId);
      if (!built) throw new Error("dosarul nu a putut fi construit");

      const oldFolderId =
        existing?.driveFileId && existing.folderPathKey && existing.folderPathKey !== path.pathKey
          ? ctx.cache.get(existing.folderPathKey) ?? null
          : null;
      const folderId = await ensureFolderChain(ctx, path);

      const result = await uploadPdf(accessToken, {
        name: built.fileName,
        parentId: folderId,
        bytes: built.bytes,
        existingFileId: existing?.driveFileId ?? null,
      });
      // Cererea și-a schimbat proiectul între două sincronizări: fișierul se MUTĂ, nu se dublează.
      if (oldFolderId && oldFolderId !== folderId) {
        await moveFile(accessToken, result.fileId, folderId, oldFolderId);
      }

      const row = {
        driveFileId: result.fileId,
        folderPathKey: path.pathKey,
        fileName: built.fileName,
        contentHash: fingerprint,
        status: "synced",
        error: null,
        attempts: (existing?.attempts ?? 0) + 1,
        uploadedAt: new Date(),
        updatedAt: new Date(),
      };
      await db
        .insert(parDriveFiles)
        .values({ tenantId, parId: par.id, ...row })
        .onConflictDoUpdate({
          target: [parDriveFiles.tenantId, parDriveFiles.parId],
          set: row,
        });

      if (existing?.driveFileId) updated += 1;
      else uploaded += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : "necunoscut";
      // Token revocat în timpul rulării: restul cererilor ar eșua identic, deci ne oprim aici.
      if (msg === "drive_reauth_required" || msg.startsWith("drive_api_401")) reauthNeeded = true;
      const row = {
        status: "error",
        error: msg.slice(0, 500),
        attempts: (existing?.attempts ?? 0) + 1,
        updatedAt: new Date(),
      };
      await db
        .insert(parDriveFiles)
        .values({ tenantId, parId: par.id, folderPathKey: path.pathKey, ...row })
        .onConflictDoUpdate({
          target: [parDriveFiles.tenantId, parDriveFiles.parId],
          set: row,
        });
      if (reauthNeeded) break;
    }
  }

  const remaining = Math.max(paid.length - unchanged - uploaded - updated - failed, 0);
  const status: DriveSyncSummary["status"] = reauthNeeded
    ? "error"
    : failed > 0 || stoppedEarly || remaining > 0
      ? "partial"
      : "ok";

  const message = reauthNeeded
    ? "Accesul la Google Drive a fost revocat. Reconectează contul din setări."
    : [
        uploaded ? `${uploaded} dosare noi` : null,
        updated ? `${updated} actualizate` : null,
        unchanged ? `${unchanged} neschimbate` : null,
        failed ? `${failed} eșuate` : null,
        remaining ? `${remaining} rămase pentru rulările următoare` : null,
      ]
        .filter(Boolean)
        .join(", ") || "Nimic de făcut.";

  await db
    .update(parDriveConnections)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncMessage: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(parDriveConnections.id, conn.id));

  return { tenantId, status, uploaded, updated, unchanged, failed, remaining, message };
}

/**
 * Rularea săptămânală, peste toate workspace-urile conectate.
 *
 * Vercel Hobby nu programează cron-uri decât zilnic, așa că jobul rulează în fiecare zi și trece
 * mai departe dacă nu e ziua aleasă de workspace — „săptămânal" e o decizie de date, nu de
 * infrastructură, și fiecare organizație își alege singură ziua.
 */
export async function runWeeklyDriveSync(now = new Date()): Promise<DriveSyncSummary[]> {
  // ISO-8601: 1 = luni … 7 = duminică (getDay() dă 0 pentru duminică).
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();

  const connections = await db
    .select({ tenantId: parDriveConnections.tenantId, lastSyncAt: parDriveConnections.lastSyncAt })
    .from(parDriveConnections)
    .where(and(eq(parDriveConnections.syncEnabled, true), eq(parDriveConnections.syncDayOfWeek, isoDay)));

  const summaries: DriveSyncSummary[] = [];
  for (const conn of connections) {
    // Rulat deja azi (retry manual, cron dublu): nu reluăm de la capăt în aceeași zi.
    if (conn.lastSyncAt && conn.lastSyncAt.toDateString() === now.toDateString()) continue;
    summaries.push(await runDriveSyncForTenant(conn.tenantId));
  }
  return summaries;
}
