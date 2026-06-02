/**
 * SCHOOL-005 — /app/school/admissions
 *
 * Dosare de admitere: listă aplicații grupate pe status (kanban simplificat),
 * creare aplicație nouă, actualizare status, vizualizare documente.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, ClipboardCheck, X, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAcademicYears,
  type AcademicYear,
} from "@/lib/api/school";
import {
  listApplications,
  createApplication,
  updateApplication,
  listDocuments,
  addDocument,
  updateDocument,
  enrollApplication,
  type AdmissionApplication,
  type AdmissionStatus,
  type AdmissionDocument,
  type AdmissionDocStatus,
} from "@/lib/api/admissions";
import { cn } from "@/lib/utils";

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AdmissionStatus, string> = {
  draft: "Schiță",
  submitted: "Aplicat",
  review: "În analiză",
  accepted: "Acceptat",
  waitlisted: "Lista de așteptare",
  rejected: "Respins",
  enrolled: "Înscris",
};

const STATUS_COLORS: Record<AdmissionStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  waitlisted: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  enrolled: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

const DOC_STATUS_LABELS: Record<AdmissionDocStatus, string> = {
  required: "Necesar",
  received: "Recepționat",
  verified: "Verificat",
};

// ─── Add Application Modal ────────────────────────────────────────────────────

interface AddAppModalProps {
  years: AcademicYear[];
  onSave: (payload: Parameters<typeof createApplication>[0]) => Promise<void>;
  onClose: () => void;
}

function AddAppModal({ years, onSave, onClose }: AddAppModalProps) {
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [gradeLevel, setGradeLevel] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError("Numele aplicantului e obligatoriu."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        academicYearId: yearId,
        applicantName: name.trim(),
        applicantEmail: email.trim() || null,
        applicantPhone: phone.trim() || null,
        guardianName: guardianName.trim() || null,
        guardianPhone: guardianPhone.trim() || null,
        gradeLevel,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Aplicație nouă de admitere"
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90dvh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Aplicație nouă</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Închide"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-year">
              An școlar
            </label>
            <select
              id="app-year"
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-name">
                Numele elevului
              </label>
              <input
                id="app-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ion Popescu"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-email">
                Email
              </label>
              <input
                id="app-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-phone">
                Telefon
              </label>
              <input
                id="app-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-guardian">
                Tutore/Părinți
              </label>
              <input
                id="app-guardian"
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-guardian-phone">
                Tel. tutore
              </label>
              <input
                id="app-guardian-phone"
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="app-grade">
              Clasa dorită
            </label>
            <select
              id="app-grade"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => (
                <option key={g} value={g}>Clasa {g}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border border-input hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !yearId}
            className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {saving ? <Loader2 className="size-4 animate-spin inline mr-1" /> : null}
            Salvează
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Application Detail Panel ─────────────────────────────────────────────────

interface AppDetailProps {
  app: AdmissionApplication;
  onStatusChange: (id: string, status: AdmissionStatus) => Promise<void>;
  onClose: () => void;
}

function AppDetail({ app, onStatusChange, onClose }: AppDetailProps) {
  const [documents, setDocuments] = useState<AdmissionDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [newDocName, setNewDocName] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingDocs(true);
      try {
        const docs = await listDocuments(app.id);
        setDocuments(docs);
      } catch { /* non-blocking */ }
      finally { setLoadingDocs(false); }
    };
    load();
  }, [app.id]);

  const handleAddDoc = async () => {
    if (!newDocName.trim()) return;
    setAddingDoc(true);
    try {
      const doc = await addDocument(app.id, { name: newDocName.trim() });
      setDocuments((prev) => [...prev, doc]);
      setNewDocName("");
    } catch { /* non-blocking */ }
    finally { setAddingDoc(false); }
  };

  const handleDocStatusToggle = async (doc: AdmissionDocument) => {
    const next: AdmissionDocStatus =
      doc.status === "required" ? "received" : doc.status === "received" ? "verified" : "required";
    try {
      const updated = await updateDocument(app.id, doc.id, { status: next });
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch { /* non-blocking */ }
  };

  const handleChangeStatus = async (status: AdmissionStatus) => {
    setChangingStatus(true);
    try {
      await onStatusChange(app.id, status);
    } finally { setChangingStatus(false); }
  };

  const handleEnroll = async () => {
    try {
      const res = await enrollApplication(app.id, {});
      setEnrollMsg(`Înscris! ID elev: ${res.studentId}`);
      await onStatusChange(app.id, "enrolled");
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "Eroare la înscriere");
    }
  };

  const allDocsVerified = documents.length > 0 && documents.every((d) => d.status === "verified");
  const canEnroll = app.status === "accepted" && allDocsVerified;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Detalii aplicație"
    >
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-lg shadow-xl w-full max-w-lg mx-0 sm:mx-4 p-6 overflow-y-auto max-h-[90dvh]">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{app.applicantName}</h2>
            <p className="text-sm text-muted-foreground">Clasa {app.gradeLevel}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring flex-shrink-0"
            aria-label="Închide"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[app.status])}>
            {STATUS_LABELS[app.status]}
          </span>
          {app.guardianName && (
            <span className="text-xs text-muted-foreground">Tutore: {app.guardianName}</span>
          )}
        </div>

        {/* Status actions */}
        <div className="flex gap-2 flex-wrap mb-4">
          {app.status !== "submitted" && app.status !== "review" && app.status !== "accepted" && app.status !== "enrolled" && (
            <button
              onClick={() => handleChangeStatus("submitted")}
              disabled={changingStatus}
              className="px-3 py-1.5 rounded-md text-xs border border-input hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Marchează aplicat
            </button>
          )}
          {app.status === "submitted" && (
            <button
              onClick={() => handleChangeStatus("review")}
              disabled={changingStatus}
              className="px-3 py-1.5 rounded-md text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Trece în analiză
            </button>
          )}
          {app.status === "review" && (
            <>
              <button
                onClick={() => handleChangeStatus("accepted")}
                disabled={changingStatus}
                className="px-3 py-1.5 rounded-md text-xs bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Acceptă
              </button>
              <button
                onClick={() => handleChangeStatus("rejected")}
                disabled={changingStatus}
                className="px-3 py-1.5 rounded-md text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Respinge
              </button>
              <button
                onClick={() => handleChangeStatus("waitlisted")}
                disabled={changingStatus}
                className="px-3 py-1.5 rounded-md text-xs border border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Lista așteptare
              </button>
            </>
          )}
          {canEnroll && (
            <button
              onClick={handleEnroll}
              className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Finalizează înscrierea
            </button>
          )}
        </div>

        {enrollMsg && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300 mb-3">
            {enrollMsg}
          </div>
        )}

        {/* Documents */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Documente ({documents.length})
          </h3>
          {loadingDocs ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {documents.length === 0 && (
                <p className="text-xs text-muted-foreground mb-2">Niciun document adăugat.</p>
              )}
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-2 mb-1.5">
                  <span className="text-foreground">{doc.name}</span>
                  <button
                    onClick={() => handleDocStatusToggle(doc)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring",
                      doc.status === "required" && "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
                      doc.status === "received" && "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
                      doc.status === "verified" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    )}
                    title="Click pentru a avansa statusul documentului"
                  >
                    {DOC_STATUS_LABELS[doc.status]}
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="ex. Certificat de naștere"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddDoc(); }}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleAddDoc}
                  disabled={addingDoc || !newDocName.trim()}
                  className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {addingDoc ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUSES: AdmissionStatus[] = [
  "draft", "submitted", "review", "accepted", "waitlisted", "rejected", "enrolled",
];

export function SchoolAdmissionsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddApp, setShowAddApp] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AdmissionApplication | null>(null);
  const [filterStatus, setFilterStatus] = useState<AdmissionStatus | "all">("all");

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { years: yearsData } = await listAcademicYears();
        setYears(yearsData);
        const currentYear = yearsData.find((y) => y.isCurrent) ?? yearsData[0];
        if (currentYear) {
          setSelectedYearId(currentYear.id);
          const apps = await listApplications({ yearId: currentYear.id });
          setApplications(apps);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionStatus]);

  const handleYearChange = useCallback(async (yearId: string) => {
    setSelectedYearId(yearId);
    setApplications([]);
    try {
      const apps = await listApplications({ yearId });
      setApplications(apps);
    } catch { /* non-blocking */ }
  }, []);

  const handleCreateApp = useCallback(
    async (payload: Parameters<typeof createApplication>[0]) => {
      const app = await createApplication(payload);
      setApplications((prev) => [app, ...prev]);
    },
    []
  );

  const handleStatusChange = useCallback(
    async (id: string, status: AdmissionStatus) => {
      const updated = await updateApplication(id, { status });
      setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setSelectedApp((prev) => (prev?.id === id ? updated : prev));
    },
    []
  );

  if (sessionStatus === "loading") {
    return (
      <AppShell pageTitle="Admitere">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (sessionStatus === "unauthenticated") {
    navigate("/login");
    return null;
  }

  const displayApps =
    filterStatus === "all"
      ? applications
      : applications.filter((a) => a.status === filterStatus);

  return (
    <AppShell pageTitle="Admitere">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Admitere</h1>
          </div>
          <button
            onClick={() => setShowAddApp(true)}
            disabled={years.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Plus className="size-4" aria-hidden="true" />
            Aplicație nouă
          </button>
        </div>

        {/* Year + filter */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="adm-year">
              An școlar
            </label>
            <select
              id="adm-year"
              value={selectedYearId}
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Selectează an școlar"
            >
              <option value="" disabled>Selectează…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}{y.isCurrent ? " (curent)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor="adm-status-filter">
              Status
            </label>
            <select
              id="adm-status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as AdmissionStatus | "all")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Toate ({applications.length})</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]} ({applications.filter((a) => a.status === s).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Applications list */}
        {!loading && (
          <div className="space-y-2">
            {displayApps.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Nicio aplicație de admitere.
                <br />
                Apasă „Aplicație nouă" pentru a adăuga.
              </div>
            ) : (
              displayApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{app.applicantName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Clasa {app.gradeLevel}
                      {app.guardianName ? ` · Tutore: ${app.guardianName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[app.status])}>
                      {STATUS_LABELS[app.status]}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddApp && (
        <AddAppModal
          years={years}
          onSave={handleCreateApp}
          onClose={() => setShowAddApp(false)}
        />
      )}

      {selectedApp && (
        <AppDetail
          app={selectedApp}
          onStatusChange={handleStatusChange}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </AppShell>
  );
}
