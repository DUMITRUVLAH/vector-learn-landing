/**
 * CX-703 — ParticipantTable
 * Reusable table for one of the 3 participant buckets (enrolled, free, pending).
 * Features: WhatsApp toggle, delete manual, add row form (optional).
 * Touch targets ≥ 44px, semantic tokens, dark mode.
 */
import { useState } from "react";
import { Trash2, Loader2, MessageCircle } from "lucide-react";
import type {
  CohortParticipant,
  PatchParticipantPayload,
} from "@/lib/api/cohortParticipants";
import { cn } from "@/lib/utils";

interface ParticipantTableProps {
  title: string;
  participants: CohortParticipant[];
  cohortId: string;
  onToggleWhatsapp: (id: string, value: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** If true, shows an "Add" row at the bottom */
  showAddRow?: boolean;
  onAdd?: (data: { fullName: string; email?: string; phone?: string }) => Promise<void>;
  className?: string;
}

export function ParticipantTable({
  title,
  participants,
  onToggleWhatsapp,
  onDelete,
  showAddRow,
  onAdd,
  className,
}: ParticipantTableProps) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleToggle(id: string, current: boolean) {
    setPendingIds((s) => new Set(s).add(id));
    try {
      await onToggleWhatsapp(id, !current);
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleDelete(id: string) {
    setPendingIds((s) => new Set(s).add(`del-${id}`));
    try {
      await onDelete(id);
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(`del-${id}`);
        return next;
      });
    }
  }

  async function handleAdd() {
    if (!addName.trim()) {
      setAddError("Numele este obligatoriu");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      await onAdd?.({
        fullName: addName.trim(),
        email: addEmail.trim() || undefined,
        phone: addPhone.trim() || undefined,
      });
      setAddName("");
      setAddEmail("");
      setAddPhone("");
    } catch {
      setAddError("Nu s-a putut adăuga participantul.");
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {title}{" "}
          <span className="text-muted-foreground font-normal">
            ({participants.length})
          </span>
        </h3>
      </div>

      {participants.length === 0 && !showAddRow ? (
        <p className="text-sm text-muted-foreground py-2">Nu există participanți în această categorie.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" aria-label={title}>
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-xs">
                <th className="py-2 px-3 text-left font-medium">Nume</th>
                <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">Email</th>
                <th className="py-2 px-3 text-left font-medium hidden md:table-cell">Telefon</th>
                <th className="py-2 px-3 text-center font-medium">WA</th>
                <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">Sursă</th>
                <th className="py-2 px-3 w-8" aria-label="Acțiuni" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {participants.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2 px-3 text-foreground font-medium">{p.fullName}</td>
                  <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                    {p.email ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                    {p.phone ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      aria-label={p.whatsappJoined ? "Elimină din WhatsApp" : "Adaugă în WhatsApp"}
                      aria-pressed={p.whatsappJoined}
                      onClick={() => handleToggle(p.id, p.whatsappJoined)}
                      disabled={pendingIds.has(p.id)}
                      className={cn(
                        "inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:opacity-50",
                        p.whatsappJoined
                          ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pendingIds.has(p.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </td>
                  <td className="py-2 px-3 hidden sm:table-cell">
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        p.source === "crm"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p.source === "crm" ? "CRM" : "Manual"}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {p.source === "manual" && (
                      <button
                        aria-label={`Șterge ${p.fullName}`}
                        onClick={() => handleDelete(p.id)}
                        disabled={pendingIds.has(`del-${p.id}`)}
                        className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-md",
                          "text-muted-foreground hover:text-destructive transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "disabled:opacity-50"
                        )}
                      >
                        {pendingIds.has(`del-${p.id}`) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Add row */}
              {showAddRow && (
                <tr className="bg-muted/10">
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="Nume *"
                      aria-label="Nume participant nou"
                      className={cn(
                        "w-full text-sm bg-transparent border-0 border-b border-border",
                        "focus:outline-none focus:border-primary py-1",
                        "placeholder:text-muted-foreground/60"
                      )}
                    />
                  </td>
                  <td className="py-2 px-3 hidden sm:table-cell">
                    <input
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="Email (opțional)"
                      aria-label="Email participant nou"
                      className={cn(
                        "w-full text-sm bg-transparent border-0 border-b border-border",
                        "focus:outline-none focus:border-primary py-1",
                        "placeholder:text-muted-foreground/60"
                      )}
                    />
                  </td>
                  <td className="py-2 px-3 hidden md:table-cell">
                    <input
                      type="tel"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      placeholder="Telefon (opțional)"
                      aria-label="Telefon participant nou"
                      className={cn(
                        "w-full text-sm bg-transparent border-0 border-b border-border",
                        "focus:outline-none focus:border-primary py-1",
                        "placeholder:text-muted-foreground/60"
                      )}
                    />
                  </td>
                  <td className="py-2 px-3" colSpan={3}>
                    <button
                      onClick={handleAdd}
                      disabled={addLoading}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:opacity-50 transition-colors min-h-[44px]"
                      )}
                    >
                      {addLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : null}
                      Adaugă
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {addError && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {addError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
