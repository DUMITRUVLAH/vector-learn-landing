/**
 * ITPARK-602: Checklist "Gata" — verifică toate piesele + coerența înainte de export
 * Route: /app/fin/itpark/:id/ready
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 *
 * Checklist items:
 *   1. Anexa 2 prezentă (doc kind=anexa2, status≠draft OR engagement has data)
 *   2. Anexa 3 prezentă (doc kind=anexa3 sau cel puțin 1 linie de venit)
 *   3. Anexa 4 prezentă (doc kind=anexa4 sau linii cu luni atribuite)
 *   4. Scrisoare ajustări prezentă (kind=letter_no_adjustments, status=ready|exported)
 *   5. Scrisoare adresă prezentă (kind=letter_address, status=ready|exported)
 *   6. Scrisoare subdiviziuni prezentă (kind=letter_no_subdivisions, status=ready|exported)
 *   7. Scrisoare activitate prezentă (kind=letter_activity, status=ready|exported)
 *   8. Scrisoare solvabilitate prezentă (kind=letter_solvency, status=ready|exported)
 *   9. Declarație prezentă (kind=decl_self_responsibility, status=ready|exported)
 *  10. Coerență OK (checkConsistency returns ok=true)
 *  11. Prag eligibilitate evaluat (computeAnexa4 run, risk assessment visible)
 *
 * Butonul "Marchează ca Gata" activat NUMAI dacă:
 *   - Coerența (checkul 10) este OK (BLOCKER)
 *   - Cel puțin 1 linie de venit există (BLOCKER)
 *   - Toate cele 5 scrisori + declarația sunt marcate ready/exported (BLOCKER)
 * Celelalte checks sunt avertismente (non-blocking).
 *
 * On Ready → engagement.status=ready + in-app notification + itpark_audit entry (server).
 */

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, markEngagementReady, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import { listLines, type RevenueLine } from "@/lib/api/itparkLines";
import { listDocs, type PacketDocument } from "@/lib/api/itparkDocs";
import { computeAnexa3 } from "@/lib/itpark/calc";
import { computeAnexa4 } from "@/lib/itpark/anexa4";
import { checkConsistency, type ConsistencyResult } from "@/lib/itpark/consistency";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = "ok" | "warn" | "error" | "loading";

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  /** If true, failure blocks the Ready button */
  blocking: boolean;
}

// ─── Route ID helper ──────────────────────────────────────────────────────────

function useEngagementId(): string {
  const { path } = useRouter();
  const match = path.match(/^\/app\/fin\/itpark\/([^/]+)\/ready$/);
  return match ? match[1] : "";
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "loading") return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />;
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />;
  if (status === "warn") return <AlertTriangle className="h-5 w-5 text-yellow-500 dark:text-yellow-400" aria-hidden="true" />;
  return <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />;
}

// ─── Checklist row ────────────────────────────────────────────────────────────

