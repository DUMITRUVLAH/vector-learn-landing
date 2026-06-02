/**
 * GUARDIAN-001 — Panoul de tutori autorizați per elev
 *
 * Componentă montată în profilul/detaliile unui elev.
 * Afișează lista tutorilor cu badge-uri de permisiuni + add/edit/delete.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, Pencil, Trash2, X, User } from "lucide-react";
import {
  listGuardians,
  addGuardian,
  updateGuardian,
  deleteGuardian,
  type StudentGuardian,
  type AddGuardianPayload,
} from "@/lib/api/guardians";
import { cn } from "@/lib/utils";

// ─── Badge component ──────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  active: boolean;
  variant?: "positive" | "negative";
}

function Badge({ label, active, variant = "positive" }: BadgeProps) {
  if (!active && variant === "positive") return null;
  if (active && variant === "negative") return null;
  const color =
    active && variant === "positive"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", color)}>
      {label}
    </span>
  );
}

// ─── GuardianForm ─────────────────────────────────────────────────────────────

interface GuardianFormProps {
  initial?: Partial<AddGuardianPayload>;
  onSave: (payload: AddGuardianPayload) => Promise<void>;
  onCancel: () => void;
}

function GuardianForm({ initial, onSave, onCancel }: GuardianFormProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [hasCustody, setHasCustody] = useState(initial?.hasCustody ?? true);
  const [canPickup, setCanPickup] = useState(initial?.canPickup ?? true);
  const [receivesCommunications, setReceivesCommunications] = useState(
    initial?.receivesCommunications ?? true
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError("Numele este obligatoriu");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        fullName: fullName.trim(),
        relationship: relationship.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        isPrimary,
        hasCustody,
        canPickup,
        receivesCommunications,
        notes: notes.trim() || null,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("guardian_limit_reached")) {
        setError("Limita de 10 tutori per elev a fost atinsă.");
      } else {
        setError(err instanceof Error ? err.message : "Eroare la salvare");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1" htmlFor="g-fullname">
            Nume complet <span className="text-destructive">*</span>
          </label>
          <input
            id="g-fullname"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="g-relationship">
            Relație
          </label>
          <input
            id="g-relationship"
            type="text"
            placeholder="ex. Mamă, Tată, Bunic"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="g-phone">
            Telefon
          </label>
          <input
            id="g-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1" htmlFor="g-email">
            Email
          </label>
          <input
            id="g-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {/* Flag-uri */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { id: "g-primary", label: "Tutore principal", state: isPrimary, set: setIsPrimary },
            { id: "g-custody", label: "Are custodie", state: hasCustody, set: setHasCustody },
            { id: "g-pickup", label: "Poate ridica copilul", state: canPickup, set: setCanPickup },
            {
              id: "g-comms",
              label: "Primește comunicări",
              state: receivesCommunications,
              set: setReceivesCommunications,
            },
          ] as { id: string; label: string; state: boolean; set: (v: boolean) => void }[]
        ).map(({ id, label, state, set }) => (
          <label key={id} className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              id={id}
              type="checkbox"
              checked={state}
              onChange={(e) => set(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {label}
          </label>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="g-notes">
          Notițe
        </label>
        <input
          id="g-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-muted"
        >
          Anulează
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvează
        </button>
      </div>
    </div>
  );
}

// ─── GuardianCard ──────────────────────────────────────────────────────────────

interface GuardianCardProps {
  guardian: StudentGuardian;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

function GuardianCard({ guardian, onEdit, onDelete }: GuardianCardProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Ștergi tutorele „${guardian.fullName}"?`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{guardian.fullName}</span>
          {guardian.relationship && (
            <span className="text-xs text-muted-foreground">{guardian.relationship}</span>
          )}
          {guardian.isPrimary && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
              Primar
            </span>
          )}
        </div>

        {(guardian.phone || guardian.email) && (
          <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
            {guardian.phone && <span>{guardian.phone}</span>}
            {guardian.email && <span>{guardian.email}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-1 mt-1.5">
          <Badge label="Custodie" active={guardian.hasCustody} />
          <Badge label="Ridică copilul" active={guardian.canPickup} />
          <Badge label="Nu ridică" active={!guardian.canPickup} variant="negative" />
          <Badge label="Primește comms" active={guardian.receivesCommunications} />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          aria-label={`Editează tutore ${guardian.fullName}`}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Șterge tutore ${guardian.fullName}`}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface StudentGuardiansPanelProps {
  studentId: string;
}

export function StudentGuardiansPanel({ studentId }: StudentGuardiansPanelProps) {
  const [guardians, setGuardians] = useState<StudentGuardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadGuardians = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listGuardians(studentId);
      setGuardians(res.guardians ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadGuardians();
  }, [loadGuardians]);

  const handleAdd = async (payload: AddGuardianPayload) => {
    await addGuardian(studentId, payload);
    await loadGuardians();
    setShowAdd(false);
  };

  const handleUpdate = async (guardianId: string, payload: Partial<AddGuardianPayload>) => {
    await updateGuardian(studentId, guardianId, payload);
    await loadGuardians();
    setEditingId(null);
  };

  const handleDelete = async (guardianId: string) => {
    await deleteGuardian(studentId, guardianId);
    await loadGuardians();
  };

  const editingGuardian = guardians.find((g) => g.id === editingId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Tutori autorizați
          {guardians.length > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">({guardians.length})</span>
          )}
        </h3>
        {!showAdd && !editingId && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Adaugă tutore
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Formular adăugare */}
          {showAdd && (
            <div className="p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Tutore nou</span>
                <button
                  onClick={() => setShowAdd(false)}
                  aria-label="Anulează adăugare"
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <GuardianForm
                onSave={handleAdd}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {/* Lista tutori */}
          {guardians.map((guardian) =>
            editingId === guardian.id ? (
              <div
                key={guardian.id}
                className="p-3 rounded-lg border border-primary/40 bg-primary/5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Editare: {guardian.fullName}</span>
                  <button
                    onClick={() => setEditingId(null)}
                    aria-label="Anulează editare"
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <GuardianForm
                  initial={{
                    fullName: guardian.fullName,
                    relationship: guardian.relationship,
                    phone: guardian.phone,
                    email: guardian.email,
                    isPrimary: guardian.isPrimary,
                    hasCustody: guardian.hasCustody,
                    canPickup: guardian.canPickup,
                    receivesCommunications: guardian.receivesCommunications,
                    notes: guardian.notes,
                  }}
                  onSave={(payload) => handleUpdate(guardian.id, payload)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <GuardianCard
                key={guardian.id}
                guardian={guardian}
                onEdit={() => setEditingId(guardian.id)}
                onDelete={() => handleDelete(guardian.id)}
              />
            )
          )}

          {guardians.length === 0 && !showAdd && (
            <div className="flex flex-col items-center gap-1 py-6 text-muted-foreground">
              <User className="h-8 w-8 opacity-30" />
              <p className="text-xs">Niciun tutore adăugat.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
