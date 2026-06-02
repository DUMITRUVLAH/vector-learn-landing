/**
 * DIPLOMA-803/804/805 — Client-side API helpers for /api/certificates + /api/public/certificates
 */
import { api } from "@/lib/api";

export interface IssueResult {
  certificateId: string;
  verificationToken: string;
  reissued: boolean;
}

export interface IssueBulkResult {
  issued: Array<{ certificateId: string; verificationToken: string }>;
}

export interface IssuePayload {
  certificateId: string;
  cohortId?: string | null;
  templateId?: string | null;
  participantName: string;
  courseName: string;
  edition?: string | null;
  mentorName?: string | null;
  completionDate?: string | null;
}

export interface IssueBulkPayload {
  cohortId?: string | null;
  templateId?: string | null;
  courseName: string;
  edition?: string | null;
  mentorName?: string | null;
  completionDate?: string | null;
  participants: Array<{ certificateId: string; participantName: string }>;
}

export async function issueCertificate(payload: IssuePayload): Promise<IssueResult> {
  return api<IssueResult>("/api/certificates/issue", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function issueCertificatesBulk(payload: IssueBulkPayload): Promise<IssueBulkResult> {
  return api<IssueBulkResult>("/api/certificates/issue-bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── DIPLOMA-805: Public certificate verification ─────────────────────────────

export interface PublicCertificate {
  certificateId: string;
  participantName: string;
  courseName: string;
  edition: string | null;
  mentorName: string | null;
  completionDate: string | null;
  issuedAt: string;
}

export interface VerifyCertificateResult {
  valid: boolean;
  certificate?: PublicCertificate;
}

/** Public (no-auth) — verify certificate by verification token */
export async function verifyCertificatePublic(
  token: string
): Promise<VerifyCertificateResult> {
  const res = await fetch(
    `/api/public/certificates/${encodeURIComponent(token)}`
  );
  if (res.status === 404) return { valid: false };
  if (!res.ok) throw new Error(`verify_failed: ${res.status}`);
  return res.json() as Promise<VerifyCertificateResult>;
}
