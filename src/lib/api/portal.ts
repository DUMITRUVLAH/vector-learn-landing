/**
 * GAP-010 — Client-side API helpers for /api/portal
 */
import { api } from "../api";

export interface PortalLesson {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  teacher: string | null;
  course: string | null;
  room: string | null;
  meetingUrl: string | null;
  status: string;
}

export interface PortalPayment {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  description: string | null;
}

export interface PortalStudent {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  debtCents: number;
}

export interface PortalData {
  student: PortalStudent;
  upcomingLessons: PortalLesson[];
  recentPayments: PortalPayment[];
  activePackage: { creditsRemaining: number; totalCredits: number } | null;
}

/** GET /api/portal/:token — public, no auth required */
export async function getPortalData(token: string): Promise<PortalData> {
  return api<PortalData>(`/api/portal/${token}`);
}

/** POST /api/portal/token — admin only, generate magic link for student */
export async function generatePortalToken(
  studentId: string,
  expiryDays = 30
): Promise<{ token: string; expiresAt: string; portalUrl: string; studentName: string }> {
  return api("/api/portal/token", {
    method: "POST",
    body: JSON.stringify({ studentId, expiryDays }),
  });
}
