/**
 * KINDER-007 — /app/kinder/incidents
 *
 * Incident/accident reports:
 * - List of incidents with status badges
 * - Dialog to create new incident
 * - Detail panel with parent notification + signature flows
 * - Date/student filters + CSV export
 */
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getIncidents,
  createIncident,
  notifyParent,
  acknowledgeIncident,
  type IncidentReport,
  type CreateIncidentPayload,
  type IncidentType,
} from "@/lib/api/kinder";
import {
  AlertTriangle,
  Loader2,
  AlertCircle,
  Plus,
  Download,
  Bell,
  PenLine,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function exportCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: "fall", label: "Cădere" },
  { value: "bite", label: "Mușcătură" },
  { value: "cut", label: "Tăietură / Zgârietură" },
  { value: "allergy", label: "Reacție alergică" },
  { value: "behavioral", label: "Incident comportamental" },
  { value: "other", label: "Altul" },
];

function typeLabel(t: IncidentType): string {
  return INCIDENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: IncidentReport["status"];
}

function StatusBadge({ status }: StatusBadgeProps) {
  const map = {
    open: { label: "Deschis", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <Clock className="h-3 w-3" /> },
    parent_notified: { label: "Notificat", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: <Bell className="h-3 w-3" /> },
    acknowledged: { label: "Semnat", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: <CheckCircle2 className="h-3 w-3" /> },
    closed: { label: "Închis", cls: "bg-muted text-muted-foreground", icon: null },
  };
  const cfg = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  saving: boolean;
}

function SignatureCanvas({ onSave, onCancel, saving }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasStrokes(true);
    e.preventDefault();
  }

  function stopDraw() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  function handleSave() {
    onSave(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Semnați în spațiul de mai jos pentru a confirma că ați fost informat despre incident.
      </p>
      <div className="rounded-lg border-2 border-dashed border-border bg-white dark:bg-background overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[150px] cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          aria-label="Canvas pentru semnătură"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs text-muted-foreground underline"
        >
          Șterge
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Anulare
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasStrokes || saving}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm text-white",
            hasStrokes && !saving
              ? "bg-primary hover:bg-primary/90"
              : "bg-primary/40 cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmă semnătura"}
        </button>
      </div>
    </div>
  );
}

// ─── Create Incident Dialog ───────────────────────────────────────────────────

interface CreateDialogProps {
  onClose: () => void;
  onCreated: (incident: IncidentReport) => void;
}

