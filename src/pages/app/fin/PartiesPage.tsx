/**
 * PARTY-003/004: FinDesk — /business/fin/parties
 *
 * List page for business partners (clients, suppliers, both).
 * Features: search (debounced), kind filter, isActive toggle,
 *   + Partener nou modal, clickable rows → detail page.
 * PARTY-004: Top Clienți tab with segment badges.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Search,
  Plus,
  Loader2,
  ChevronDown,
  X,
  TrendingUp,
  Medal,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listParties,
  createParty,
  getTopClients,
  getSegmentDistribution,
  type Party,
  type PartyKind,
  type PartySegment,
  type TopClient,
  type SegmentDistribution,
  type CreatePartyPayload,
} from "@/lib/api/finParties";
import { cn } from "@/lib/utils";

// ─── Kind metadata ────────────────────────────────────────────────────────────

const KIND_META: Record<PartyKind, { label: string; cls: string }> = {
  client: { label: "Client", cls: "bg-primary/15 text-primary" },
  supplier: { label: "Furnizor", cls: "bg-warning/15 text-warning" },
  both: { label: "Ambele", cls: "bg-success/15 text-success" },
};

/** Segment badge — semantic tokens only, WCAG AA (PARTY-004) */
const SEGMENT_META: Record<PartySegment, { label: string; cls: string }> = {
  VIP:     { label: "VIP",     cls: "bg-primary/15 text-primary border border-primary/30" },
  Regular: { label: "Regular", cls: "bg-secondary/15 text-secondary-foreground border border-border" },
  New:     { label: "Nou",     cls: "bg-muted text-muted-foreground border border-border" },
};

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const KIND_OPTIONS: Array<{ value: PartyKind | ""; label: string }> = [
  { value: "", label: "Toate tipurile" },
  { value: "client", label: "Client" },
  { value: "supplier", label: "Furnizor" },
  { value: "both", label: "Ambele" },
];

// ─── Top Clients section (PARTY-004) ─────────────────────────────────────────

interface TopClientsSectionProps {
  onSelectParty: (partyId: string) => void;
}

