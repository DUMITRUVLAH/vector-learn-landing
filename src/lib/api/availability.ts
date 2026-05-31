/**
 * HR-403 — Client-side API helpers for teacher availability.
 */
import { api } from "../api";

export interface AvailabilitySlot {
  id: string;
  tenantId: string;
  teacherId: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilitySlotInput {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  isAvailable: boolean;
}

export function getAvailability(teacherId: string): Promise<{ slots: AvailabilitySlot[] }> {
  return api<{ slots: AvailabilitySlot[] }>(`/hr/teachers/${teacherId}/availability`);
}

export function setAvailability(
  teacherId: string,
  slots: AvailabilitySlotInput[]
): Promise<{ slots: AvailabilitySlot[] }> {
  return api<{ slots: AvailabilitySlot[] }>(`/hr/teachers/${teacherId}/availability`, {
    method: "PUT",
    body: JSON.stringify({ slots }),
  });
}
