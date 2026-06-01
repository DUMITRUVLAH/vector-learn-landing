/**
 * CX-703 — useCohortParticipants hook
 * Manages participant list with optimistic updates for add/toggle/delete.
 */
import { useState, useEffect, useCallback } from "react";
import {
  listParticipants,
  addParticipant,
  patchParticipant,
  deleteParticipant,
  computeCohortStats,
  type CohortParticipant,
  type CohortStats,
  type AddParticipantPayload,
} from "@/lib/api/cohortParticipants";

interface UseCohortParticipantsResult {
  participants: CohortParticipant[];
  stats: CohortStats;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  handleAdd: (payload: AddParticipantPayload) => Promise<void>;
  handleToggleWhatsapp: (id: string, value: boolean) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
}

export function useCohortParticipants(
  cohortId: string | null
): UseCohortParticipantsResult {
  const [participants, setParticipants] = useState<CohortParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const { participants: p } = await listParticipants(cohortId);
      setParticipants(p);
    } catch {
      setError("Nu s-au putut încărca participanții.");
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    setParticipants([]);
    void reload();
  }, [reload]);

  /** Optimistic add: shows immediately, rolls back on error */
  async function handleAdd(payload: AddParticipantPayload) {
    if (!cohortId) return;

    const optimistic: CohortParticipant = {
      id: `opt-${Date.now()}`,
      tenantId: "",
      cohortId,
      studentId: payload.studentId ?? null,
      fullName: payload.fullName,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      notes: payload.notes ?? null,
      whatsappJoined: payload.whatsappJoined ?? false,
      paymentStatus: payload.paymentStatus ?? null,
      amountCents: payload.amountCents ?? 0,
      source: payload.studentId ? "crm" : "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setParticipants((prev) => [...prev, optimistic]);

    try {
      const { participant } = await addParticipant(cohortId, payload);
      // Replace optimistic row with the real server row
      setParticipants((prev) =>
        prev.map((p) => (p.id === optimistic.id ? participant : p))
      );
    } catch (err) {
      // Rollback
      setParticipants((prev) => prev.filter((p) => p.id !== optimistic.id));
      throw err;
    }
  }

  /** Optimistic WhatsApp toggle */
  async function handleToggleWhatsapp(id: string, value: boolean) {
    if (!cohortId) return;
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, whatsappJoined: value } : p))
    );
    try {
      await patchParticipant(cohortId, id, { whatsappJoined: value });
    } catch {
      // Rollback
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, whatsappJoined: !value } : p))
      );
    }
  }

  /** Optimistic delete */
  async function handleDelete(id: string) {
    if (!cohortId) return;
    const snapshot = participants.find((p) => p.id === id);
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteParticipant(cohortId, id);
    } catch {
      // Rollback
      if (snapshot) {
        setParticipants((prev) => [...prev, snapshot]);
      }
    }
  }

  const stats = computeCohortStats(participants);

  return {
    participants,
    stats,
    loading,
    error,
    reload,
    handleAdd,
    handleToggleWhatsapp,
    handleDelete,
  };
}
