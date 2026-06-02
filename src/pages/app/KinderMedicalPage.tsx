/**
 * KINDER-004 — /app/kinder/students/:studentId/medical
 *
 * Medical profile per child with 3 tabs:
 * - Alergii: allergy list with reaction severity badges
 * - Vaccinuri: immunization records with due-date status
 * - Medicamente azi: today's medication administration log
 */
import { useEffect, useState } from "react";
import { useRouter } from "@/router/HashRouter";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getMedicalProfile,
  addAllergy,
  removeAllergy,
  addImmunization,
  logMedication,
  type ChildAllergy,
  type ImmunizationRecord,
  type MedicationLogEntry,
  type ReactionType,
} from "@/lib/api/kinder";
import {
  AlertTriangle,
  PlusCircle,
  Trash2,
  Loader2,
  AlertCircle,
  Syringe,
  Pill,
  ShieldCheck,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reactionBadge(rt: ReactionType) {
  const map: Record<ReactionType, { label: string; cls: string }> = {
    mild: { label: "Ușoară", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    moderate: { label: "Moderată", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
    severe: { label: "Severă", cls: "bg-destructive/15 text-destructive" },
  };
  const { label, cls } = map[rt];
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", cls)}>{label}</span>
  );
}

function immStatusBadge(nextDueDate: string | null) {
  if (!nextDueDate) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Fără scadență</span>;
  }
  const today = todayStr();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const threshold = in30.toISOString().slice(0, 10);

  if (nextDueDate < today) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Expirat</span>;
  }
  if (nextDueDate <= threshold) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Scadent în 30 zile</span>;
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">La zi</span>;
}

// ─── Add Allergy Modal ────────────────────────────────────────────────────────

interface AddAllergyModalProps {
  studentId: string;
  onSaved: (allergy: ChildAllergy) => void;
  onClose: () => void;
}

