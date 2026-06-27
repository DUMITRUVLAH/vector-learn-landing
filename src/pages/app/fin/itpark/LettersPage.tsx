/**
 * ITPARK-501: Scrisori de confirmare — 5 letters pre-filled from engagement data
 * Route: /app/fin/itpark/:id/scrisori
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 *
 * Letter kinds:
 *   letter_no_adjustments  — scrisoare că nu există ajustări
 *   letter_address         — scrisoare privind adresa juridică
 *   letter_no_subdivisions — scrisoare că nu există subdiviziuni
 *   letter_activity        — scrisoare privind obiectul de activitate
 *   letter_solvency        — scrisoare privind solvabilitatea
 *
 * Each letter: pre-filled body (no XXX/placeholder), text editor, draft/ready toggle, persist
 * Print-friendly, design-system, dark mode, a11y.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Printer,
  AlertCircle,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  Clock,
  Save,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import {
  listDocs,
  upsertDoc,
  type PacketDocument,
  type DocStatus,
  type PacketKind,
} from "@/lib/api/itparkDocs";
import { generateLetterBodies, type LetterData } from "@/lib/itpark/letterTemplates";
import { cn } from "@/lib/utils";

// ─── Letter kind config ───────────────────────────────────────────────────────

const LETTER_KINDS: PacketKind[] = [
  "letter_no_adjustments",
  "letter_address",
  "letter_no_subdivisions",
  "letter_activity",
  "letter_solvency",
];

const LETTER_LABELS: Record<string, string> = {
  letter_no_adjustments: "Absența ajustărilor",
  letter_address: "Adresă juridică",
  letter_no_subdivisions: "Absența subdiviziunilor",
  letter_activity: "Obiect de activitate",
  letter_solvency: "Solvabilitate",
};

// ─── Single letter editor card ────────────────────────────────────────────────

interface LetterCardProps {
  kind: PacketKind;
  letterData: LetterData;
  existingDoc: PacketDocument | undefined;
  engagementId: string;
  onSaved: (doc: PacketDocument) => void;
}

function LetterCard({ kind, letterData, existingDoc, engagementId, onSaved }: LetterCardProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string>(
    // Use persisted body if available, else generated template
    (() => {
      if (existingDoc?.dataJson && typeof existingDoc.dataJson === "object") {
        const d = existingDoc.dataJson as { body?: string };
        if (d.body) return d.body;
      }
      return letterData.body;
    })()
  );
  const [date, setDate] = useState<string>(
    (() => {
      if (existingDoc?.dataJson && typeof existingDoc.dataJson === "object") {
        const d = existingDoc.dataJson as { date?: string };
        if (d.date) return d.date;
      }
      return letterData.date;
    })()
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentStatus: DocStatus = existingDoc?.status ?? "draft";

  const handleSave = async (newStatus?: DocStatus) => {
    try {
      setSaving(true);
      setSaveError(null);
      const status = newStatus ?? currentStatus;
      const doc = await upsertDoc(engagementId, kind, {
        status,
        dataJson: {
          body,
          date,
          title: letterData.title,
          signatory: letterData.signatory,
          signatoryPosition: letterData.signatoryPosition,
        },
      });
      onSaved(doc);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = () => {
    const next: DocStatus = currentStatus === "draft" ? "ready" : "draft";
    handleSave(next);
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden transition-all",
        currentStatus === "ready"
          ? "border-success/40"
          : "border-border"
      )}
    >
      {/* Header / Accordion toggle */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] min-h-[56px]"
        aria-label={`${open ? "Restrânge" : "Extinde"} scrisoarea ${letterData.title}`}
      >
        <div className="flex items-center gap-3">
          {currentStatus === "ready" ? (
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">{letterData.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {LETTER_LABELS[kind]} ·{" "}
              <span
                className={cn(
                  "font-medium",
                  currentStatus === "ready" ? "text-success" : "text-muted-foreground"
                )}
              >
                {currentStatus === "ready" ? "Gata" : "Ciornă"}
              </span>
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
          {/* Date field */}
          <div>
            <label
              htmlFor={`letter-date-${kind}`}
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Data scrisorii
            </label>
            <input
              id={`letter-date-${kind}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-40"
              aria-label="Data scrisorii"
            />
          </div>

          {/* Body editor */}
          <div>
            <label
              htmlFor={`letter-body-${kind}`}
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Conținut scrisoare
            </label>
            <textarea
              id={`letter-body-${kind}`}
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              aria-label={`Conținut scrisoare ${letterData.title}`}
              spellCheck
            />
          </div>

          {/* Signatory (read-only display) */}
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Semnatar</p>
            <p className="font-medium text-foreground">{letterData.signatoryPosition}</p>
            <p className="text-muted-foreground">{letterData.signatory}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {saveError && (
              <span className="text-xs text-destructive" role="alert">
                {saveError}
              </span>
            )}
            {saved && (
              <span className="text-xs text-success" role="status">
                Salvat
              </span>
            )}
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 min-h-[40px]"
              aria-label="Salvează scrisoarea"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="w-4 h-4" aria-hidden="true" />
              )}
              Salvează
            </button>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 min-h-[40px]",
                currentStatus === "ready"
                  ? "bg-muted text-muted-foreground hover:bg-muted/70 border border-border"
                  : "bg-success text-success-foreground hover:bg-success/90"
              )}
              aria-label={
                currentStatus === "ready"
                  ? "Revert la ciornă"
                  : "Marchează ca Gata"
              }
            >
              {currentStatus === "ready" ? (
                <>
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  Revert la ciornă
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  Marchează Gata
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[40px]"
              aria-label={`Printează ${letterData.title}`}
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Printează</span>
            </button>
          </div>

          {/* Print-only formatted letter */}
          <div className="hidden print:block mt-6 border-t border-gray-300 pt-6">
            <div className="text-right text-sm text-gray-600 mb-6">
              <p>{letterData.signatory}</p>
              <p>Data: {date}</p>
            </div>
            <h2 className="text-lg font-bold text-center mb-6">{letterData.title}</h2>
            <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">
              {body}
            </pre>
            <div className="mt-12 text-sm">
              <p className="mb-1">{letterData.signatoryPosition},</p>
              <p className="font-medium">{letterData.signatory}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LettersPage() {
  const { path, navigate } = useRouter();

  // Extract engagementId from URL: /app/fin/itpark/:id/scrisori
  const engagementId =
    path.match(/^\/app\/fin\/itpark\/([^/]+)\/scrisori$/)?.[1] ?? "";

  const [eng, setEng] = useState<ItparkEngagement | null>(null);
  const [docs, setDocs] = useState<PacketDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!engagementId) return;
    try {
      setLoading(true);
      setError(null);
      const [engData, docsData] = await Promise.all([
        getEngagement(engagementId),
        listDocs(engagementId).catch(() => [] as PacketDocument[]),
      ]);
      setEng(engData);
      setDocs(docsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDocSaved = useCallback((saved: PacketDocument) => {
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.kind === saved.kind);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
  }, []);

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <BusinessShell pageTitle="Scrisori de confirmare">
        <div
          className="flex items-center justify-center min-h-64"
          aria-label="Se încarcă scrisorile"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      </BusinessShell>
    );
  }

  if (error || !eng) {
    return (
      <BusinessShell pageTitle="Scrisori — Eroare">
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-lg mx-4 mt-4"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-sm">{error ?? "Dosarul nu a fost găsit"}</span>
        </div>
      </BusinessShell>
    );
  }

  // Generate letter bodies from engagement data
  const letterBodies = generateLetterBodies(eng);

  // Count ready letters
  const readyCount = LETTER_KINDS.filter((k) => {
    const doc = docs.find((d) => d.kind === k);
    return doc?.status === "ready";
  }).length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <BusinessShell pageTitle={`Scrisori — ${eng.residentName} ${eng.reportingYear}`}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/app/fin/itpark/${eng.id}`)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Înapoi la dosar"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              Scrisori de confirmare
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {eng.residentName} · {eng.reportingYear} ·{" "}
              <span
                className={cn(
                  "font-medium",
                  readyCount === LETTER_KINDS.length ? "text-success" : "text-muted-foreground"
                )}
              >
                {readyCount}/{LETTER_KINDS.length} gata
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ─── Progress indicator ──────────────────────────────────── */}
      <div className="px-4 py-4 print:hidden">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">Progres scrisori</span>
          <span className="text-xs font-medium text-foreground ml-auto">
            {readyCount}/{LETTER_KINDS.length}
          </span>
        </div>
        <div
          className="h-2 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={readyCount}
          aria-valuemin={0}
          aria-valuemax={LETTER_KINDS.length}
          aria-label={`${readyCount} din ${LETTER_KINDS.length} scrisori gata`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              readyCount === LETTER_KINDS.length ? "bg-success" : "bg-primary"
            )}
            style={{ width: `${(readyCount / LETTER_KINDS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ─── Letter cards ────────────────────────────────────────── */}
      <div className="px-4 pb-8 space-y-3 print:px-0 print:space-y-8">
        {LETTER_KINDS.map((kind) => {
          const letterData = letterBodies[kind];
          const existingDoc = docs.find((d) => d.kind === kind);
          return (
            <LetterCard
              key={kind}
              kind={kind}
              letterData={letterData}
              existingDoc={existingDoc}
              engagementId={eng.id}
              onSaved={handleDocSaved}
            />
          );
        })}
      </div>

      {/* ─── Print styles ────────────────────────────────────────── */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
          .print\\:space-y-8 > * + * { margin-top: 2rem !important; }
        }
      `}</style>
    </BusinessShell>
  );
}
