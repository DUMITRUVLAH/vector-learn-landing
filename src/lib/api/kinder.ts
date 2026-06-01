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

// ─── KINDER-002: Daily report / diary ─────────────────────────────────────────

export type DiaryEventType = "meal" | "nap" | "diaper" | "activity" | "photo" | "note";

export interface DiaryEvent {
  id: string;
  tenantId: string;
  studentId: string;
  eventDate: string;
  eventType: DiaryEventType;
  details: Record<string, unknown> | null;
  photoUrl: string | null;
  staffUserId: string | null;
  createdAt: string;
}

export interface DiaryResponse {
  date: string;
  studentId: string;
  events: DiaryEvent[];
}

export interface AddDiaryEventPayload {
  studentId: string;
  eventType: DiaryEventType;
  details?: Record<string, unknown>;
  photoUrl?: string;
}

/** GET /api/kinder/diary/:studentId?date=YYYY-MM-DD */
export function getDiary(studentId: string, date?: string): Promise<DiaryResponse> {
  const params = date ? `?date=${date}` : "";
  return api<DiaryResponse>(`/api/kinder/diary/${studentId}${params}`);
}

/** POST /api/kinder/diary */
export function addDiaryEvent(payload: AddDiaryEventPayload): Promise<{ ok: boolean; event: DiaryEvent }> {
  return api<{ ok: boolean; event: DiaryEvent }>("/api/kinder/diary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/kinder/diary/:eventId */
export function deleteDiaryEvent(eventId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/kinder/diary/${eventId}`, { method: "DELETE" });
}
