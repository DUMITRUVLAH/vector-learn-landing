/**
 * SCHOOL-005 — Funcții pure pentru dosarul de admitere
 */

export type AdmissionStatus =
  | "draft"
  | "submitted"
  | "review"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "enrolled";

export type DocStatus = "required" | "received" | "verified";

export interface AdmissionAppLike {
  status: AdmissionStatus;
}

export interface AdmissionDocLike {
  status: DocStatus;
}

/**
 * Verifică dacă o aplicație este eligibilă pentru înscrierea efectivă.
 * Condiții:
 *   1. Status = `accepted`
 *   2. Niciun document nu mai are status `required` (nerecepționat)
 */
export function isEligibleToEnroll(
  app: AdmissionAppLike,
  documents: AdmissionDocLike[]
): boolean {
  if (app.status !== "accepted") return false;
  const hasPendingRequired = documents.some((d) => d.status === "required");
  return !hasPendingRequired;
}

/**
 * Etichetă română pentru fiecare status de admitere.
 */
export function admissionStatusLabel(status: AdmissionStatus): string {
  const labels: Record<AdmissionStatus, string> = {
    draft: "Schiță",
    submitted: "Aplicat",
    review: "În analiză",
    accepted: "Acceptat",
    waitlisted: "Lista de așteptare",
    rejected: "Respins",
    enrolled: "Înscris",
  };
  return labels[status] ?? status;
}

/**
 * Culoarea badge-ului pentru fiecare status (clase Tailwind semantice).
 */
export function admissionStatusColor(status: AdmissionStatus): string {
  const colors: Record<AdmissionStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    review: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    waitlisted: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    enrolled: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  };
  return colors[status] ?? "bg-muted text-muted-foreground";
}