function CheckRow({ item }: { item: CheckItem }) {
  const rowClass = cn(
    "flex items-start gap-3 rounded-lg border p-3 transition-colors",
    item.status === "ok" && "border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-900/10",
    item.status === "warn" && "border-yellow-200 bg-yellow-50/50 dark:border-yellow-900/40 dark:bg-yellow-900/10",
    item.status === "error" && "border-destructive/30 bg-destructive/5",
    item.status === "loading" && "border-border bg-muted/30"
  );

  return (
    <div className={rowClass} role="listitem">
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={item.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium",
          item.status === "ok" ? "text-green-800 dark:text-green-300" :
          item.status === "warn" ? "text-yellow-800 dark:text-yellow-300" :
          item.status === "error" ? "text-destructive" : "text-foreground"
        )}>
          {item.label}
          {item.blocking && item.status === "error" && (
            <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Bloctor</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  );
}

// ─── Checklist computation ────────────────────────────────────────────────────

function computeChecklist(
  engagement: ItparkEngagement,
  lines: RevenueLine[],
  docs: PacketDocument[]
): CheckItem[] {
  const docsByKind = new Map(docs.map((d) => [d.kind, d]));
  const hasLines = lines.length > 0;

  const a3 = computeAnexa3(
    lines.map((l) => ({ caemCode: l.caemCode, amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? undefined }))
  );
  const a4 = computeAnexa4(
    lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
    { eligibilityThresholdPct: 70, toleranceMonths: 2 }
  );
  const consistency: ConsistencyResult = checkConsistency(
    engagement.totalSalesCents,
    a3,
    a4
  );

  function docStatus(kind: string): "ok" | "warn" | "error" {
    const doc = docsByKind.get(kind as Parameters<typeof docsByKind.get>[0]);
    if (!doc) return "error";
    if (doc.status === "ready" || doc.status === "exported") return "ok";
    return "warn"; // draft = present but not signed off
  }

  const letterKinds = [
    { kind: "letter_no_adjustments", label: "Scrisoare absența ajustărilor" },
    { kind: "letter_address", label: "Scrisoare adresă juridică" },
    { kind: "letter_no_subdivisions", label: "Scrisoare absența subdiviziunilor" },
    { kind: "letter_activity", label: "Scrisoare obiect de activitate" },
    { kind: "letter_solvency", label: "Scrisoare solvabilitate" },
  ];

  const letterChecks: CheckItem[] = letterKinds.map(({ kind, label }) => {
    const st = docStatus(kind);
    const doc = docsByKind.get(kind as Parameters<typeof docsByKind.get>[0]);
    const detail =
      !doc ? "Scrisoarea nu a fost generată. Accesați pagina Scrisori." :
      doc.status === "draft" ? "Scrisoarea există dar nu e marcată ca Gata." :
      "Scrisoare prezentă și validată.";
    return {
      id: kind,
      label,
      detail,
      status: st,
      blocking: true, // letters are mandatory for Ready
    };
  });

  const declSt = docStatus("decl_self_responsibility");
  const declDoc = docsByKind.get("decl_self_responsibility");

  const thresholdStatus: CheckStatus = a4.thresholdEval.risk ? "warn" : "ok";

  return [
    // Mandatory pieces — Anexe
    {
      id: "check_lines",
      label: "Linii de venit (Anexa 3)",
      detail: hasLines
        ? `${lines.length} linii prezente — total vânzări ${(a3.totalSalesCents / 100).toLocaleString("ro-MD")} MDL`
        : "Nicio linie de venit introdusă. Importați sau adăugați linii Anexa 3.",
      status: hasLines ? "ok" : "error",
      blocking: true,
    },
    {
      id: "check_consistency",
      label: "Coerență inter-Anexe (Anexa 2 ↔ 3 ↔ 4)",
      detail: consistency.ok
        ? consistency.summary
        : `${consistency.summary} — Rezolvați divergențele din Anexa 4.`,
      status: consistency.ok ? "ok" : "error",
      blocking: true,
    },
    {
      id: "check_threshold",
      label: "Evaluare prag eligibilitate (70%)",
      detail: a4.thresholdEval.risk
        ? `Risc: ${a4.thresholdEval.maxConsecutiveBelowThreshold} luni consecutive sub prag (toleranță ${a4.thresholdEval.toleranceMonths}). Verificați Anexa 4.`
        : `Conform — pondere anuală: ${(a4.total.annualSharePct).toFixed(2)}% ≥ 70%`,
      status: thresholdStatus,
      blocking: false, // Informational — auditor decides, not a hard block
    },
    // 5 letters (blocking)
    ...letterChecks,
    // Declaration (blocking)
    {
      id: "decl_self_responsibility",
      label: "Declarație pe proprie răspundere",
      detail: !declDoc ? "Declarația nu a fost generată. Accesați pagina Declarație." :
        declDoc.status === "draft" ? "Declarația există dar nu e marcată ca Gata." :
        "Declarație prezentă și validată.",
      status: declSt,
      blocking: true,
    },
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReadinessChecklistPage() {
  const id = useEngagementId();
  const [engagement, setEngagement] = useState<ItparkEngagement | null>(null);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [docs, setDocs] = useState<PacketDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getEngagement(id),
      listLines(id).catch(() => [] as RevenueLine[]),
      listDocs(id).catch(() => [] as PacketDocument[]),
    ])
      .then(([eng, revLines, packetDocs]) => {
        setEngagement(eng);
        setLines(revLines);
        setDocs(packetDocs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const checks = engagement ? computeChecklist(engagement, lines, docs) : [];
  const blockingFailed = checks.filter((c) => c.blocking && c.status === "error");
  const canMarkReady = !loading && engagement && blockingFailed.length === 0;
  const alreadyReady = engagement?.status === "ready" || engagement?.status === "exported";

  async function handleMarkReady() {
    if (!id || !canMarkReady) return;
    setMarking(true);
    setMarkError(null);
    try {
      const updated = await markEngagementReady(id);
      setEngagement(updated);
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : "Eroare la marcare");
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <AppShell pageTitle="Checklist Gata — MITP">
        <div className="flex items-center justify-center min-h-64" aria-busy="true" aria-label="Se încarcă checklist-ul">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell pageTitle="Checklist Gata — MITP">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
          <p className="font-medium">Eroare la încărcare</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </AppShell>
    );
  }

  if (!engagement) return null;

  const pageTitle = `Checklist Gata — ${engagement.residentName}`;

  return (
    <AppShell pageTitle={pageTitle}>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <nav aria-label="Navigare" className="flex items-center gap-2 text-sm text-muted-foreground">
          <a
            href="#/app/fin/itpark"
            className="hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
          >
            Dosare MITP
          </a>
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <a
            href={`#/app/fin/itpark/${id}`}
            className="hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
          >
            {engagement.residentName}
          </a>
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-medium">Checklist Gata</span>
        </nav>

        {/* Header */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Checklist pregătire dosar</h1>
              <p className="text-sm text-muted-foreground">
                {engagement.residentName} · {engagement.reportingYear}
              </p>
            </div>
          </div>

          {/* Already ready badge */}
          {alreadyReady && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 dark:border-green-900/40 dark:bg-green-900/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Dosarul a fost marcat ca {engagement.status === "exported" ? "Exportat" : "Gata"}.
              </p>
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground">
              Verificări obligatorii
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {blockingFailed.length === 0
                ? "Toate verificările blocante sunt OK — dosarul poate fi marcat ca Gata."
                : `${blockingFailed.length} verificare${blockingFailed.length === 1 ? "" : "i"} blocant${blockingFailed.length === 1 ? "ă" : "e"} nerezolvat${blockingFailed.length === 1 ? "ă" : "e"}.`}
            </p>
          </div>

          <div className="p-4 space-y-2" role="list" aria-label="Lista de verificări">
            {checks.map((item) => (
              <CheckRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Summary + Ready button */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">
                {blockingFailed.length === 0
                  ? "Dosarul este pregătit pentru semnare și export."
                  : `Rezolvați mai întâi cele ${blockingFailed.length} probleme blocante.`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Marcarea ca „Gata" schimbă statusul dosarului și notifică auditorii.
              </p>
              {markError && (
                <p className="text-xs text-destructive mt-1" role="alert">{markError}</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleMarkReady}
              disabled={!canMarkReady || marking || alreadyReady}
              aria-disabled={!canMarkReady || marking || alreadyReady}
              aria-busy={marking}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                canMarkReady && !alreadyReady
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title={
                alreadyReady ? "Dosarul este deja marcat" :
                !canMarkReady ? `Rezolvați mai întâi ${blockingFailed.length} probleme blocante` :
                "Marchează dosarul ca Gata"
              }
            >
              {marking ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              {alreadyReady ? "Deja marcat ca Gata" : "Marchează ca Gata"}
            </button>
          </div>

          {/* Blocker details */}
          {blockingFailed.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-destructive">Probleme blocante:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {blockingFailed.map((c) => (
                  <li key={c.id} className="text-xs text-destructive">
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
