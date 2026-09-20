/**
 * PAR-DRIVE — arhiva periodică: o fotografie a dosarelor, care nu se mai rescrie.
 *
 * De ce există: dosarul „viu" din Drive se actualizează când cineva adaugă un document la cerere.
 * Asta e bine pentru lucrul zilnic și prost pentru istoric — peste un an, în Drive ar exista doar
 * ultima versiune a fiecărui dosar, nu cea pe baza căreia s-a plătit. Arhiva rupe legătura: la
 * fiecare 14 zile (configurabil) copiem dosarele curente într-o mapă datată și le blocăm.
 *
 * Ce garantează concret:
 *  - **Copiile nu se mai schimbă.** Sunt fișiere noi; o modificare ulterioară a dosarului viu nu le
 *    atinge. În plus primesc `contentRestrictions.readOnly` la Drive, deci nu mai pot fi editate.
 *  - **Orice atingere se vede.** Manifestul din mapă conține numele, mărimea și amprenta MD5 a
 *    fiecărei copii, plus a fișierului viu din care a fost făcută. O ștergere sau o înlocuire e
 *    detectabilă prin simplă comparație.
 *
 * Ce NU garantează, și e onest spus și în manifest: **proprietarul Drive-ului își poate șterge
 * oricând fișierele.** Google nu oferă niciun mecanism prin care o aplicație terță să împiedice
 * asta. Evidența din `par_drive_archives` rămâne însă la noi, deci lipsa se poate dovedi.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parDriveArchives,
  parDriveConnections,
  parDriveFiles,
} from "../../db/schema/par";
import { decrypt } from "../crypto";
import {
  ARCHIVES_FOLDER,
  ARCHIVE_BATCH_LIMIT,
  archiveDue,
  archiveLabel,
  renderManifest,
  type ManifestRow,
} from "./driveArchivePlan";
import {
  copyFile,
  ensureFolder,
  getDriveConfig,
  getFileMeta,
  lockFile,
  refreshDriveAccessToken,
  uploadTextFile,
} from "./googleDrive";

export { ARCHIVES_FOLDER, ARCHIVE_BATCH_LIMIT, archiveDue, archiveLabel, renderManifest };

export interface ArchiveSummary {
  tenantId: string;
  status: "ok" | "partial" | "error" | "skipped";
  label: string | null;
  copied: number;
  locked: number;
  failed: number;
  message: string;
}

/**
 * Rulează o arhivă pentru un workspace. Nu aruncă: erorile ajung în rezumat și în `par_drive_archives`.
 *
 * `force` sare peste verificarea de interval (butonul „Arhivează acum").
 */
