/**
 * GUARDIAN-001 — Client API pentru tutori autorizați
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentGuardian {
  id: string;
  tenantId: string;
  studentId: string;
  fullName: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  hasCustody: boolean;
  canPickup: boolean;
  receivesCommunications: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddGuardianPayload {
  fullName: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  hasCustody?: boolean;
  canPickup?: boolean;
  receivesCommunications?: boolean;
  notes?: string | null;
}

// ─── Functions ────────────────────────────────────────────────────────────────

export async function listGuardians(
  studentId: string
): Promise<{ guardians: StudentGuardian[] }> {
  return api<{ guardians: StudentGuardian[] }>(`/api/students/${studentId}/guardians`);
}

export async function addGuardian(
  studentId: string,
  payload: AddGuardianPayload
): Promise<{ guardian: StudentGuardian }> {
  return api<{ guardian: StudentGuardian }>(`/api/students/${studentId}/guardians`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateGuardian(
  studentId: string,
  guardianId: string,
  payload: Partial<AddGuardianPayload>
): Promise<{ guardian: StudentGuardian }> {
  return api<{ guardian: StudentGuardian }>(
    `/api/students/${studentId}/guardians/${guardianId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteGuardian(
  studentId: string,
  guardianId: string
): Promise<void> {
  await api<void>(`/api/students/${studentId}/guardians/${guardianId}`, {
    method: "DELETE",
  });
}
