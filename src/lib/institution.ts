/**
 * INST-001 — Institution type: drives which modules appear in the cabinet.
 *
 * Shared by the sidebar (AppShell), the dashboard, and the Settings page so the
 * three stay in sync. The type lives on the tenant (DB) and arrives via the
 * session payload; older sessions without it are treated as "mixt" (see all).
 */
import type { InstitutionType } from "@/hooks/useSession";

export type { InstitutionType };

/** Module "audience" — which institution types a module belongs to. */
export type ModuleAudience = "gradinita" | "scoala" | "shared";

export const INSTITUTION_TYPES: { value: InstitutionType; label: string; desc: string }[] = [
  { value: "gradinita", label: "Grădiniță", desc: "Doar modulele de grădiniță + cele comune (CRM, Finanțe, Setări)." },
  { value: "scoala", label: "Școală / Centru educațional", desc: "Elevi, grupe, clase, orar, prezență, profesori, diplome + cele comune." },
  { value: "mixt", label: "Mixt (grădiniță + școală)", desc: "Vede toate modulele, ambele seturi." },
];

export function institutionLabel(t: InstitutionType | undefined): string {
  return INSTITUTION_TYPES.find((x) => x.value === (t ?? "mixt"))?.label ?? "Mixt";
}

/**
 * Should a module with the given audience be visible for this institution type?
 * - "shared" modules are always visible.
 * - "mixt" institutions see everything.
 * - otherwise the audience must match the institution type.
 */
export function isModuleVisible(audience: ModuleAudience, type: InstitutionType | undefined): boolean {
  if (audience === "shared") return true;
  const t = type ?? "mixt";
  if (t === "mixt") return true;
  return audience === t;
}
