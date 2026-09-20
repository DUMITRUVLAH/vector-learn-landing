/**
 * PAR-DRIVE — clientul pentru oglindirea dosarelor plătite în Google Drive.
 *
 * Conectarea NU trece pe aici: e o navigare la nivel de pagină către Google (`driveConnectUrl`),
 * pentru că un consimțământ OAuth nu poate fi făcut dintr-un `fetch` — browserul trebuie să
 * ajungă efectiv pe accounts.google.com.
 */
import { api } from "../api";

export interface ParDriveStatus {
  /** False dacă serverul n-are GOOGLE_CLIENT_ID/SECRET — butonul de conectare n-are ce face. */
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  rootFolderName: string;
  rootFolderId: string | null;
  syncEnabled: boolean;
  /** ISO-8601: 1 = luni … 7 = duminică. */
  syncDayOfWeek: number;
  lastSyncAt: string | null;
  lastSyncStatus: "ok" | "partial" | "error" | null;
  lastSyncMessage: string | null;
  paidCount: number;
  syncedCount: number;
  errorCount: number;
  pendingCount: number;
  archiveEnabled: boolean;
  archiveIntervalDays: number;
  lastArchiveAt: string | null;
  /** True când a trecut intervalul și următoarea sincronizare completă va declanșa arhiva. */
  archiveDue: boolean;
  archives: ParDriveArchive[];
}

export interface ParDriveArchive {
  /** Data arhivei, folosită și ca nume de mapă în Drive: „2026-09-20". */
  label: string;
  folderId: string | null;
  fileCount: number;
  /** Câte copii au primit blocarea la scriere din Drive. */
  lockedCount: number;
  status: "ok" | "partial" | "error";
  createdAt: string;
}

export interface ParDriveArchiveSummary {
  status: "ok" | "partial" | "error" | "skipped";
  label: string | null;
  copied: number;
  locked: number;
  failed: number;
  message: string;
}

export interface ParDriveSyncSummary {
  status: "ok" | "partial" | "error" | "skipped";
  uploaded: number;
  updated: number;
  unchanged: number;
  failed: number;
  remaining: number;
  message: string;
}

export function getDriveStatus(): Promise<ParDriveStatus> {
  return api<ParDriveStatus>("/api/par/drive/status");
}

/** Navigare de pagină, nu fetch: Google trebuie să afișeze ecranul lui de consimțământ. */
export const driveConnectUrl = "/api/par/drive/connect";

export function updateDriveSettings(patch: {
  syncEnabled?: boolean;
  syncDayOfWeek?: number;
  rootFolderName?: string;
  archiveEnabled?: boolean;
  archiveIntervalDays?: number;
}): Promise<{ ok: true; renamed: boolean }> {
  return api("/api/par/drive/settings", { method: "PATCH", body: JSON.stringify(patch) });
}

export function syncDriveNow(): Promise<ParDriveSyncSummary> {
  return api<ParDriveSyncSummary>("/api/par/drive/sync-now", { method: "POST" });
}

export function resyncDriveAll(): Promise<ParDriveSyncSummary> {
  return api<ParDriveSyncSummary>("/api/par/drive/resync-all", { method: "POST" });
}

export function archiveDriveNow(): Promise<ParDriveArchiveSummary> {
  return api<ParDriveArchiveSummary>("/api/par/drive/archive-now", { method: "POST" });
}

/**
 * Rulează loturi în lanț până nu mai rămâne nimic.
 *
 * O invocare urcă un lot, ca să nu depășească limita de timp a platformei. Fără bucla asta, omul
 * ar trebui să apese butonul din nou și din nou — și, mai rău, ar putea crede că restul s-a pierdut.
 * `onProgress` alimentează textul din buton, ca așteptarea să fie explicată, nu doar lungă.
 */
export async function syncDriveUntilDone(
  onProgress?: (summary: ParDriveSyncSummary, round: number) => void,
  maxRounds = 25
): Promise<ParDriveSyncSummary> {
  let last = await syncDriveNow();
  onProgress?.(last, 1);
  for (let round = 2; round <= maxRounds; round++) {
    if (last.status === "error" || last.status === "skipped" || last.remaining === 0) break;
    last = await syncDriveNow();
    onProgress?.(last, round);
  }
  return last;
}

export function disconnectDrive(): Promise<{ ok: true }> {
  return api("/api/par/drive/disconnect", { method: "POST" });
}

export const DRIVE_WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Luni" },
  { value: 2, label: "Marți" },
  { value: 3, label: "Miercuri" },
  { value: 4, label: "Joi" },
  { value: 5, label: "Vineri" },
  { value: 6, label: "Sâmbătă" },
  { value: 7, label: "Duminică" },
];

/** Mesajele cu care ne întoarcem de la Google (`?rezultat=` pe pagina de setări). */
export function driveCallbackMessage(result: string | null): { tone: "ok" | "error"; text: string } | null {
  switch (result) {
    case "conectat":
      return { tone: "ok", text: "Contul Google e conectat. Prima sincronizare poate fi pornită acum." };
    case "refuzat":
      return { tone: "error", text: "Ai refuzat accesul în ecranul Google, deci nimic nu s-a conectat." };
    case "neconfigurat":
      return { tone: "error", text: "Serverul nu are configurate datele aplicației Google. Scrie-ne." };
    case "stare-invalida":
      return { tone: "error", text: "Conectarea a expirat sau a fost întreruptă. Încearcă din nou." };
    case "fara-refresh-token":
      return {
        tone: "error",
        text:
          "Google nu ne-a dat permisiunea de lungă durată, deci sincronizarea săptămânală n-ar funcționa. " +
          "Șterge aplicația din myaccount.google.com → Securitate → Aplicații terțe și reconectează.",
      };
    case "eroare":
      return { tone: "error", text: "Conectarea la Google a eșuat. Încearcă din nou." };
    default:
      return null;
  }
}
