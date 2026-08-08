/**
 * PLATFORM-001 — formatări comune ale Consolei Platformă.
 * Ținute separat ca ecranele să nu-și rescrie fiecare propria variantă de „acum 3 zile".
 */
import type { BadgeVariant } from "@/components/ds";

const DATE_TIME = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

/** „acum 5 min" / „acum 3 zile" / „niciodată" — citit dintr-o privire într-un tabel. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "niciodată";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "niciodată";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "chiar acum";
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
  const months = Math.floor(days / 30);
  return `acum ${months} ${months === 1 ? "lună" : "luni"}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activ";
    case "trial":
      return "Perioadă de probă";
    case "suspended":
      return "Suspendat";
    default:
      return status;
  }
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "suspended":
      return "destructive";
    case "trial":
      return "warning";
    default:
      return "success";
  }
}

/** Eticheta acțiunilor din audit — codurile brute nu spun nimic la o revizuire de securitate. */
export function auditActionLabel(action: string): string {
  switch (action) {
    case "module.toggle":
      return "Modul comutat";
    case "payer_module.toggle":
      return "Modul comutat (entitate juridică)";
    case "defaults.update":
      return "Implicite schimbate";
    case "defaults.apply_all":
      return "Implicite aplicate la toate";
    case "workspace.suspend":
      return "Workspace suspendat";
    case "workspace.status":
      return "Stare workspace schimbată";
    case "workspace.plan":
      return "Plan schimbat";
    case "admin.add":
      return "Superadmin adăugat";
    case "admin.remove":
      return "Superadmin retras";
    default:
      return action;
  }
}

/** Codurile de eșec la login, pe înțelesul cuiva care citește raportul. */
export function failureLabel(reason: string | null): string {
  switch (reason) {
    case "invalid_credentials":
      return "Parolă/email greșit";
    case "wrong_app":
      return "Aplicație greșită";
    case "account_disabled":
      return "Cont dezactivat";
    case "workspace_suspended":
      return "Workspace suspendat";
    case "tenant_not_found":
      return "Workspace inexistent";
    default:
      return reason ?? "eșuat";
  }
}
