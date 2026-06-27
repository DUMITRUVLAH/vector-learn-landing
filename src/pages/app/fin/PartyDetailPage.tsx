/**
 * PARTY-003: FinDesk — /app/fin/parties/:id
 *
 * Detail page for a business partner.
 * Three tabs:
 *   - Date fiscale: IBAN, VAT, address, contact info, notes + Edit
 *   - Contacte:     list of fin_party_contacts + add/delete
 *   - Metrici:      venit cumulat, sold curent, aging (graceful stub if no invoices yet)
 */

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  ChevronLeft,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  X,
  Check,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  Clock,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getParty,
  updateParty,
  deleteParty,
  listPartyContacts,
  createContact,
  deleteContact,
  getPartyMetrics,
  getPartyAging,
  type Party,
  type PartyKind,
  type PartyContact,
  type PartyMetrics,
  type PartyAging,
  type PartySegment,
  type CreatePartyPayload,
  type CreateContactPayload,
} from "@/lib/api/finParties";
import {
  listEngagementsForParty,
  type ItparkEngagement,
} from "@/lib/api/itparkEngagements";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_META: Record<PartyKind, { label: string; cls: string }> = {
  client: { label: "Client", cls: "bg-primary/15 text-primary" },
  supplier: { label: "Furnizor", cls: "bg-warning/15 text-warning" },
  both: { label: "Ambele", cls: "bg-success/15 text-success" },
};

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Segment badge — semantic tokens only, WCAG AA */
const SEGMENT_META: Record<PartySegment, { label: string; cls: string }> = {
  VIP:     { label: "VIP",     cls: "bg-primary/15 text-primary border border-primary/30" },
  Regular: { label: "Regular", cls: "bg-secondary/15 text-secondary-foreground border border-border" },
  New:     { label: "Nou",     cls: "bg-muted text-muted-foreground border border-border" },
};

type Tab = "fiscal" | "contacts" | "metrics";

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditPartyModalProps {
  party: Party;
  onClose: () => void;
  onSaved: (updated: Party) => void;
}

