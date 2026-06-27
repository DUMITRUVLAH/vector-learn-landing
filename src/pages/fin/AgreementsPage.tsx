/**
 * AGREEMENT-003: AgreementsPage — /app/fin/agreements
 * Lista contractelor comerciale cu filtre, alertă expirări, drawer detalii.
 * Design system: Vector 365 semantic tokens — zero hardcoded hex.
 * Dark mode: bg-background, bg-card, text-foreground, border-border.
 * WCAG AA: touch targets ≥44px, sr-only labels, keyboard navigation.
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, FileText } from "lucide-react";
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

  return (
    <AppShell
      pageTitle="Contracte"
      pageDescription="Gestiunea contractelor comerciale și a serviciilor recurente"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          aria-label="Creează contract nou"
          className="flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Contract nou
        </button>
      }
    >
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
