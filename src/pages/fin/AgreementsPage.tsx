/**
 * AGREEMENT-003: AgreementsPage — /app/fin/agreements
 * Lista contractelor comerciale cu filtre, alertă expirări, drawer detalii.
 * Design system: Vector 365 semantic tokens — zero hardcoded hex.
 * Dark mode: bg-background, bg-card, text-foreground, border-border.
 * WCAG AA: touch targets ≥44px, sr-only labels, keyboard navigation.
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, FileText, PlayCircle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { AgreementTable } from "@/components/fin/AgreementTable";
import { AgreementDrawer } from "@/components/fin/AgreementDrawer";
import { CreateAgreementDialog } from "@/components/fin/CreateAgreementDialog";
import {
  listAgreements,
  type Agreement,
} from "@/lib/api/finAgreements";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Party {
  id: string;
  name: string;
}

// AUTOBILL: shape of POST /api/fin/cron/run-now (tenant-scoped billing run)
interface RunNowOutcome {
  agreementId: string;
  agreementTitle: string;
  status: "billed" | "skipped" | "error";
  einvoice?: { ok: boolean; reason?: string };
  email?: { ok: boolean; reason?: string; to?: string };
  reason?: string;
}
interface RunNowSummary {
  ok: boolean;
  processed: number;
  billed: number;
  skipped: number;
  errors: number;
  outcomes: RunNowOutcome[];
}

const SKIP_LABEL: Record<string, string> = {
  buyer_idno_missing: "clientul nu are IDNO",
  buyer_iban_missing: "clientul nu are IBAN",
  buyer_email_missing: "clientul nu are email",
  sfs_not_configured: "SFS neconfigurat",
  no_due_services_or_already_billed: "nimic scadent / deja facturat luna asta",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AgreementsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);

  // Load agreements
  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAgreements({ limit: 100 });
      const data = Array.isArray(res.data) ? res.data : [];
      setAgreements(data);
    } catch {
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load parties list (for create dialog — gracefully degrades if not available)
  const fetchParties = useCallback(async () => {
    try {
      const res = await api<{ data: Party[] }>("/api/fin/parties?limit=200");
      setParties(Array.isArray(res.data) ? res.data : []);
    } catch {
      // fin_parties API may not be available on this branch — ignore silently
      setParties([]);
    }
  }, []);

  useEffect(() => {
    void fetchAgreements();
    void fetchParties();
  }, [fetchAgreements, fetchParties]);

  // When a contract is cancelled, update it in the list
  const handleCancelled = useCallback((id: string) => {
    setAgreements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a))
    );
    // Close drawer
    setSelectedAgreement(null);
  }, []);

  const handleCreated = useCallback(async () => {
    setShowCreate(false);
    await fetchAgreements();
  }, [fetchAgreements]);

  // AUTOBILL: manual "run billing now" for THIS tenant, with a visible summary.
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<RunNowSummary | null>(null);
  const hasAutoContracts = agreements.some((a) => a.autoBilling && a.status === "active");
  const handleRunNow = useCallback(async () => {
    setRunning(true);
    setRunSummary(null);
    try {
      const res = await api<RunNowSummary>("/api/fin/cron/run-now", { method: "POST" });
      setRunSummary(res);
      await fetchAgreements(); // refresh autoBilledAt stamps
    } catch {
      setRunSummary({ ok: false, processed: 0, billed: 0, skipped: 0, errors: 1, outcomes: [] });
    } finally {
      setRunning(false);
    }
  }, [fetchAgreements]);

  return (
    <AppShell
      pageTitle="Contracte"
      pageDescription="Gestiunea contractelor comerciale și a serviciilor recurente"
      actions={
        <div className="flex items-center gap-2">
          {hasAutoContracts && (
            <button
              onClick={() => void handleRunNow()}
              disabled={running}
              aria-label="Rulează facturarea automată acum"
              title="Emite acum facturile scadente pentru contractele cu facturare automată (e-Factura + email)"
              className="flex min-h-[40px] items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />}
              {running ? "Se facturează..." : "Rulează facturarea"}
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Creează contract nou"
            className="flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Contract nou
          </button>
        </div>
      }
    >
      {/* AUTOBILL: run summary — what got billed / skipped and WHY */}
      {runSummary && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-foreground">
              {runSummary.ok
                ? `Facturare rulată: ${runSummary.billed} emise, ${runSummary.skipped} sărite, ${runSummary.errors} erori`
                : "Eroare la rularea facturării. Încearcă din nou."}
            </p>
            <button
              onClick={() => setRunSummary(null)}
              aria-label="Închide rezumatul"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Închide
            </button>
          </div>
          {runSummary.outcomes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {runSummary.outcomes.map((o) => (
                <li key={o.agreementId} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{o.agreementTitle}</span>
                  {": "}
                  {o.status === "billed" ? (
                    <>
                      factură emisă
                      {o.einvoice && ` · e-Factura ${o.einvoice.ok ? "OK" : `sărită (${SKIP_LABEL[o.einvoice.reason ?? ""] ?? o.einvoice.reason})`}`}
                      {o.email && ` · email ${o.email.ok ? `trimis (${o.email.to})` : `sărit (${SKIP_LABEL[o.email.reason ?? ""] ?? o.email.reason})`}`}
                    </>
                  ) : (
                    `${o.status === "skipped" ? "sărit" : "eroare"} — ${SKIP_LABEL[o.reason ?? ""] ?? o.reason ?? ""}`
                  )}
                </li>
              ))}
            </ul>
          )}
          {runSummary.ok && runSummary.processed === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Niciun contract cu facturare automată nu are servicii scadente azi.
            </p>
          )}
        </div>
      )}

      {/* POLISH-003: Empty state when no agreements exist */}
      {!loading && agreements.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          title="Niciun contract creat"
          description="Creează primul contract comercial pentru a urmări serviciile și facturarea automată."
          action={{ label: "Contract nou", onClick: () => setShowCreate(true) }}
        />
      ) : (
        <AgreementTable
          agreements={agreements}
          loading={loading}
          onSelect={(a) => setSelectedAgreement(a)}
        />
      )}

      {/* Drawer */}
      {selectedAgreement && (
        <AgreementDrawer
          agreement={selectedAgreement}
          onClose={() => setSelectedAgreement(null)}
          onCancelled={handleCancelled}
        />
      )}

      {/* Create dialog */}
      {showCreate && (
        <CreateAgreementDialog
          parties={parties}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </AppShell>
  );
}
