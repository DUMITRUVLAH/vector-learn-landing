/**
 * DIPLOMA-803/804 — Client-side API helpers for /api/certificates
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
