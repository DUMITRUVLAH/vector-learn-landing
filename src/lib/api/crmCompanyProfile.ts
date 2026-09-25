/**
 * CRM-D04 — clientul pentru „Datele firmei tale" (rechizitele tipărite pe fiecare act).
 */
import { api } from "@/lib/api";

export interface CrmCompanyProfile {
  legalName: string;
  idno: string | null;
  vatNumber: string | null;
  address: string | null;
  iban: string | null;
  bankName: string | null;
  bic: string | null;
  administratorName: string | null;
  administratorTitle: string | null;
  phone: string | null;
  email: string | null;
}

export interface CrmCompanyProfileResponse {
  profile: CrmCompanyProfile;
  /** Ce iese gol pe o ofertă, pe nume („IBAN", „Banca"…). Gol = actele ies complete. */
  missing: string[];
}

export function getCrmCompanyProfile(): Promise<CrmCompanyProfileResponse> {
  return api<CrmCompanyProfileResponse>("/api/crm/company-profile");
}

export function saveCrmCompanyProfile(profile: CrmCompanyProfile): Promise<CrmCompanyProfileResponse> {
  return api<CrmCompanyProfileResponse>("/api/crm/company-profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export const CRM_COMPANY_PROFILE_PATH = "/business/crm/firma";
