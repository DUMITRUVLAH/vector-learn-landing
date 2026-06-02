/**
 * KINDER-001 — /app/kinder/checkin
 *
 * Check-in / check-out zilnic per copil cu:
 * - Grid de elevi cu status prezent/absent
 * - Modal check-in (simplu, cu opțional PIN)
 * - Modal check-out cu semnătură canvas + persoană de ridicare
 * - Counter total prezenți în header
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  LogIn, LogOut, Users, Clock, CheckCircle2, Circle,
  Loader2, AlertCircle, X, Pen,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getTodayCheckin,
  recordCheckin,
  type StudentCheckinStatus,
} from "@/lib/api/kinder";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckoutModalState {
  open: boolean;
  studentId: string;
  studentName: string;
  pickupPerson: string;
  notes: string;
  hasSignature: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

function getStudentStatus(s: StudentCheckinStatus): "present" | "left" | "absent" {
  if (s.checkedInAt && !s.checkedOutAt) return "present";
  if (s.checkedInAt && s.checkedOutAt) return "left";
  return "absent";
}

// ─── Signature canvas ─────────────────────────────────────────────────────────

interface SignatureCanvasProps {
  onSign: (dataUrl: string) => void;
  onClear: () => void;
}

function SignatureCanvas({ onSign, onClear }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if (e instanceof MouseEvent) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    const touch = e.touches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current) return;
      const { x, y } = getPos(e, canvas);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const end = () => {
      drawing.current = false;
      onSign(canvas.toDataURL());
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [onSign]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground flex items-center gap-1">
          <Pen className="h-3.5 w-3.5" />
          Semnătură
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Șterge
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={380}
        height={120}
        className="w-full border border-border rounded-md bg-white touch-none cursor-crosshair"
        aria-label="Câmp semnătură"
      />
    </div>
  );
}

// ─── Student card ─────────────────────────────────────────────────────────────

interface StudentCardProps {
  student: StudentCheckinStatus;
  onCheckin: (id: string) => void;
  onCheckout: (id: string, name: string) => void;
  loading: boolean;
}

function StudentCard({ student, onCheckin, onCheckout, loading }: StudentCardProps) {
  const status = getStudentStatus(student);

  return (
    <div
      className={cn(
        "rounded-lg border p-4 flex flex-col gap-3 transition-colors",
        status === "present" && "border-green-400 bg-green-50 dark:bg-green-950/20",
        status === "left" && "border-muted bg-muted/30",
        status === "absent" && "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{student.fullName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {status === "present" && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Prezent de la {formatTime(student.checkedInAt)}
              </span>
            )}
            {status === "left" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(student.checkedInAt)} → {formatTime(student.checkedOutAt)}
              </span>
            )}
            {status === "absent" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-3.5 w-3.5" />
                Absent
              </span>
            )}
          </div>
        </div>
      </div>

      {status === "absent" || status === "left" ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onCheckin(student.studentId)}
          className="touch-target w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          aria-label={`Check-in ${student.fullName}`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Check-in
        </button>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => onCheckout(student.studentId, student.fullName)}
          className="touch-target w-full flex items-center justify-center gap-2 rounded-md border border-border bg-background text-foreground text-sm font-medium px-3 py-2 hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label={`Check-out ${student.fullName}`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Check-out
        </button>
      )}
    </div>
  );
}

// ─── Checkout modal ────────────────────────────────────────────────────────────

interface CheckoutModalProps {
  state: CheckoutModalState;
  onClose: () => void;
  onConfirm: (pickupPerson: string, signatureDataUrl: string | undefined, notes: string) => void;
  loading: boolean;
}

function CheckoutModal({ state, onClose, onConfirm, loading }: CheckoutModalProps) {
  const [pickupPerson, setPickupPerson] = useState(state.pickupPerson);
  const [notes, setNotes] = useState(state.notes);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | undefined>(undefined);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Check-out ${state.studentName}`}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Check-out — {state.studentName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="pickup-person" className="block text-sm font-medium text-foreground mb-1">
              Persoana care ridică
            </label>
            <input
              id="pickup-person"
              type="text"
              value={pickupPerson}
              onChange={(e) => setPickupPerson(e.target.value)}
              placeholder="Nume complet"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <SignatureCanvas
            onSign={(url) => setSignatureDataUrl(url)}
            onClear={() => setSignatureDataUrl(undefined)}
          />

          <div>
            <label htmlFor="checkout-notes" className="block text-sm font-medium text-foreground mb-1">
              Notițe (opțional)
            </label>
            <input
              id="checkout-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. copilul a mâncat la prânz"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Anulează
          </button>
          <button
            type="button"
            disabled={loading || !pickupPerson.trim()}
            onClick={() => onConfirm(pickupPerson, signatureDataUrl, notes)}
            className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmare check-out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KinderCheckinPage() {
  const { data: session } = useSession();
  const [students, setStudents] = useState<StudentCheckinStatus[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutModal, setCheckoutModal] = useState<CheckoutModalState>({
    open: false, studentId: "", studentName: "", pickupPerson: "", notes: "", hasSignature: false,
  });
  const [modalLoading, setModalLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await getTodayCheckin();
      setStudents(data.students);
      setPresentCount(data.presentCount);
      setTotal(data.total);
    } catch {
      setError("Nu s-au putut încărca datele. Reîncearcă.");
    } finally {
      setPageLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const handleCheckin = async (studentId: string) => {
    setLoadingIds((s) => new Set(s).add(studentId));
    try {
      await recordCheckin({ studentId, action: "in" });
      await load();
    } catch {
      setError("Check-in eșuat. Reîncearcă.");
    } finally {
      setLoadingIds((s) => { const n = new Set(s); n.delete(studentId); return n; });
    }
  };

  const openCheckout = (studentId: string, studentName: string) => {
    setCheckoutModal({ open: true, studentId, studentName, pickupPerson: "", notes: "", hasSignature: false });
  };

  const confirmCheckout = async (
    pickupPerson: string,
    signatureDataUrl: string | undefined,
    notes: string
  ) => {
    setModalLoading(true);
    try {
      await recordCheckin({
        studentId: checkoutModal.studentId,
        action: "out",
        pickupPersonName: pickupPerson,
        signatureDataUrl,
        notes: notes || undefined,
      });
      setCheckoutModal((s) => ({ ...s, open: false }));
      await load();
    } catch {
      setError("Check-out eșuat. Reîncearcă.");
    } finally {
      setModalLoading(false);
    }
  };

  const todayStr = new Date().toLocaleDateString("ro-RO", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <AppShell
      pageTitle="Grădiniță — Check-in"
      pageDescription={todayStr}
      actions={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-semibold text-foreground">{presentCount}</span>
          <span>/ {total} prezenți</span>
        </div>
      }
    >
      {/* Alerts */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto touch-target"
            aria-label="Închide alerta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {pageLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Student grid */}
      {!pageLoading && (
        <>
          {students.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Niciun elev activ. Adaugă elevi din secțiunea Elevi.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {students.map((s) => (
                <StudentCard
                  key={s.studentId}
                  student={s}
                  onCheckin={handleCheckin}
                  onCheckout={openCheckout}
                  loading={loadingIds.has(s.studentId)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Checkout modal */}
      {checkoutModal.open && (
        <CheckoutModal
          state={checkoutModal}
          onClose={() => setCheckoutModal((s) => ({ ...s, open: false }))}
          onConfirm={confirmCheckout}
          loading={modalLoading}
        />
      )}
    </AppShell>
  );
}
