/**
 * TRUST-003: FinDesk Security & Privacy Settings page
 *
 * Route: /app/fin/settings/security
 *
 * Reunite toate controalele de privacy GDPR ale FinDesk:
 * 1. Pseudonimizare AI — toggle pseudonymize_ai_prompts
 * 2. Retenție log AI — input numeric ai_log_retention_days
 * 3. Retenție date elevi — input numeric retention_days_students
 * 4. AI Opt-In — toggle ai_opt_in cu avertisment
 * 5. Export GDPR — dialog cu ID elev → download JSON
 * 6. Anonimizare elevi inactivi — dialog cu confirmare
 *
 * FIN-CORE §1.16 — GDPR layer complet.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  Shield,
  Eye,
  EyeOff,
  Clock,
  Users,
  Brain,
  Download,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Save,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useSession } from "@/hooks/useSession";
import {
  getDataSettings,
  patchDataSettings,
  downloadGdprExport,
  anonymizeOldStudents,
  type DataSettings,
} from "@/lib/api/finGdpr";

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Card component ──────────────────────────────────────────────────────────

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <label htmlFor={id} className="text-sm text-foreground cursor-pointer">
        {checked ? "Activat" : "Dezactivat"}
      </label>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FinSecuritySettingsPage() {
  const { status: sessionStatus } = useSession();

  const [settings, setSettings] = useState<DataSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GDPR Export dialog
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStudentId, setExportStudentId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Anonymise dialog
  const [showAnonDialog, setShowAnonDialog] = useState(false);
  const [anonymising, setAnonymising] = useState(false);
  const [anonResult, setAnonResult] = useState<number | null>(null);

  // Local form state (mirrors server settings)
  const [pseudonymize, setPseudonymize] = useState(true);
  const [aiRetention, setAiRetention] = useState(90);
  const [studentRetention, setStudentRetention] = useState(1825);
  const [aiOptIn, setAiOptIn] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    setLoading(true);
    getDataSettings()
      .then((s) => {
        setSettings(s);
        setPseudonymize(s.pseudonymizeAiPrompts);
        setAiRetention(s.aiLogRetentionDays);
        setStudentRetention(s.retentionDaysStudents);
        setAiOptIn(s.aiOptIn);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, [sessionStatus]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveOk(false);
    try {
      const updated = await patchDataSettings({
        pseudonymizeAiPrompts: pseudonymize,
        aiLogRetentionDays: clamp(aiRetention, 1, 365),
        retentionDaysStudents: clamp(studentRetention, 365, 3650),
        aiOptIn,
      });
      setSettings(updated);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function handleGdprExport() {
    if (!exportStudentId.trim()) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadGdprExport(exportStudentId.trim());
      setShowExportDialog(false);
      setExportStudentId("");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Eroare la export");
    } finally {
      setExporting(false);
    }
  }

  async function handleAnonymise() {
    setAnonymising(true);
    try {
      const res = await anonymizeOldStudents();
      setAnonResult(res.anonymized);
      setShowAnonDialog(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la anonimizare");
    } finally {
      setAnonymising(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <BusinessShell pageTitle="Securitate — FinDesk">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell pageTitle="Securitate & Confidențialitate — FinDesk">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Securitate & Confidențialitate
            </h1>
            <p className="text-sm text-muted-foreground">
              Setări GDPR FinDesk — pseudonimizare, retenție date, export și anonimizare
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Success banner */}
        {saveOk && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Setările au fost salvate cu succes.
          </div>
        )}

        {/* Anonymise result */}
        {anonResult !== null && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-4 py-2 text-sm text-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {anonResult} elevi inactivi anonimizați conform politicii GDPR.
          </div>
        )}

        {/* Card 1 — Pseudonimizare AI */}
        <SettingsCard
          icon={Eye}
          title="Pseudonimizare AI"
          description="Când activat, datele personale (nume, email, IBAN, telefon) sunt înlocuite cu tokeni înainte de a fi trimise la modelul AI. GDPR implicit."
        >
          <Toggle
            id="toggle-pseudonymize"
            checked={pseudonymize}
            onChange={setPseudonymize}
            label="Pseudonimizare automată înainte de prompt AI"
          />
          {!pseudonymize && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              Atenție: dezactivarea pseudonimizării poate trimite date personale la furnizorul AI.
              Asigurați-vă că aveți consimțământ explicit (Art. 6 GDPR).
            </p>
          )}
        </SettingsCard>

        {/* Card 2 — Retenție log AI */}
        <SettingsCard
          icon={Clock}
          title="Retenție jurnal AI"
          description="Numărul de zile pentru care se păstrează jurnalul apelurilor AI (ai_audit_log). Rândurile mai vechi sunt șterse la purge manual."
        >
          <div className="flex items-center gap-3">
            <label
              htmlFor="input-ai-retention"
              className="text-sm text-muted-foreground w-40 shrink-0"
            >
              Retenție (zile)
            </label>
            <input
              id="input-ai-retention"
              type="number"
              min={1}
              max={365}
              value={aiRetention}
              onChange={(e) => setAiRetention(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">zile (1–365)</span>
          </div>
        </SettingsCard>

        {/* Card 3 — Retenție date elevi */}
        <SettingsCard
          icon={Users}
          title="Retenție date elevi"
          description="Numărul de zile după care datele personale ale elevilor inactivi sunt anonimizate (GDPR Art. 5(1)(e) — limitarea stocării). Default: 1825 zile (5 ani)."
        >
          <div className="flex items-center gap-3">
            <label
              htmlFor="input-student-retention"
              className="text-sm text-muted-foreground w-40 shrink-0"
            >
              Retenție (zile)
            </label>
            <input
              id="input-student-retention"
              type="number"
              min={365}
              max={3650}
              value={studentRetention}
              onChange={(e) => setStudentRetention(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">zile (365–3650)</span>
          </div>
        </SettingsCard>

        {/* Card 4 — AI Opt-In */}
        <SettingsCard
          icon={Brain}
          title="Consimțământ AI"
          description="Tenantul a dat consimțământ explicit pentru prelucrarea datelor de AI (Art. 6(1)(a) GDPR). Necesar pentru funcții AI avansate."
        >
          <Toggle
            id="toggle-ai-opt-in"
            checked={aiOptIn}
            onChange={setAiOptIn}
            label="Consimțământ explicit pentru prelucrare AI"
          />
          {aiOptIn && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
              Tenantul a confirmat că are baza legală pentru prelucrarea datelor personale
              prin servicii AI externe (Art. 28 GDPR — relație operator-operator).
            </p>
          )}
        </SettingsCard>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se salvează...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                Salvează setările
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        <hr className="border-border" />

        {/* GDPR Actions */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Acțiuni GDPR</h2>
          <p className="text-sm text-muted-foreground">
            Aceste acțiuni sunt ireversibile. Folosiți-le cu grijă.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Export GDPR */}
            <button
              onClick={() => setShowExportDialog(true)}
              className="flex items-center gap-3 rounded-lg border border-input bg-card px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
              <div>
                <div className="font-medium text-foreground">Export date elev</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  GDPR Art. 20 — portabilitate date (JSON)
                </div>
              </div>
            </button>

            {/* Anonymise old students */}
            <button
              onClick={() => setShowAnonDialog(true)}
              className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-left text-sm hover:bg-destructive/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              <UserX className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
              <div>
                <div className="font-medium text-foreground">Anonimizare elevi inactivi</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  GDPR Art. 5(1)(e) — elevi inactivi &gt; {studentRetention} zile
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* GDPR Export dialog */}
      {showExportDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <Download className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 id="export-dialog-title" className="font-semibold text-foreground">
                  Export GDPR date elev
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Introduceți ID-ul elevului pentru a descărca datele sale personale în format JSON.
                </p>
              </div>
            </div>

            {exportError && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {exportError}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="export-student-id" className="text-xs text-muted-foreground">
                ID elev (UUID)
              </label>
              <input
                id="export-student-id"
                type="text"
                value={exportStudentId}
                onChange={(e) => setExportStudentId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowExportDialog(false); setExportError(null); }}
                disabled={exporting}
                className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Anulare
              </button>
              <button
                onClick={handleGdprExport}
                disabled={exporting || !exportStudentId.trim()}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se descarcă...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Descarcă JSON
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anonymise confirmation dialog */}
      {showAnonDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="anon-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-destructive/10 shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              </div>
              <div>
                <h2 id="anon-dialog-title" className="font-semibold text-foreground">
                  Confirmare anonimizare
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vor fi anonimizate datele personale (nume, email, telefon, dată naștere)
                  ale tuturor elevilor inactivi de mai mult de{" "}
                  <span className="font-medium text-foreground">{studentRetention} zile</span>.
                  Această acțiune este ireversibilă.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAnonDialog(false)}
                disabled={anonymising}
                className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Anulare
              </button>
              <button
                onClick={handleAnonymise}
                disabled={anonymising}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 flex items-center gap-2"
              >
                {anonymising ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se procesează...
                  </>
                ) : (
                  <>
                    <UserX className="h-4 w-4" aria-hidden="true" />
                    Anonimizează acum
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </BusinessShell>
  );
}
