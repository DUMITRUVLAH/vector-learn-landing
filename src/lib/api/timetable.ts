/**
 * SCHOOL-006 — Client API pentru orarul master
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimetableSlot {
  id: string;
  tenantId: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  subjectName: string | null;
  teacherName: string | null;
  roomName: string | null;
}

export interface TimetableConflict {
  type: "teacher" | "room" | "class";
  conflictingSlotId?: string;
  message: string;
}

export interface CreateSlotPayload {
  classId: string;
  subjectId: string;
  teacherId?: string | null;
  roomId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

// ─── Functions ────────────────────────────────────────────────────────────────

export async function listTimetableSlots(params?: {
  classId?: string;
  yearId?: string;
}): Promise<{ slots: TimetableSlot[] }> {
  const qs = new URLSearchParams();
  if (params?.classId) qs.set("classId", params.classId);
  if (params?.yearId) qs.set("yearId", params.yearId);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return api<{ slots: TimetableSlot[] }>(`/api/school/timetable${q}`);
}

export async function createTimetableSlot(
  payload: CreateSlotPayload
): Promise<{ slot: TimetableSlot }> {
  return api<{ slot: TimetableSlot }>("/api/school/timetable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchTimetableSlot(
  id: string,
  payload: Partial<CreateSlotPayload>
): Promise<{ slot: TimetableSlot }> {
  return api<{ slot: TimetableSlot }>(`/api/school/timetable/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTimetableSlot(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/school/timetable/${id}`, { method: "DELETE" });
}
