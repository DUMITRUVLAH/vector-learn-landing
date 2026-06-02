/**
 * COURSE-103: GroupEnrollmentsList — shows enrolled students for a group,
 * with an "Înrolează" button (opens EnrollModal) and unenroll action.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, UserX } from "lucide-react";
import {
  listGroupEnrollments,
  unenrollStudent,
  type Group,
  type StudentInGroup,
} from "@/lib/api/groups";
import { EnrollModal } from "./EnrollModal";
import { cn } from "@/lib/utils";

interface GroupEnrollmentsListProps {
  group: Group;
  onSpotsChanged?: () => void;
}

export function GroupEnrollmentsList({ group, onSpotsChanged }: GroupEnrollmentsListProps) {
  const [items, setItems] = useState<StudentInGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [confirmUnenroll, setConfirmUnenroll] = useState<StudentInGroup | null>(null);
  const [unenrolling, setUnenrolling] = useState(false);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listGroupEnrollments(group.id);
      setItems(res.items);
    } catch {
      setError("Nu s-au putut încărca înrolările.");
    } finally {
      setLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    void fetchEnrollments();
  }, [fetchEnrollments]);

  async function handleUnenroll() {
    if (!confirmUnenroll) return;
    setUnenrolling(true);
    try {
      await unenrollStudent(group.id, confirmUnenroll.student.id);
      setConfirmUnenroll(null);
      await fetchEnrollments();
      onSpotsChanged?.();
    } catch {
      // keep dialog open; user can retry
    } finally {
      setUnenrolling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Se încarcă...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {items.length} elev{items.length !== 1 ? "i" : ""} înrolat
          {items.length !== 1 ? "i" : ""} din {group.maxStudents} locuri
        </p>
        <button
          type="button"
          onClick={() => setEnrollModalOpen(true)}
          disabled={group.spotsRemaining === 0}
          aria-label="Înrolează elev nou"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
            "hover:bg-primary/90 transition-colors touch-target",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Înrolează
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Niciun elev înrolat încă.
        </p>
      ) : (
        <ul role="list" className="divide-y divide-border rounded-lg border border-border">
          {items.map(({ enrollment, student }) => (
            <li
              key={enrollment.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {student.fullName}
                </p>
                {student.email && (
                  <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Dezînrolează pe ${student.fullName}`}
                onClick={() => setConfirmUnenroll({ enrollment, student })}
                className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors touch-target"
              >
                <UserX className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* EnrollModal */}
      {enrollModalOpen && (
        <EnrollModal
          group={group}
          onClose={() => setEnrollModalOpen(false)}
          onEnrolled={async () => {
            setEnrollModalOpen(false);
            await fetchEnrollments();
            onSpotsChanged?.();
          }}
        />
      )}

      {/* Unenroll confirmation */}
      {confirmUnenroll && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unenroll-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setConfirmUnenroll(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-card p-6 shadow-xl ring-1 ring-border">
            <h3
              id="unenroll-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              Confirmă dezînrolarea
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Dezînrolezi pe{" "}
              <span className="font-medium text-foreground">
                {confirmUnenroll.student.fullName}
              </span>{" "}
              din <span className="font-medium text-foreground">{group.name}</span>?
              <br />
              <span className="text-warning">
                Plata NU se anulează automat.
              </span>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnenroll(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors touch-target"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={() => void handleUnenroll()}
                disabled={unenrolling}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors touch-target disabled:opacity-50"
              >
                {unenrolling && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Dezînrolează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