function AddAllergyModal({ studentId, onSaved, onClose }: AddAllergyModalProps) {
  const [allergen, setAllergen] = useState("");
  const [reactionType, setReactionType] = useState<ReactionType>("mild");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allergen.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const allergy = await addAllergy(studentId, {
        allergen: allergen.trim(),
        reactionType,
        notes: notes.trim() || undefined,
      });
      onSaved(allergy);
    } catch {
      setError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Adaugă alergie</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="allergen" className="block text-sm font-medium text-foreground mb-1">
              Alergen <span className="text-destructive">*</span>
            </label>
            <input
              id="allergen"
              type="text"
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="ex: Lactate, Ouă, Gluten..."
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="reactionType" className="block text-sm font-medium text-foreground mb-1">
              Tip reacție
            </label>
            <select
              id="reactionType"
              value={reactionType}
              onChange={(e) => setReactionType(e.target.value as ReactionType)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="mild">Ușoară</option>
              <option value="moderate">Moderată</option>
              <option value="severe">Severă</option>
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1">
              Note
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Detalii suplimentare..."
            />
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading || !allergen.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Immunization Modal ───────────────────────────────────────────────────

interface AddImmunizationModalProps {
  studentId: string;
  onSaved: (record: ImmunizationRecord) => void;
  onClose: () => void;
}

function AddImmunizationModal({ studentId, onSaved, onClose }: AddImmunizationModalProps) {
  const [vaccineName, setVaccineName] = useState("");
  const [administeredDate, setAdministeredDate] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vaccineName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const record = await addImmunization(studentId, {
        vaccineName: vaccineName.trim(),
        administeredDate: administeredDate || undefined,
        nextDueDate: nextDueDate || undefined,
        provider: provider.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved(record);
    } catch {
      setError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Adaugă vaccin</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="vaccine" className="block text-sm font-medium text-foreground mb-1">
              Vaccin <span className="text-destructive">*</span>
            </label>
            <input
              id="vaccine"
              type="text"
              value={vaccineName}
              onChange={(e) => setVaccineName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="ex: ROR, DTP, VHB..."
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adminDate" className="block text-sm font-medium text-foreground mb-1">
                Data administrare
              </label>
              <input
                id="adminDate"
                type="date"
                value={administeredDate}
                onChange={(e) => setAdministeredDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-foreground mb-1">
                Scadență
              </label>
              <input
                id="dueDate"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-foreground mb-1">
              Furnizor / Doctor
            </label>
            <input
              id="provider"
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="ex: Dr. Popescu, Spitalul X"
            />
          </div>
          <div>
            <label htmlFor="immNotes" className="block text-sm font-medium text-foreground mb-1">
              Note
            </label>
            <textarea
              id="immNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading || !vaccineName.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Medication Modal ─────────────────────────────────────────────────────

interface AddMedicationModalProps {
  studentId: string;
  onSaved: (entry: MedicationLogEntry) => void;
  onClose: () => void;
}

function AddMedicationModal({ studentId, onSaved, onClose }: AddMedicationModalProps) {
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [parentConsent, setParentConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!medicationName.trim() || !dosage.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const entry = await logMedication(studentId, {
        medicationName: medicationName.trim(),
        dosage: dosage.trim(),
        parentConsent,
        notes: notes.trim() || undefined,
      });
      onSaved(entry);
    } catch {
      setError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Înregistrează medicament</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="medName" className="block text-sm font-medium text-foreground mb-1">
              Medicament <span className="text-destructive">*</span>
            </label>
            <input
              id="medName"
              type="text"
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="ex: Nurofen, Paracetamol..."
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="dosage" className="block text-sm font-medium text-foreground mb-1">
              Doză <span className="text-destructive">*</span>
            </label>
            <input
              id="dosage"
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="ex: 5ml, 1 comprimat..."
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="consent"
              type="checkbox"
              checked={parentConsent}
              onChange={(e) => setParentConsent(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="consent" className="text-sm text-foreground">
              Consimțământ parental obținut
            </label>
          </div>
          <div>
            <label htmlFor="medNotes" className="block text-sm font-medium text-foreground mb-1">
              Note
            </label>
            <textarea
              id="medNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Observații..."
            />
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading || !medicationName.trim() || !dosage.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "allergies" | "immunizations" | "medications";

export function KinderMedicalPage() {
  const { path } = useRouter();
  const { data: session } = useSession();

  // Extract studentId from path: /app/kinder/students/:studentId/medical
  const parts = path.split("/");
  const studentId = parts[4] ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("allergies");
  const [allergies, setAllergies] = useState<ChildAllergy[]>([]);
  const [immunizations, setImmunizations] = useState<ImmunizationRecord[]>([]);
  const [medications, setMedications] = useState<MedicationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [showAddImmunization, setShowAddImmunization] = useState(false);
  const [showAddMedication, setShowAddMedication] = useState(false);

  const [deletingAllergyId, setDeletingAllergyId] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !studentId) return;
    setLoading(true);
    getMedicalProfile(studentId)
      .then((data) => {
        setAllergies(data.allergies);
        setImmunizations(data.immunizations);
        setMedications(data.todayMedications);
      })
      .catch(() => setError("Nu s-au putut încărca datele medicale."))
      .finally(() => setLoading(false));
  }, [session, studentId]);

  async function handleDeleteAllergy(allergyId: string) {
    setDeletingAllergyId(allergyId);
    try {
      await removeAllergy(studentId, allergyId);
      setAllergies((prev) => prev.filter((a) => a.id !== allergyId));
    } catch {
      // silently fail — leave the row
    } finally {
      setDeletingAllergyId(null);
    }
  }

  const hasSevereAllergy = allergies.some((a) => a.reactionType === "severe");

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "allergies", label: "Alergii", icon: <AlertTriangle className="w-4 h-4" /> },
    { id: "immunizations", label: "Vaccinuri", icon: <Syringe className="w-4 h-4" /> },
    { id: "medications", label: "Medicamente azi", icon: <Pill className="w-4 h-4" /> },
  ];

  return (
    <AppShell
      pageTitle="Profil medical"
      pageDescription="Alergii, vaccinuri și medicamente administrate"
    >
      {/* Severe allergy banner */}
      {hasSevereAllergy && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          Atenție: acest copil are alergii severe. Verificați lista înainte de masă.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Se încarcă...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-destructive text-sm py-6">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── ALLERGIES TAB ──────────────────────────────────────────── */}
          {activeTab === "allergies" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{allergies.length} alergii înregistrate</p>
                <button
                  onClick={() => setShowAddAllergy(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Adaugă alergie
                </button>
              </div>

              {allergies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nicio alergie înregistrată.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Alergen</th>
                        <th className="text-left px-4 py-3 font-medium">Tip reacție</th>
                        <th className="text-left px-4 py-3 font-medium">Note</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {allergies.map((a) => (
                        <tr key={a.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{a.allergen}</td>
                          <td className="px-4 py-3">{reactionBadge(a.reactionType)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{a.notes ?? "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteAllergy(a.id)}
                              disabled={deletingAllergyId === a.id}
                              aria-label="Șterge alergie"
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            >
                              {deletingAllergyId === a.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── IMMUNIZATIONS TAB ──────────────────────────────────────── */}
          {activeTab === "immunizations" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{immunizations.length} vaccinuri înregistrate</p>
                <button
                  onClick={() => setShowAddImmunization(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Adaugă vaccin
                </button>
              </div>

              {immunizations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Syringe className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nicio evidență de vaccinare.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Vaccin</th>
                        <th className="text-left px-4 py-3 font-medium">Administrat</th>
                        <th className="text-left px-4 py-3 font-medium">Scadență</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Furnizor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {immunizations.map((imm) => (
                        <tr key={imm.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{imm.vaccineName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(imm.administeredDate)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(imm.nextDueDate)}</td>
                          <td className="px-4 py-3">{immStatusBadge(imm.nextDueDate)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{imm.provider ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── MEDICATIONS TAB ────────────────────────────────────────── */}
          {activeTab === "medications" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  {medications.length} medicamente administrate astăzi
                </p>
                <button
                  onClick={() => setShowAddMedication(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Înregistrează medicament
                </button>
              </div>

              {medications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Pill className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Niciun medicament administrat azi.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Medicament</th>
                        <th className="text-left px-4 py-3 font-medium">Doză</th>
                        <th className="text-left px-4 py-3 font-medium">Ora</th>
                        <th className="text-left px-4 py-3 font-medium">Consimțământ</th>
                        <th className="text-left px-4 py-3 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medications.map((med) => (
                        <tr key={med.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{med.medicationName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{med.dosage}</td>
                          <td className="px-4 py-3 text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDateTime(med.administeredAt)}
                          </td>
                          <td className="px-4 py-3">
                            {med.parentConsent ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Da
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Nu</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{med.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddAllergy && (
        <AddAllergyModal
          studentId={studentId}
          onSaved={(allergy) => {
            setAllergies((prev) => [...prev, allergy]);
            setShowAddAllergy(false);
          }}
          onClose={() => setShowAddAllergy(false)}
        />
      )}
      {showAddImmunization && (
        <AddImmunizationModal
          studentId={studentId}
          onSaved={(record) => {
            setImmunizations((prev) => [...prev, record]);
            setShowAddImmunization(false);
          }}
          onClose={() => setShowAddImmunization(false)}
        />
      )}
      {showAddMedication && (
        <AddMedicationModal
          studentId={studentId}
          onSaved={(entry) => {
            setMedications((prev) => [...prev, entry]);
            setShowAddMedication(false);
          }}
          onClose={() => setShowAddMedication(false)}
        />
      )}
    </AppShell>
  );
}