function CreateDialog({ onClose, onCreated }: CreateDialogProps) {
  const [form, setForm] = useState<CreateIncidentPayload>({
    studentId: "",
    incidentDate: todayStr(),
    type: "other",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId || !form.description.trim()) {
      setError("Completați câmpurile obligatorii.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createIncident(form);
      onCreated(result.incident);
    } catch {
      setError("Eroare la salvare. Încercați din nou.");
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof CreateIncidentPayload, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";
  const labelCls = "block text-sm font-medium text-foreground mb-1";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raport incident nou"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Raport incident nou</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Închide dialog"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="inc-date">
                Data incidentului <span className="text-destructive">*</span>
              </label>
              <input
                id="inc-date"
                type="date"
                value={form.incidentDate}
                onChange={(e) => field("incidentDate", e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="inc-time">
                Ora (opțional)
              </label>
              <input
                id="inc-time"
                type="time"
                value={form.incidentTime ?? ""}
                onChange={(e) => field("incidentTime", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-student">
              ID Elev <span className="text-destructive">*</span>
            </label>
            <input
              id="inc-student"
              type="text"
              placeholder="UUID elev"
              value={form.studentId}
              onChange={(e) => field("studentId", e.target.value)}
              className={inputCls}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Introduceți ID-ul elevului (UUID).
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-type">
              Tipul incidentului
            </label>
            <select
              id="inc-type"
              value={form.type}
              onChange={(e) => field("type", e.target.value as IncidentType)}
              className={inputCls}
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-desc">
              Descriere <span className="text-destructive">*</span>
            </label>
            <textarea
              id="inc-desc"
              rows={3}
              placeholder="Descrieți ce s-a întâmplat..."
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              className={cn(inputCls, "resize-none")}
              required
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-injury">
              Zona afectată (opțional)
            </label>
            <input
              id="inc-injury"
              type="text"
              placeholder="ex. genunchi drept, mâna stângă"
              value={form.injuryLocation ?? ""}
              onChange={(e) => field("injuryLocation", e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-aid">
              Prim ajutor acordat (opțional)
            </label>
            <textarea
              id="inc-aid"
              rows={2}
              placeholder="Dezinfectare, pansament, gherdea cu apă rece..."
              value={form.firstAidGiven ?? ""}
              onChange={(e) => field("firstAidGiven", e.target.value)}
              className={cn(inputCls, "resize-none")}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="inc-witness">
              Martor (opțional)
            </label>
            <input
              id="inc-witness"
              type="text"
              placeholder="Numele martorului"
              value={form.witnessName ?? ""}
              onChange={(e) => field("witnessName", e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Anulare
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvează raport
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KinderIncidentsPage() {
  const { data: session } = useSession();
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(todayStr());
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await getIncidents({ from, to });
      setIncidents(data.incidents);
    } catch {
      setError("Eroare la încărcarea incidentelor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session, from, to]);

  function handleCreated(incident: IncidentReport) {
    setIncidents((prev) => [incident, ...prev]);
    setShowCreate(false);
  }

  async function handleNotify(incident: IncidentReport) {
    setActionError(null);
    setActionLoading(true);
    try {
      const result = await notifyParent(incident.id);
      setIncidents((prev) => prev.map((i) => (i.id === incident.id ? result.incident : i)));
      setSelected(result.incident);
    } catch {
      setActionError("Eroare la notificare. Încercați din nou.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAcknowledge(incident: IncidentReport, signatureDataUrl: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      const result = await acknowledgeIncident(incident.id, signatureDataUrl);
      setIncidents((prev) => prev.map((i) => (i.id === incident.id ? result.incident : i)));
      setSelected(result.incident);
      setShowSignature(false);
    } catch {
      setActionError("Eroare la salvarea semnăturii. Încercați din nou.");
    } finally {
      setActionLoading(false);
    }
  }

  function handleExportCSV() {
    const headers = ["Data", "Copil", "Tip", "Descriere", "Zona afectata", "Status", "Notificat la", "Semnat la"];
    const rows = incidents.map((i) => [
      i.incidentDate,
      i.studentName ?? i.studentId,
      typeLabel(i.type),
      i.description,
      i.injuryLocation ?? "",
      i.status,
      i.parentNotifiedAt ? new Date(i.parentNotifiedAt).toLocaleString("ro-RO") : "",
      i.parentAcknowledgedAt ? new Date(i.parentAcknowledgedAt).toLocaleString("ro-RO") : "",
    ]);
    exportCSV([headers, ...rows], `incidente_${from}_${to}.csv`);
  }

  return (
    <AppShell
      pageTitle="Rapoarte incidente"
      pageDescription="Documente accidente/incidente + semnătură parentală"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={incidents.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Raport nou
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label htmlFor="filter-from" className="block text-xs text-muted-foreground mb-1">
            De la
          </label>
          <input
            id="filter-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div>
          <label htmlFor="filter-to" className="block text-xs text-muted-foreground mb-1">
            Până la
          </label>
          <input
            id="filter-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {(
            [
              { label: "Total", value: incidents.length, cls: "text-foreground" },
              { label: "Deschise", value: incidents.filter((i) => i.status === "open").length, cls: "text-yellow-600 dark:text-yellow-400" },
              { label: "Notificate", value: incidents.filter((i) => i.status === "parent_notified").length, cls: "text-blue-600 dark:text-blue-400" },
              { label: "Semnate", value: incidents.filter((i) => i.status === "acknowledged").length, cls: "text-green-600 dark:text-green-400" },
            ] as const
          ).map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card p-4">
              <div className={cn("text-2xl font-bold", card.cls)}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Se încarcă...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && incidents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nu există incidente înregistrate în intervalul selectat.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Înregistrează primul incident
          </button>
        </div>
      )}

      {/* Incidents table */}
      {!loading && !error && incidents.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Copil</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tip</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descriere</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((incident) => (
                <tr
                  key={incident.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => {
                    setSelected(incident);
                    setShowSignature(false);
                    setActionError(null);
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">
                    {incident.incidentDate}
                    {incident.incidentTime && (
                      <span className="ml-1 text-xs text-muted-foreground">{incident.incidentTime}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {incident.studentName ?? <span className="text-muted-foreground text-xs">{incident.studentId.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-3 text-foreground">{typeLabel(incident.type)}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {incident.description}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={incident.status} />
                  </td>
                  <td className="px-4 py-3">
                    {incident.status === "open" && (
                      <button
                        type="button"
                        aria-label="Notifică părintele"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(incident);
                          handleNotify(incident);
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Notifică
                      </button>
                    )}
                    {incident.status === "parent_notified" && (
                      <button
                        type="button"
                        aria-label="Înregistrare semnătură"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(incident);
                          setShowSignature(true);
                          setActionError(null);
                        }}
                        className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
                      >
                        <PenLine className="h-3 w-3" />
                        Semnătură
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detaliu incident"
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-end sm:justify-end bg-black/40"
          onClick={() => {
            setSelected(null);
            setShowSignature(false);
          }}
        >
          <div
            className="w-full sm:w-[420px] h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto bg-card border-l border-t border-border shadow-2xl rounded-t-xl sm:rounded-l-xl sm:rounded-t-none p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Detaliu incident</h3>
              <button
                type="button"
                aria-label="Închide panel"
                onClick={() => {
                  setSelected(null);
                  setShowSignature(false);
                }}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <span className="text-muted-foreground">
                  {selected.incidentDate} {selected.incidentTime ?? ""}
                </span>
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tip</span>
                <p className="text-foreground mt-0.5">{typeLabel(selected.type)}</p>
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descriere</span>
                <p className="text-foreground mt-0.5 whitespace-pre-wrap">{selected.description}</p>
              </div>

              {selected.injuryLocation && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zona afectată</span>
                  <p className="text-foreground mt-0.5">{selected.injuryLocation}</p>
                </div>
              )}

              {selected.firstAidGiven && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prim ajutor</span>
                  <p className="text-foreground mt-0.5">{selected.firstAidGiven}</p>
                </div>
              )}

              {selected.witnessName && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Martor</span>
                  <p className="text-foreground mt-0.5">{selected.witnessName}</p>
                </div>
              )}

              {selected.parentNotifiedAt && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notificat la</span>
                  <p className="text-foreground mt-0.5">
                    {new Date(selected.parentNotifiedAt).toLocaleString("ro-RO")}
                  </p>
                </div>
              )}

              {selected.parentAcknowledgedAt && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Semnat la</span>
                  <p className="text-foreground mt-0.5">
                    {new Date(selected.parentAcknowledgedAt).toLocaleString("ro-RO")}
                  </p>
                </div>
              )}
            </div>

            {actionError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {actionError}
              </div>
            )}

            {/* Actions */}
            {selected.status === "open" && (
              <button
                type="button"
                onClick={() => handleNotify(selected)}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Marchează ca notificat
              </button>
            )}

            {selected.status === "parent_notified" && !showSignature && (
              <button
                type="button"
                onClick={() => setShowSignature(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
              >
                <PenLine className="h-4 w-4" />
                Înregistrare semnătură parentală
              </button>
            )}

            {selected.status === "parent_notified" && showSignature && (
              <SignatureCanvas
                onSave={(url) => handleAcknowledge(selected, url)}
                onCancel={() => setShowSignature(false)}
                saving={actionLoading}
              />
            )}
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <CreateDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </AppShell>
  );
}
