/**
 * DIPLOMA-802/803/804 — /app/diplome
 *
 * Section 1: cohort selector
 * Section 2: canvas editor with field drag&drop (DIPLOMA-802)
 * Section 3: participant preview + toggle PDF/JPG + single download (DIPLOMA-803)
 *            multi-select + bulk ZIP download (DIPLOMA-804)
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  PackageOpen,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { listCohorts, type Cohort } from "@/lib/api/cohorts";
import { listParticipants, type CohortParticipant } from "@/lib/api/cohortParticipants";
import { CertificateCanvas } from "@/components/modules/diploma/CertificateCanvas";
import { FieldControls } from "@/components/modules/diploma/FieldControls";
import {
  useCertificateTemplate,
  DEFAULT_FIELDS,
} from "@/hooks/useCertificateTemplate";
import type { FieldsConfig } from "@/lib/api/certificateTemplates";
import { issueCertificate, issueCertificatesBulk } from "@/lib/api/certificates";
import { generateCertificatePdf, downloadBlob, type ExportFormat } from "@/lib/certificateRender";
import { generateBulkZip } from "@/lib/certificateZip";
import { buildCertificateId } from "@/lib/certificateId";
import { normalizeCertificateText } from "@/lib/certificateText";
import { cn } from "@/lib/utils";

// ─── PDF upload helper (PDF rasterized via pdfjs-dist) ────────────────────────

async function pdfToImage(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 3;
  const viewport = page.getViewport({ scale });
  const offscreen = document.createElement("canvas");
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const ctx = offscreen.getContext("2d")!;
  await page.render({ canvas: offscreen, canvasContext: ctx, viewport }).promise;
  return offscreen.toDataURL("image/jpeg", 0.92);
}

// ─── Cohort selector section ──────────────────────────────────────────────────

function CohortSelectorSection({
  cohorts,
  selectedId,
  onSelect,
}: {
  cohorts: Cohort[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border p-4 flex flex-col gap-3">
      <h2 className="text-base font-semibold text-foreground">1. Selectează cohorta</h2>
      {cohorts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nu există cohorte. Creează una în modulul CX.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cohorts.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm border transition-colors",
                selectedId === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
              aria-pressed={selectedId === c.id}
            >
              {c.label}
              <span className="ml-1.5 text-xs opacity-70">
                {c.category === "active" ? "activ" : c.category === "upcoming" ? "viitor" : "trecut"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Background upload section ────────────────────────────────────────────────

function BackgroundUploadSection({
  onBackgroundReady,
}: {
  onBackgroundReady: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      let dataUrl: string;
      if (file.type === "application/pdf") {
        dataUrl = await pdfToImage(file);
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      onBackgroundReady(dataUrl);
    } catch {
      setError("Fișier invalid sau prea mare.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        className="sr-only"
        id="bg-upload-input"
        aria-label="Încarcă fundal diplomă (PNG, JPG sau PDF)"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <label
        htmlFor="bg-upload-input"
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border cursor-pointer transition-colors",
          "bg-background text-foreground border-border hover:bg-muted"
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {uploading ? "Se procesează..." : "Încarcă fundal (PNG/JPG/PDF)"}
      </label>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Manual names textarea ────────────────────────────────────────────────────

function parseManualNames(text: string): string[] {
  return text
    .split(/[\n\r\t]+/)
    .map((n) => normalizeCertificateText(n))
    .filter(Boolean);
}

// ─── Section 3: Participant preview + single download ────────────────────────

interface ParticipantSectionProps {
  cohort: Cohort | null;
  templateId: string | null;
  backgroundUrl: string | null;
  fieldsConfig: FieldsConfig;
}

function ParticipantSection({
  cohort,
  templateId,
  backgroundUrl,
  fieldsConfig,
}: ParticipantSectionProps) {
  const [participants, setParticipants] = useState<CohortParticipant[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualNames, setManualNames] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [generating, setGenerating] = useState(false);
  const [generatingBulk, setGeneratingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // DIPLOMA-804: multi-select state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Load participants when cohort changes
  useEffect(() => {
    if (!cohort) return;
    setLoading(true);
    setCurrentIndex(0);
    setSelectedIndices(new Set());
    listParticipants(cohort.id)
      .then(({ participants: p }) => {
        setParticipants(p);
        // Select all by default
        setSelectedIndices(new Set(p.map((_, i) => i)));
      })
      .catch(() => setParticipants([]))
      .finally(() => setLoading(false));
  }, [cohort?.id]);

  const activeList = manualMode
    ? manualNames
    : participants.map((p) => p.fullName);

  const currentName = activeList[currentIndex] ?? null;
  const total = activeList.length;
  const selectedCount = selectedIndices.size;

  // Toggle individual selection
  function toggleSelect(i: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Select all / deselect all
  function selectAll() { setSelectedIndices(new Set(activeList.map((_, i) => i))); }
  function deselectAll() { setSelectedIndices(new Set()); }

  async function handleDownloadCurrent() {
    if (!currentName || !cohort) return;
    setError(null);
    setGenerating(true);
    try {
      const certId = buildCertificateId("VA", cohort.label, cohort.label, currentIndex);
      const { verificationToken } = await issueCertificate({
        certificateId: certId,
        cohortId: cohort.id,
        templateId,
        participantName: currentName,
        courseName: cohort.label,
        completionDate: cohort.endDate ?? null,
      });

      const blob = await generateCertificatePdf(
        {
          backgroundUrl,
          fieldsConfig,
          participantName: currentName,
          courseName: cohort.label,
          completionDate: cohort.endDate ?? null,
          certificateId: certId,
          verificationToken,
        },
        format
      );

      const ext = format === "pdf" ? "pdf" : "jpg";
      const safeName = currentName.replace(/[^a-zA-Z0-9\-_ ]/g, "_");
      downloadBlob(blob, `Certificat_${safeName}.${ext}`);
    } catch {
      setError("Eroare la generarea certificatului.");
    } finally {
      setGenerating(false);
    }
  }

  // DIPLOMA-804: bulk download
  async function handleDownloadBulkZip() {
    if (!cohort || selectedCount === 0) return;
    setError(null);
    setGeneratingBulk(true);
    setBulkProgress({ done: 0, total: selectedCount });
    try {
      const selectedList = activeList
        .map((name, i) => ({ name, i }))
        .filter(({ i }) => selectedIndices.has(i));

      // Issue all certificates (one bulk API call)
      const { issued } = await issueCertificatesBulk({
        cohortId: cohort.id,
        templateId,
        courseName: cohort.label,
        completionDate: cohort.endDate ?? null,
        participants: selectedList.map(({ name, i }) => ({
          certificateId: buildCertificateId("VA", cohort.label, cohort.label, i),
          participantName: name,
        })),
      });

      // Build token map
      const tokenMap = new Map(issued.map((r) => [r.certificateId, r.verificationToken]));

      // Generate ZIP
      const bulkParticipants = selectedList.map(({ name, i }) => {
        const certId = buildCertificateId("VA", cohort.label, cohort.label, i);
        return {
          index: i,
          name,
          certificateId: certId,
          verificationToken: tokenMap.get(certId) ?? "",
        };
      });

      const zipBlob = await generateBulkZip({
        participants: bulkParticipants,
        renderOptions: {
          backgroundUrl,
          fieldsConfig,
          courseName: cohort.label,
          completionDate: cohort.endDate ?? null,
        },
        format,
        zipName: `Certificate_${cohort.label}.zip`,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      });

      downloadBlob(zipBlob, `Certificate_${cohort.label}.zip`);
    } catch {
      setError("Eroare la generarea ZIP. Încearcă din nou.");
    } finally {
      setGeneratingBulk(false);
      setBulkProgress(null);
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">3. Generare certificate</h2>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setManualMode(false); setCurrentIndex(0); setSelectedIndices(new Set()); }}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm border transition-colors",
            !manualMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"
          )}
          aria-pressed={!manualMode}
        >
          Din cohortă
        </button>
        <button
          onClick={() => { setManualMode(true); setCurrentIndex(0); setSelectedIndices(new Set()); }}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm border transition-colors",
            manualMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"
          )}
          aria-pressed={manualMode}
        >
          Paste manual
        </button>
      </div>

      {/* Manual mode textarea */}
      {manualMode && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="manual-names-input">
            Lipește numele (un rând per cursant):
          </label>
          <textarea
            id="manual-names-input"
            className="border border-input rounded px-3 py-2 text-sm bg-background text-foreground min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary"
            value={manualText}
            onChange={(e) => {
              setManualText(e.target.value);
              const parsed = parseManualNames(e.target.value);
              setManualNames(parsed);
              setCurrentIndex(0);
              setSelectedIndices(new Set(parsed.map((_, i) => i)));
            }}
            placeholder={"Ion Popescu\nMaria Ionescu\nAndrei Vlad"}
          />
          <p className="text-xs text-muted-foreground">{manualNames.length} cursanți detectați</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Se încarcă participanții...
        </div>
      )}

      {/* Participant list (DIPLOMA-804 multi-select) */}
      {!loading && total > 0 && (
        <div className="flex flex-col gap-4">
          {/* Select all / deselect all + badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
              aria-label="Selectează toți cursanții"
            >
              Selectează toți
            </button>
            <button
              onClick={deselectAll}
              className="text-xs text-muted-foreground hover:underline"
              aria-label="Deselectează toți cursanții"
            >
              Deselectează toți
            </button>
            <span className="text-xs text-muted-foreground ml-auto">
              {selectedCount}/{total} selectați
            </span>
          </div>

          {/* Participant checkboxes */}
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto border border-border rounded-md px-3 py-2">
            {activeList.map((name, i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer py-0.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selectedIndices.has(i)}
                  onChange={() => toggleSelect(i)}
                  aria-label={`Selectează ${name}`}
                />
                <span
                  className={cn(
                    "text-foreground",
                    currentIndex === i ? "font-semibold" : ""
                  )}
                  onClick={() => setCurrentIndex(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setCurrentIndex(i)}
                >
                  {name}
                </span>
              </label>
            ))}
          </div>

          {/* Single navigator */}
          <div className="flex items-center gap-3 border-t border-border pt-3">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              aria-label="Participantul anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-base font-semibold text-foreground">{currentName}</p>
              <p className="text-xs text-muted-foreground">{currentIndex + 1} / {total}</p>
            </div>
            <button
              onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
              disabled={currentIndex === total - 1}
              className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              aria-label="Participantul următor"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Format toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Format:</span>
            {(["pdf", "jpg"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-colors",
                  format === f ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"
                )}
                aria-pressed={format === f}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Single download */}
            <button
              onClick={() => void handleDownloadCurrent()}
              disabled={generating || generatingBulk || !currentName || !cohort}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              aria-label={`Descarcă certificat ${format.toUpperCase()} pentru ${currentName ?? ""}`}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {generating ? "Se generează..." : `Descarcă Curent (${format.toUpperCase()})`}
            </button>

            {/* Bulk ZIP download — DIPLOMA-804 */}
            <button
              onClick={() => void handleDownloadBulkZip()}
              disabled={generatingBulk || generating || selectedCount === 0 || !cohort}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
              aria-label={`Descarcă toate cele ${selectedCount} certificate selectate ca ZIP`}
            >
              {generatingBulk ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PackageOpen className="h-4 w-4" aria-hidden="true" />
              )}
              {generatingBulk
                ? bulkProgress
                  ? `Se generează ${bulkProgress.done}/${bulkProgress.total}...`
                  : "Se pregătește..."
                : `Descarcă Toate (${selectedCount}) — ZIP (${format.toUpperCase()})`}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      )}

      {!loading && total === 0 && !manualMode && (
        <p className="text-sm text-muted-foreground">
          {cohort ? "Nu există participanți în această cohortă." : "Selectează o cohortă mai sus."}
        </p>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DiplomaPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(true);

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) ?? null;
  const courseId = selectedCohort?.courseId ?? null;

  const {
    templateState,
    loading: templateLoading,
    error: templateError,
    setFieldsConfig,
    setBackgroundUrl,
    setUseCourseScopedTemplate,
    saveGlobal,
    saveCourse,
    saving,
  } = useCertificateTemplate({ courseId, cohortId: selectedCohortId });

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadCohorts = useCallback(async () => {
    setCohortsLoading(true);
    try {
      const { cohorts: c } = await listCohorts();
      setCohorts(c);
      const active = c.filter((x) => x.category === "active");
      if (active.length > 0) setSelectedCohortId(active[0].id);
      else if (c.length > 0) setSelectedCohortId(c[0].id);
    } finally {
      setCohortsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCohorts();
  }, [loadCohorts]);

  function handleReset() {
    setFieldsConfig(DEFAULT_FIELDS);
  }

  const isLoading = cohortsLoading || templateLoading;

  return (
    <AppShell pageTitle="Diplome">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Diplome</h1>
            <p className="text-sm text-muted-foreground">
              Editează template-ul și generează certificate pentru cursanți.
            </p>
          </div>
        </div>

        {/* Global error */}
        {templateError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {templateError}
          </div>
        )}

        {/* Section 1 — Cohort selector */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă...
          </div>
        ) : (
          <CohortSelectorSection
            cohorts={cohorts}
            selectedId={selectedCohortId}
            onSelect={setSelectedCohortId}
          />
        )}

        {/* Section 2 — Canvas editor */}
        <section className="rounded-lg border border-border p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-foreground">2. Editor template</h2>
            <button
              onClick={() => setShowEditor((v) => !v)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showEditor}
              aria-controls="editor-panel"
            >
              {showEditor ? (
                <>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" /> Ascunde editor
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" /> Arată editor
                </>
              )}
            </button>
          </div>

          {showEditor && (
            <div id="editor-panel" className="flex flex-col lg:flex-row gap-4">
              {/* Left panel: field controls */}
              <aside
                className="w-full lg:w-72 shrink-0 flex flex-col gap-3"
                aria-label="Controale câmpuri certificat"
              >
                {/* Background upload */}
                <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Fundal</h3>
                  <BackgroundUploadSection onBackgroundReady={setBackgroundUrl} />
                </div>

                {/* Course-specific template toggle */}
                {courseId && (
                  <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={templateState.useCourseScopedTemplate}
                      onChange={(e) => setUseCourseScopedTemplate(e.target.checked)}
                      aria-label="Folosește template specific cursului"
                    />
                    <span className="text-sm text-foreground">Template specific cursului</span>
                  </label>
                )}

                {/* Field controls */}
                <FieldControls
                  fieldsConfig={templateState.fieldsConfig}
                  onFieldsChange={setFieldsConfig}
                />

                {/* Save / reset buttons */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => void saveGlobal()}
                    disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    aria-label="Salvează template global"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    Salvează Global
                  </button>
                  {courseId && (
                    <button
                      onClick={() => void saveCourse()}
                      disabled={saving}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
                      aria-label="Salvează template pentru curs"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-4 w-4" aria-hidden="true" />
                      )}
                      Salvează pt Curs
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm border border-border text-foreground hover:bg-muted transition-colors"
                    aria-label="Resetează la valorile implicite"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Reset
                  </button>
                </div>
              </aside>

              {/* Canvas */}
              <div className="flex-1 min-w-0">
                <CertificateCanvas
                  backgroundUrl={templateState.backgroundUrl}
                  fieldsConfig={templateState.fieldsConfig as FieldsConfig}
                  onFieldsChange={setFieldsConfig}
                />
              </div>
            </div>
          )}
        </section>

        {/* Section 3 — Participant preview + single download (DIPLOMA-803) */}
        <ParticipantSection
          cohort={selectedCohort}
          templateId={templateState.globalId ?? templateState.courseId}
          backgroundUrl={templateState.backgroundUrl}
          fieldsConfig={templateState.fieldsConfig as FieldsConfig}
        />
      </div>
    </AppShell>
  );
}
