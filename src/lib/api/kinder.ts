/**
 * KINDER-001 — Client-side API helpers for /api/kinder
 */
import { api } from "../api";

export interface StudentCheckinStatus {
  studentId: string;
  fullName: string;
  birthDate: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  pickupPersonName: string | null;
  logId: string | null;
}

export interface TodayCheckinResponse {
  date: string;
  presentCount: number;
  total: number;
  students: StudentCheckinStatus[];
}

export interface AuthorizedPickup {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
  isDefault: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface CheckinLogEntry {
  id: string;
  tenantId: string;
  studentId: string;
  logDate: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  pickupPersonName: string | null;
  notes: string | null;
}

export interface CheckinPayload {
  studentId: string;
  action: "in" | "out";
  pickupPersonName?: string;
  signatureDataUrl?: string;
  pin?: string;
  notes?: string;
}

export interface AddPickupPayload {
  name: string;
  relation?: string;
  phone?: string;
  pin?: string;
  isDefault?: boolean;
}

/** GET /api/kinder/checkin/today */
export function getTodayCheckin(): Promise<TodayCheckinResponse> {
  return api<TodayCheckinResponse>("/api/kinder/checkin/today");
}

/** POST /api/kinder/checkin */
export function recordCheckin(payload: CheckinPayload): Promise<{ ok: boolean; log: CheckinLogEntry }> {
  return api<{ ok: boolean; log: CheckinLogEntry }>("/api/kinder/checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /api/kinder/students/:id/pickups */
export function getStudentPickups(studentId: string): Promise<AuthorizedPickup[]> {
  return api<AuthorizedPickup[]>(`/api/kinder/students/${studentId}/pickups`);
}

/** POST /api/kinder/students/:id/pickups */
export function addPickup(
  studentId: string,
  payload: AddPickupPayload
): Promise<{ ok: boolean; pickup: AuthorizedPickup }> {
  return api<{ ok: boolean; pickup: AuthorizedPickup }>(
    `/api/kinder/students/${studentId}/pickups`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

/** DELETE /api/kinder/students/:id/pickups/:pickupId */
export function removePickup(studentId: string, pickupId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/kinder/students/${studentId}/pickups/${pickupId}`, {
    method: "DELETE",
  });
}