function TopClientsSection({ onSelectParty }: TopClientsSectionProps) {
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [segments, setSegments] = useState<SegmentDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTopClients(10), getSegmentDistribution()])
      .then(([tRes, sRes]) => {
        setTopClients(tRes.data);
        setSegments(sRes.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare la analytics."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Segment distribution chips */}
      {segments && (
        <div className="flex flex-wrap gap-3">
          {(["VIP", "Regular", "New"] as PartySegment[]).map((seg) => (
            <div
              key={seg}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                SEGMENT_META[seg].cls
              )}
            >
              <span>{SEGMENT_META[seg].label}</span>
              <span className="font-semibold">{segments[seg]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top clients table */}
      {topClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
          <Medal className="w-10 h-10 opacity-30" />
          <p className="text-sm">Date insuficiente. Emite facturi pentru a vedea clasamentul.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Partener</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Venit cumulat</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sold deschis</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Segment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topClients.map((client, idx) => (
                <tr
                  key={client.partyId}
                  onClick={() => onSelectParty(client.partyId)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{client.partyName}</td>
                  <td className="px-4 py-3 text-right font-mono text-success">
                    {formatMDL(client.totalRevenueCents)}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right font-mono",
                    client.openBalanceCents > 0 ? "text-warning" : "text-muted-foreground"
                  )}>
                    {formatMDL(client.openBalanceCents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                      SEGMENT_META[client.segment].cls
                    )}>
                      {SEGMENT_META[client.segment].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Add Party Modal ──────────────────────────────────────────────────────────

interface AddPartyModalProps {
  onClose: () => void;
  onCreated: (party: Party) => void;
}

function AddPartyModal({ onClose, onCreated }: AddPartyModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePartyPayload>({
    kind: "client",
    name: "",
    country: "MD",
    idno: null,
    vatCode: null,
    iban: null,
    address: null,
    city: null,
    postalCode: null,
    email: null,
    phone: null,
    isActive: true,
    notes: null,
  });

  function set<K extends keyof CreatePartyPayload>(key: K, val: CreatePartyPayload[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Denumirea este obligatorie."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createParty(form);
      onCreated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la creare partener.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Partener nou"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Partener nou</h2>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="p-2 rounded-md hover:bg-muted transition-colors touch-target"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Kind */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="new-kind">
              Tip partener <span className="text-destructive">*</span>
            </label>
            <select
              id="new-kind"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as PartyKind)}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="client">Client</option>
              <option value="supplier">Furnizor</option>
              <option value="both">Ambele</option>
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="new-name">
              Denumire <span className="text-destructive">*</span>
            </label>
            <input
              id="new-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="SRL Exemplu SA"
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Country + IDNO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="new-country">
                Țară (ISO 2)
              </label>
              <input
                id="new-country"
                type="text"
                value={form.country}
                onChange={(e) => set("country", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="MD"
                maxLength={2}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="new-idno">
                IDNO / CIF
              </label>
              <input
                id="new-idno"
                type="text"
                value={form.idno ?? ""}
                onChange={(e) => set("idno", e.target.value || null)}
                placeholder="1234567890123"
                maxLength={13}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="new-email">
                Email
              </label>
              <input
                id="new-email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="new-phone">
                Telefon
              </label>
              <input
                id="new-phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* IBAN */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="new-iban">
              IBAN
            </label>
            <input
              id="new-iban"
              type="text"
              value={form.iban ?? ""}
              onChange={(e) => set("iban", e.target.value.toUpperCase() || null)}
              placeholder="MD24AG000225100013104168"
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageTab = "lista" | "top";

export function PartiesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [pageTab, setPageTab] = useState<PageTab>("lista");

  const [items, setItems] = useState<Party[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<PartyKind | "">("");
  const [showInactive, setShowInactive] = useState(false);
  const [offset, setOffset] = useState(0);

  const [addOpen, setAddOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listParties({
        kind: kindFilter || undefined,
        isActive: showInactive ? undefined : true,
        search: debouncedSearch || undefined,
        limit: 50,
        offset,
      });
      if (offset === 0) {
        setItems(res.data);
      } else {
        setItems((prev) => [...prev, ...res.data]);
      }
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcarea partenerilor.");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, showInactive, debouncedSearch, offset]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function handleCreated(party: Party) {
    setItems((prev) => [party, ...prev]);
    setTotal((t) => t + 1);
    setAddOpen(false);
  }

  const hasMore = items.length < total;

  return (
    <AppShell
      pageTitle="Parteneri comerciali"
      pageDescription="Clienți, furnizori și parteneri FinDesk"
      actions={
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors touch-target"
        >
          <Plus className="w-4 h-4" />
          Partener nou
        </button>
      }
    >
      {/* Page tabs (PARTY-004) */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0" role="tablist">
          {([
            { id: "lista" as PageTab, label: "Listă parteneri", icon: Building2 },
            { id: "top" as PageTab, label: "Top Clienți", icon: TrendingUp },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={pageTab === tab.id}
              onClick={() => setPageTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                pageTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Clienți tab */}
      {pageTab === "top" && (
        <TopClientsSection onSelectParty={(id) => navigate(`/business/fin/parties/${id}`)} />
      )}

      {/* Lista tab */}
      {pageTab === "lista" && (
      <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută partener..."
            aria-label="Caută partener"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Kind filter */}
        <div className="relative">
          <select
            value={kindFilter}
            onChange={(e) => { setKindFilter(e.target.value as PartyKind | ""); setOffset(0); }}
            aria-label="Tip partener"
            className="appearance-none border border-border rounded-md bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => { setShowInactive(e.target.checked); setOffset(0); }}
            className="rounded border-border"
          />
          Afișează arhivați
        </label>
      </div>

      {/* Content */}
      {loading && offset === 0 ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Building2 className="w-12 h-12 opacity-30" />
          <p className="text-sm">Niciun partener găsit.</p>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adaugă primul partener
          </button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Denumire</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tip</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Țară</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">IDNO</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((party) => (
                  <tr
                    key={party.id}
                    onClick={() => navigate(`/business/fin/parties/${party.id}`)}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{party.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                          KIND_META[party.kind].cls
                        )}
                      >
                        {KIND_META[party.kind].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{party.country}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{party.idno ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{party.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {party.isActive ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-success/15 text-success font-medium">
                          Activ
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium">
                          Arhivat
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setOffset((o) => o + 50)}
                disabled={loading}
                className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Încarcă mai mult ({total - items.length} rămași)
              </button>
            </div>
          )}
        </>
      )}

      {/* End of lista tab */}
      </>
      )}

      {/* Add modal */}
      {addOpen && (
        <AddPartyModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}
    </AppShell>
  );
}
