/**
 * INST-001 — Client helpers for /api/settings/institution
 */
import { api } from "../api";
import type { InstitutionType } from "@/hooks/useSession";

export function getInstitutionType(): Promise<{ institutionType: InstitutionType }> {
  return api<{ institutionType: InstitutionType }>("/api/settings/institution");
}

export function setInstitutionType(
  institutionType: InstitutionType
): Promise<{ institutionType: InstitutionType }> {
  return api<{ institutionType: InstitutionType }>("/api/settings/institution", {
    method: "PATCH",
    body: JSON.stringify({ institutionType }),
  });
}
