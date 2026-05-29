/**
 * SCHED-501 — Client-side API helpers for rooms.
 */
import { api } from "../api";

export interface Room {
  id: string;
  tenantId: string;
  name: string;
  capacity: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listRooms(): Promise<{ items: Room[] }> {
  return api<{ items: Room[] }>("/rooms");
}

export function createRoom(input: {
  name: string;
  capacity?: number;
  description?: string | null;
}): Promise<Room> {
  return api<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteRoom(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/rooms/${id}`, { method: "DELETE" });
}