export async function runArchiveForTenant(
  tenantId: string,
  options: { force?: boolean; now?: Date } = {}
): Promise<ArchiveSummary> {
  const now = options.now ?? new Date();
  const empty = { label: null, copied: 0, locked: 0, failed: 0 };

  const config = getDriveConfig();
  if (!config) {
    return { tenantId, status: "skipped", ...empty, message: "Google OAuth nu e configurat pe server." };
  }

  const [conn] = await db
    .select()
    .from(parDriveConnections)
    .where(eq(parDriveConnections.tenantId, tenantId));
  if (!conn) return { tenantId, status: "skipped", ...empty, message: "Drive-ul nu e conectat." };
  if (!conn.rootFolderId) {
    return { tenantId, status: "skipped", ...empty, message: "Nu s-a făcut încă nicio sincronizare." };
  }
  if (!options.force && !archiveDue(conn, now)) {
    return { tenantId, status: "skipped", ...empty, message: "Nu a trecut încă intervalul de arhivare." };
  }

  const synced = await db
    .select()
    .from(parDriveFiles)
    .where(and(eq(parDriveFiles.tenantId, tenantId), eq(parDriveFiles.status, "synced")));
  const withFiles = synced.filter((f) => !!f.driveFileId);
  if (withFiles.length === 0) {
    return { tenantId, status: "skipped", ...empty, message: "Nu există dosare urcate de arhivat." };
  }

  const label = archiveLabel(now);

  let accessToken: string;
  try {
    accessToken = await refreshDriveAccessToken(config, decrypt(conn.refreshTokenEnc));
  } catch (err) {
    const msg = err instanceof Error && err.message === "drive_reauth_required"
      ? "Accesul la Google Drive a fost revocat. Reconectează contul din setări."
      : "Nu am putut obține un token de Drive.";
    return { tenantId, status: "error", ...empty, label, message: msg };
  }

  let archiveFolderId: string;
  try {
    const parent = await ensureFolder(accessToken, ARCHIVES_FOLDER, conn.rootFolderId);
    archiveFolderId = await ensureFolder(accessToken, label, parent);
  } catch (err) {
    return {
      tenantId,
      status: "error",
      ...empty,
      label,
      message: `Nu am putut crea mapa de arhivă: ${err instanceof Error ? err.message : "necunoscut"}`,
    };
  }

  const rows: ManifestRow[] = [];
  let failed = 0;
  let stoppedEarly = false;

  for (const file of withFiles) {
    if (rows.length >= ARCHIVE_BATCH_LIMIT) {
      stoppedEarly = true;
      break;
    }
    const sourceId = file.driveFileId as string;
    try {
      const name = file.fileName ?? `Dosar_${sourceId}.pdf`;
      const copyId = await copyFile(accessToken, sourceId, { name, parentId: archiveFolderId });
      const meta = await getFileMeta(accessToken, copyId);
      const locked = await lockFile(accessToken, copyId, `Arhivă PAR ${label} — document de audit`);
      rows.push({
        name,
        sourceFileId: sourceId,
        copyFileId: copyId,
        size: meta?.size ?? null,
        md5: meta?.md5Checksum ?? null,
        locked,
      });
    } catch {
      // Un dosar șters manual din Drive nu mai poate fi copiat. Arhiva merge mai departe cu restul;
      // lipsa se vede din numărul de fișiere față de câte dosare sunt sincronizate.
      failed += 1;
    }
  }

  let manifestFileId: string | null = null;
  try {
    manifestFileId = await uploadTextFile(accessToken, {
      name: `MANIFEST-${label}.txt`,
      parentId: archiveFolderId,
      text: renderManifest({ label, generatedAt: now, rootFolderName: conn.rootFolderName, rows }),
    });
    await lockFile(accessToken, manifestFileId, `Manifest arhivă PAR ${label}`);
  } catch {
    // Fără manifest arhiva rămâne validă, dar fără dovada amprentelor — o spunem în mesaj.
  }

  const lockedCount = rows.filter((r) => r.locked).length;
  const status: ArchiveSummary["status"] = failed > 0 || stoppedEarly || !manifestFileId ? "partial" : "ok";
  const message = [
    `${rows.length} dosare copiate`,
    `${lockedCount} blocate la scriere`,
    failed ? `${failed} nereușite` : null,
    stoppedEarly ? `restul intră în arhiva următoare (limita de ${ARCHIVE_BATCH_LIMIT} pe rulare)` : null,
    manifestFileId ? null : "manifestul nu a putut fi scris",
  ]
    .filter(Boolean)
    .join(", ");

  await db
    .insert(parDriveArchives)
    .values({
      tenantId,
      label,
      folderId: archiveFolderId,
      manifestFileId,
      fileCount: rows.length,
      lockedCount,
      status,
      message: message.slice(0, 500),
    })
    .onConflictDoUpdate({
      target: [parDriveArchives.tenantId, parDriveArchives.label],
      set: {
        folderId: archiveFolderId,
        manifestFileId,
        fileCount: rows.length,
        lockedCount,
        status,
        message: message.slice(0, 500),
      },
    });

  await db
    .update(parDriveConnections)
    .set({ lastArchiveAt: now, updatedAt: now })
    .where(eq(parDriveConnections.id, conn.id));

  return { tenantId, status, label, copied: rows.length, locked: lockedCount, failed, message };
}