function EditPartyModal({ party, onClose, onSaved }: EditPartyModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CreatePartyPayload>>({
    kind: party.kind,
    name: party.name,
    country: party.country,
    idno: party.idno,
    vatCode: party.vatCode,
    iban: party.iban,
    address: party.address,
    city: party.city,
    postalCode: party.postalCode,
    email: party.email,
    phone: party.phone,
    notes: party.notes,
  });

  function set<K extends keyof CreatePartyPayload>(key: K, val: CreatePartyPayload[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await updateParty(party.id, form);
      onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editează partener"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Editează partener</h2>
          <button onClick={onClose} aria-label="Închide" className="p-2 rounded-md hover:bg-muted transition-colors touch-target">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="edit-kind">Tip</label>
            <select
              id="edit-kind"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as PartyKind)}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="client">Client</option>
              <option value="supplier">Furnizor</option>
              <option value="both">Ambele</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="edit-name">
              Denumire <span className="text-destructive">*</span>
            </label>
            <input
              id="edit-name"
              type="text"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-country">Țară</label>
              <input
                id="edit-country"
                type="text"
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-idno">IDNO / CIF</label>
              <input
                id="edit-idno"
                type="text"
                value={form.idno ?? ""}
                onChange={(e) => set("idno", e.target.value || null)}
                maxLength={13}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-vatcode">Cod TVA</label>
              <input
                id="edit-vatcode"
                type="text"
                value={form.vatCode ?? ""}
                onChange={(e) => set("vatCode", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-iban">IBAN</label>
              <input
                id="edit-iban"
                type="text"
                value={form.iban ?? ""}
                onChange={(e) => set("iban", e.target.value.toUpperCase() || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="edit-address">Adresă</label>
            <input
              id="edit-address"
              type="text"
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value || null)}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-email">Email</label>
              <input
                id="edit-email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="edit-phone">Telefon</label>
              <input
                id="edit-phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="edit-notes">Note</label>
            <textarea
              id="edit-notes"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
              rows={3}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
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

// ─── Add Contact Modal ────────────────────────────────────────────────────────

interface AddContactModalProps {
  partyId: string;
  onClose: () => void;
  onCreated: (contact: PartyContact) => void;
}

function AddContactModal({ partyId, onClose, onCreated }: AddContactModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateContactPayload>({ name: "" });

  function set<K extends keyof CreateContactPayload>(key: K, val: CreateContactPayload[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Numele este obligatoriu."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createContact(partyId, form);
      onCreated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la creare contact.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contact nou"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Contact nou</h2>
          <button onClick={onClose} aria-label="Închide" className="p-2 rounded-md hover:bg-muted transition-colors touch-target">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="con-name">
              Nume <span className="text-destructive">*</span>
            </label>
            <input
              id="con-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="con-role">Rol</label>
            <input
              id="con-role"
              type="text"
              value={form.role ?? ""}
              onChange={(e) => set("role", e.target.value || null)}
              placeholder="Contabil, Director..."
              className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="con-email">Email</label>
              <input
                id="con-email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="con-phone">Telefon</label>
              <input
                id="con-phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
                className="w-full border border-border rounded-md bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPrimary ?? false}
              onChange={(e) => set("isPrimary", e.target.checked)}
              className="rounded border-border"
            />
            Contact principal
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
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

// ─── Metrics Tab ──────────────────────────────────────────────────────────────

interface MetricsTabProps {
  partyId: string;
}

function MetricsTab({ partyId }: MetricsTabProps) {
  const [metrics, setMetrics] = useState<PartyMetrics | null>(null);
  const [aging, setAging] = useState<PartyAging | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPartyMetrics(partyId),
      getPartyAging(partyId),
    ])
      .then(([mRes, aRes]) => {
        setMetrics(mRes.data);
        setAging(aRes.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Eroare la metrici."))
      .finally(() => setLoading(false));
  }, [partyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {error}
      </div>
    );
  }

  const m = metrics!;
  // Use real aging from dedicated endpoint; fall back to metrics.aging if unavailable
  const ag: PartyAging = aging ?? m.aging;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-muted/30 rounded-lg p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-success mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Venit cumulat</p>
            <p className="text-xl font-semibold mt-1">{formatMDL(m.totalRevenue)}</p>
          </div>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sold curent</p>
            <p className="text-xl font-semibold mt-1">{formatMDL(m.openBalance)}</p>
          </div>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Restant &gt; 30 zile</p>
            <p className="text-xl font-semibold mt-1">{formatMDL(ag.d31_60 + ag.d61_90 + ag.d90plus)}</p>
          </div>
        </div>
      </div>

      {/* Aging breakdown — real data from /aging endpoint (PARTY-004) */}
      <div>
        <h3 className="text-sm font-medium mb-3">Aging restanțe (date reale)</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Interval</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sumă</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3">0 – 30 zile</td>
                <td className="px-4 py-3 text-right font-mono text-success">{formatMDL(ag.d0_30)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3">31 – 60 zile</td>
                <td className={cn("px-4 py-3 text-right font-mono", ag.d31_60 > 0 ? "text-warning" : "text-muted-foreground")}>
                  {formatMDL(ag.d31_60)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">61 – 90 zile</td>
                <td className={cn("px-4 py-3 text-right font-mono", ag.d61_90 > 0 ? "text-destructive/80" : "text-muted-foreground")}>
                  {formatMDL(ag.d61_90)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">90+ zile</td>
                <td className={cn("px-4 py-3 text-right font-mono font-semibold", ag.d90plus > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {formatMDL(ag.d90plus)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {m.totalRevenue === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nicio factură înregistrată pentru acest partener. Metricile vor apărea automat după emiterea primei facturi.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function extractPartyId(path: string): string | null {
  const m = path.match(/\/app\/fin\/parties\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function PartyDetailPage() {
  const { status: sessionStatus } = useSession();
  const { path, navigate } = useRouter();

  const partyId = extractPartyId(path);

  const [party, setParty] = useState<(Party & { segment?: PartySegment }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("fiscal");

  // Contacts
  const [contacts, setContacts] = useState<PartyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // SPLIT-203: ITPark dossier linked to this fin_party
  const [itparkEngagements, setItparkEngagements] = useState<ItparkEngagement[]>([]);
  const [itparkLoaded, setItparkLoaded] = useState(false);

  // Auth guard
  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  // Load party
  useEffect(() => {
    if (!partyId) return;
    setLoading(true);
    getParty(partyId)
      .then((res) => setParty(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Partenerul nu a fost găsit."))
      .finally(() => setLoading(false));
  }, [partyId]);

  // SPLIT-203: Load ITPark dossiers linked to this party (best-effort, non-blocking)
  useEffect(() => {
    if (!partyId || itparkLoaded) return;
    listEngagementsForParty(partyId)
      .then((rows) => {
        setItparkEngagements(rows);
        setItparkLoaded(true);
      })
      .catch(() => {
        // Non-blocking: ITPark module may not be available for all tenants
        setItparkLoaded(true);
      });
  }, [partyId, itparkLoaded]);

  // Load contacts on tab switch
  const loadContacts = useCallback(async () => {
    if (!partyId || contactsLoaded) return;
    setContactsLoading(true);
    try {
      const res = await listPartyContacts(partyId);
      setContacts(res.data);
      setContactsLoaded(true);
    } catch {
      // non-blocking
    } finally {
      setContactsLoading(false);
    }
  }, [partyId, contactsLoaded]);

  useEffect(() => {
    if (activeTab === "contacts") loadContacts();
  }, [activeTab, loadContacts]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleArchive() {
    if (!partyId) return;
    setArchiving(true);
    try {
      await deleteParty(partyId);
      showToast("Partenerul a fost arhivat.");
      setTimeout(() => navigate("/app/fin/parties"), 1500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Eroare la arhivare.");
    } finally {
      setArchiving(false);
      setConfirmArchive(false);
    }
  }

  if (!partyId) {
    return (
      <BusinessShell pageTitle="Partener">
        <div className="text-muted-foreground text-sm">ID partener lipsă.</div>
      </BusinessShell>
    );
  }

  if (loading) {
    return (
      <BusinessShell pageTitle="Partener">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </BusinessShell>
    );
  }

  if (error || !party) {
    return (
      <BusinessShell pageTitle="Partener">
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error ?? "Partenerul nu a fost găsit."}
        </div>
      </BusinessShell>
    );
  }

  const kindMeta = KIND_META[party.kind];

  return (
    <BusinessShell
      pageTitle={party.name}
      pageDescription={`Fișă partener — ${kindMeta.label}`}
      actions={
        <button
          onClick={() => setConfirmArchive(true)}
          disabled={!party.isActive}
          className="px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
        >
          Arhivează
        </button>
      }
    >
      {/* Breadcrumb */}
      <button
        onClick={() => navigate("/app/fin/parties")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Parteneri
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{party.name}</h1>
            <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", kindMeta.cls)}>
              {kindMeta.label}
            </span>
            {/* Segment badge (PARTY-004) */}
            {party.segment && (
              <span className={cn(
                "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                SEGMENT_META[party.segment].cls
              )}>
                {SEGMENT_META[party.segment].label}
              </span>
            )}
            {!party.isActive && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                Arhivat
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {party.country}
            {party.idno ? ` · IDNO: ${party.idno}` : ""}
            {party.city ? ` · ${party.city}` : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0" role="tablist">
          {([
            { id: "fiscal" as Tab, label: "Date fiscale" },
            { id: "contacts" as Tab, label: "Contacte" },
            { id: "metrics" as Tab, label: "Metrici" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Date fiscale */}
      {activeTab === "fiscal" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors touch-target"
            >
              <Pencil className="w-4 h-4" />
              Editează
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "IBAN", value: party.iban },
              { label: "Cod TVA", value: party.vatCode },
              { label: "Email", value: party.email },
              { label: "Telefon", value: party.phone },
              { label: "Adresă", value: party.address },
              { label: "Oraș", value: party.city },
              { label: "Cod poștal", value: party.postalCode },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg px-4 py-3">
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-medium">{value ?? <span className="text-muted-foreground">—</span>}</p>
              </div>
            ))}
          </div>

          {party.notes && (
            <div className="bg-muted/30 rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground mb-0.5">Note</p>
              <p className="text-sm whitespace-pre-wrap">{party.notes}</p>
            </div>
          )}

          {/* SPLIT-203: ITPark dossier indicator — shown only when engagements are linked */}
          {itparkLoaded && itparkEngagements.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Dosar ITPark
              </p>
              <div className="space-y-1.5">
                {itparkEngagements.map((eng) => (
                  <div key={eng.id} className="flex items-center justify-between">
                    <span className="text-sm">
                      {eng.residentName} — {eng.reportingYear}
                    </span>
                    <a
                      href={`#/app/fin/itpark/${eng.id}`}
                      className="text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                      aria-label={`Deschide dosarul ITPark ${eng.residentName} ${eng.reportingYear}`}
                    >
                      Deschide →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Contacte */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setAddContactOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors touch-target"
            >
              <Plus className="w-4 h-4" />
              Contact nou
            </button>
          </div>

          {contactsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <p className="text-sm">Niciun contact adăugat.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{contact.name}</span>
                      {contact.isPrimary && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                          <Check className="w-3 h-3" /> Principal
                        </span>
                      )}
                    </div>
                    {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
                    <div className="flex gap-3 mt-1">
                      {contact.email && <span className="text-xs text-muted-foreground">{contact.email}</span>}
                      {contact.phone && <span className="text-xs text-muted-foreground">{contact.phone}</span>}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!partyId) return;
                      await deleteContact(partyId, contact.id);
                      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
                    }}
                    aria-label={`Șterge contactul ${contact.name}`}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors touch-target"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Metrici */}
      {activeTab === "metrics" && <MetricsTab partyId={partyId} />}

      {/* Modals */}
      {editOpen && party && (
        <EditPartyModal
          party={party}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setParty(updated);
            setEditOpen(false);
            showToast("Partenerul a fost salvat.");
          }}
        />
      )}

      {addContactOpen && (
        <AddContactModal
          partyId={partyId}
          onClose={() => setAddContactOpen(false)}
          onCreated={(c) => {
            setContacts((prev) => [c, ...prev]);
            setAddContactOpen(false);
          }}
        />
      )}

      {/* Confirm archive */}
      {confirmArchive && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmare arhivare"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold">Arhivează partenerul?</h2>
            <p className="text-sm text-muted-foreground">
              Partenerul va fi marcat ca inactiv și nu va mai apărea în liste.
              Documentele existente rămân neschimbate.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmArchive(false)}
                className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {archiving && <Loader2 className="w-4 h-4 animate-spin" />}
                Arhivează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-card text-card-foreground border border-border rounded-lg shadow-lg px-4 py-3 text-sm flex items-center gap-2 z-50">
          <Check className="w-4 h-4 text-success" />
          {toast}
        </div>
      )}
    </BusinessShell>
  );
}
