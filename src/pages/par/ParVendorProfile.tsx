/**
 * PAR-VENDOR360 — /business/par/vendors/:id — „pagina companiei".
 *
 * Ce răspunde ecranul, în ordinea în care se pun întrebările:
 *   1. Cu cine avem de-a face (date de identificare, rechizite, contacte, domenii)
 *   2. Merită să lucrăm din nou cu ei (nota, ce-au zis colegii, semnalele de risc)
 *   3. Cât ne-a costat până acum și cât de repede ne-am ținut noi de cuvânt (KPI + istoricul plăților)
 *   4. Ce prețuri ne-au dat (oferte, inclusiv cele din trecut, adăugate manual pentru analiză)
 *   5. Ce hârtii avem cu ei (contracte, certificate — cu data expirării)
 *
 * Semnalele de risc stau SUS, nu într-un tab: dacă „IBAN schimbat" sau „furnizor blocat" apare
 * după trei clicuri, nu previne nimic.
 *
 * Design: tokeni Vector 365, light + dark, WCAG AA.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  ReceiptText,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link, useRouter } from "@/router/HashRouter";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Label,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ds";
import { StarRating } from "@/components/par/VendorStars";
import { VendorRatingDialog } from "@/components/par/VendorRatingDialog";
import { cn } from "@/lib/utils";
import { formatMDL, getParMe } from "@/lib/api/par";
import {
  getVendorProfile,
  listVendorRatings,
  listVendorNotes,
  listVendorOffers,
  listVendorDocuments,
  addVendorNote,
  deleteVendorNote,
  addVendorOffer,
  deleteVendorOffer,
  addVendorDocument,
  deleteVendorDocument,
  setVendorRelationship,
  setVendorCategories,
  listVendorCategories,
  deleteVendorRating,
  type VendorProfile,
  type VendorRating,
  type VendorNote,
  type VendorOffer,
  type VendorQuoteOffer,
  type VendorDocument,
  type VendorCategory,
  type VendorRelationship,
} from "@/lib/api/parVendorProfile";

type TabKey = "overview" | "requests" | "ratings" | "offers" | "documents" | "notes";

const RELATIONSHIP_LABEL: Record<string, string> = {
  preferred: "Preferat",
  active: "Activ",
  trial: "În probă",
  blocked: "Blocat",
};

const DOC_KIND_LABEL: Record<string, string> = {
  contract: "Contract",
  certificat: "Certificat",
  licenta: "Licență",
  polita: "Poliță",
  alt: "Alt document",
};

const FLAG_STYLE = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-border bg-muted/40 text-muted-foreground",
} as const;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

/** Ia id-ul din calea curentă fără să presupună prefixul rutei (vezi CLAUDE.md §3.5.1quater). */
function vendorIdFromPath(path: string): string {
  return path.match(/\/vendors\/([^/?#]+)/)?.[1] ?? "";
}

export default function ParVendorProfile() {
  const { path } = useRouter();
  const id = vendorIdFromPath(path);

  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [isAdmin, setIsAdmin] = useState(false);

  const [ratings, setRatings] = useState<VendorRating[]>([]);
  const [notes, setNotes] = useState<VendorNote[]>([]);
  const [offers, setOffers] = useState<VendorOffer[]>([]);
  const [quotes, setQuotes] = useState<VendorQuoteOffer[]>([]);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [categories, setCategories] = useState<VendorCategory[]>([]);

  const [rateOpen, setRateOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setProfile(await getVendorProfile(id));
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("404")
          ? "Furnizorul nu există sau a fost șters."
          : "Fișa furnizorului nu s-a putut încărca."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTabs = useCallback(async () => {
    if (!id) return;
    const [r, n, o, d] = await Promise.all([
      listVendorRatings(id).catch(() => ({ ratings: [], summary: null })),
      listVendorNotes(id).catch(() => ({ notes: [] })),
      listVendorOffers(id).catch(() => ({ offers: [], quotes: [] })),
      listVendorDocuments(id).catch(() => ({ documents: [] })),
    ]);
    setRatings(r.ratings);
    setNotes(n.notes);
    setOffers(o.offers);
    setQuotes(o.quotes);
    setDocuments(d.documents);
  }, [id]);

  useEffect(() => {
    void loadProfile();
    void loadTabs();
    listVendorCategories().then((c) => setCategories(c.categories)).catch(() => setCategories([]));
    getParMe().then((me) => setIsAdmin(me.roles.includes("par_admin"))).catch(() => setIsAdmin(false));
  }, [loadProfile, loadTabs]);

  const refreshAll = () => {
    void loadProfile();
    void loadTabs();
  };

  if (loading && !profile) {
    return (
      <BusinessShell pageTitle="Fișa furnizorului">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </BusinessShell>
    );
  }

  if (error || !profile) {
    return (
      <BusinessShell pageTitle="Fișa furnizorului">
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">{error ?? "Fișa nu s-a putut încărca."}</Alert>
          <Link to="/business/par/vendors" className="text-sm text-primary hover:underline">
            ← Înapoi la furnizori
          </Link>
        </div>
      </BusinessShell>
    );
  }

  const v = profile.vendor;

  return (
    <BusinessShell
      pageTitle={v.name}
      pageDescription={[
        v.kind === "company" ? "Persoană juridică" : "Persoană fizică",
        v.idnp ? `Cod fiscal ${v.idnp}` : null,
        v.companyStatus,
      ].filter(Boolean).join(" · ")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setRateOpen(true)}>
            <Star className="h-4 w-4" aria-hidden="true" />
            Evaluează
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setBlockOpen(true)}>
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {v.relationship === "blocked" ? "Deblochează" : "Starea relației"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Link
          to="/business/par/vendors"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Toți furnizorii
        </Link>

        {/* Starea, nota și domeniile — identitatea de relație, sub antetul shell-ului. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={v.relationship === "blocked" ? "destructive" : v.relationship === "preferred" ? "success" : "secondary"}>
            {RELATIONSHIP_LABEL[v.relationship] ?? v.relationship}
          </Badge>
          <StarRating value={profile.ratings.avg} count={profile.ratings.count} />
          {v.categories.map((cat) => (
            <span key={cat.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {cat.name}
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setCatsOpen(true)}>
            {v.categories.length ? "Schimbă domeniile" : "Adaugă domenii"}
          </Button>
        </div>

        {/* Semnalele stau sus: un avertisment ascuns într-un tab nu previne nimic. */}
        {profile.flags.length > 0 && (
          <ul className="flex flex-col gap-2">
            {profile.flags.map((flag) => (
              <li
                key={flag.code + flag.message}
                className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", FLAG_STYLE[flag.severity])}
              >
                {flag.severity === "info" ? (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{flag.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Plătit în total" value={formatMDL(profile.kpis.paidCents)} hint={`${profile.kpis.paidCount} plăți`} />
          <KpiCard
            label="Angajat acum"
            value={formatMDL(profile.kpis.committedCents)}
            hint="cereri în lucru"
          />
          <KpiCard
            label="Cerere medie"
            value={profile.kpis.avgRequestCents == null ? "—" : formatMDL(profile.kpis.avgRequestCents)}
            hint={`${profile.kpis.requestCount} cereri`}
          />
          <KpiCard
            label="De la aprobare la plată"
            value={profile.kpis.avgDaysApprovalToPayment == null ? "—" : `${profile.kpis.avgDaysApprovalToPayment} zile`}
            hint="cât de repede ne ținem noi de cuvânt"
          />
        </div>

        <Tabs
          aria-label="Secțiunile fișei"
          value={tab}
          onChange={(next) => setTab(next as TabKey)}
          tabs={[
            { value: "overview", label: "Prezentare" },
            { value: "requests", label: "Cereri și plăți", count: profile.requests.length },
            { value: "ratings", label: "Evaluări", count: ratings.length },
            { value: "offers", label: "Oferte", count: offers.length + quotes.length },
            { value: "documents", label: "Documente", count: documents.length },
            { value: "notes", label: "Note interne", count: notes.length },
          ]}
        />

        {tab === "overview" && <OverviewTab profile={profile} />}

        {tab === "requests" && (
          <Card className="overflow-x-auto p-0">
            {profile.requests.length === 0 ? (
              <EmptyState
                compact
                icon={<ReceiptText className="h-6 w-6" />}
                title="Nicio cerere pentru acest furnizor"
                description="Cererile apar aici automat, indiferent dacă furnizorul a fost ales din registru sau scris manual în cerere."
              />
            ) : (
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Cerere</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Scop</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Sumă</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.requests.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <Link to={`/business/par/${r.id}`} className="font-medium text-primary hover:underline">
                          {r.requestNo}
                        </Link>
                        {r.endUse && <p className="max-w-md truncate text-xs text-muted-foreground">{r.endUse}</p>}
                      </td>
                      <td className="p-3 text-muted-foreground">{fmtDate(r.dateOfRequest)}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.purpose === "execute_payment" ? "Executare plată" : r.purpose === "obtain_quotations" ? "Obținere oferte" : "Estimare cost"}
                      </td>
                      <td className="p-3">
                        <Badge variant={r.status === "paid" ? "success" : r.status === "rejected" || r.status === "cancelled" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {formatMDL(r.actualAmountCents ?? r.totalMdlCents ?? r.totalEstimatedCents)}
                        {r.currency !== "MDL" && <span className="ml-1 text-xs text-muted-foreground">({r.currency})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {tab === "ratings" && (
          <RatingsTab
            ratings={ratings}
            summary={profile.ratings}
            onRate={() => setRateOpen(true)}
            onDelete={async (ratingId) => {
              await deleteVendorRating(ratingId);
              refreshAll();
            }}
          />
        )}

        {tab === "offers" && (
          <OffersTab offers={offers} quotes={quotes} onAdd={() => setOfferOpen(true)} onDelete={async (offerId) => { await deleteVendorOffer(offerId); refreshAll(); }} />
        )}

        {tab === "documents" && (
          <DocumentsTab documents={documents} onAdd={() => setDocOpen(true)} onDelete={async (docId) => { await deleteVendorDocument(docId); refreshAll(); }} />
        )}

        {tab === "notes" && (
          <NotesTab
            notes={notes}
            onAdd={async (body, pinned) => { await addVendorNote(id, body, pinned); refreshAll(); }}
            onDelete={async (noteId) => { await deleteVendorNote(noteId); refreshAll(); }}
          />
        )}
      </div>

      <VendorRatingDialog
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        vendorId={id}
        vendorName={v.name}
        dismissLabel="Renunță"
        onSaved={refreshAll}
      />

      <RelationshipDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        current={v.relationship}
        currentReason={v.blockedReason}
        onSave={async (payload) => {
          await setVendorRelationship(id, payload);
          refreshAll();
        }}
      />

      <OfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        categories={categories}
        onSave={async (payload) => {
          await addVendorOffer(id, payload);
          refreshAll();
        }}
      />

      <DocumentDialog
        open={docOpen}
        onClose={() => setDocOpen(false)}
        onSave={async (payload) => {
          await addVendorDocument(id, payload);
          refreshAll();
        }}
      />

      <CategoryPickDialog
        open={catsOpen}
        onClose={() => setCatsOpen(false)}
        categories={categories}
        selected={v.categories.map((c) => c.id)}
        onSave={async (ids) => {
          await setVendorCategories(id, ids);
          refreshAll();
        }}
      />
    </BusinessShell>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}

function OverviewTab({ profile }: { profile: VendorProfile }) {
  const v = profile.vendor;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-2 font-medium text-foreground">Identificare și rechizite</h2>
        <dl className="flex flex-col">
          <Row label="Cod fiscal / IDNO" value={v.idnp} />
          <Row label="Nr. TVA" value={v.vatCode} />
          <Row label="IBAN" value={v.iban} />
          <Row label="Banca" value={v.bank} />
          <Row label="Cod bancar" value={v.bicSwift} />
          <Row label="Adresa juridică" value={v.legalAddress} />
          <Row label="Administrator" value={v.administratorName} />
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-medium text-foreground">Contact și colaborare</h2>
        <dl className="flex flex-col">
          <Row label="Persoană de contact" value={v.contactName} />
          <Row label="Telefon" value={v.contactPhone} />
          <Row label="Email" value={v.contactEmail} />
          <Row label="Site" value={v.website} />
          <Row label="Termen de plată" value={v.paymentTermsDays ? `${v.paymentTermsDays} zile` : null} />
          <Row label="Prima cerere" value={fmtDate(profile.kpis.firstRequestAt)} />
          <Row label="Ultima plată" value={fmtDate(profile.kpis.lastPaidAt)} />
        </dl>
      </Card>

      {profile.ratings.count > 0 && (
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 font-medium text-foreground">Cum a prestat, pe criterii</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CriterionBar label="Calitate" value={profile.ratings.quality} />
            <CriterionBar label="Termen" value={profile.ratings.timeliness} />
            <CriterionBar label="Preț / valoare" value={profile.ratings.price} />
            <CriterionBar label="Comunicare" value={profile.ratings.communication} />
          </div>
          {profile.ratings.wouldUseAgainPct != null && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{profile.ratings.wouldUseAgainPct}%</span> dintre cei care
              au răspuns ar mai lucra cu acest furnizor.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function CriterionBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{value == null ? "—" : value.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${((value ?? 0) / 5) * 100}%` }}
          role="progressbar"
          aria-valuenow={value ?? 0}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-label={label}
        />
      </div>
    </div>
  );
}

function RatingsTab({
  ratings,
  summary,
  onRate,
  onDelete,
}: {
  ratings: VendorRating[];
  summary: VendorProfile["ratings"];
  onRate: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  if (ratings.length === 0) {
    return (
      <EmptyState
        icon={<Star className="h-6 w-6" />}
        title="Nicio evaluare încă"
        description="După fiecare cerere plătită, solicitantul e întrebat cum a fost prestat serviciul. Poți nota și direct de aici."
        action={<Button onClick={onRate}>Evaluează acum</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex flex-col">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{summary.avg?.toFixed(1) ?? "—"}</span>
          <StarRating value={summary.avg} count={summary.count} />
        </div>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = Number(summary.distribution?.[String(star)] ?? 0);
            const pct = summary.count ? (n / summary.count) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-3 tabular-nums text-muted-foreground">{star}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {ratings.map((r) => (
        <Card key={r.id} className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StarRating value={r.stars} size="sm" />
              <span className="text-sm font-medium text-foreground">{r.authorName ?? "Coleg"}</span>
              {r.requestNo && <span className="text-xs text-muted-foreground">la cererea {r.requestNo}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Șterge evaluarea"
                onClick={() => void onDelete(r.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {r.comment && <p className="text-sm text-foreground">{r.comment}</p>}
          {r.wouldUseAgain != null && (
            <p className="text-xs text-muted-foreground">
              {r.wouldUseAgain ? "Ar mai lucra cu ei." : "Nu ar mai lucra cu ei."}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function OffersTab({
  offers,
  quotes,
  onAdd,
  onDelete,
}: {
  offers: VendorOffer[];
  quotes: VendorQuoteOffer[];
  onAdd: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adaugă ofertă
        </Button>
      </div>

      {offers.length === 0 && quotes.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-6 w-6" />}
          title="Nicio ofertă"
          description="Adaugă și oferte din trecut: comparate pe aceeași unitate de măsură, arată cum au evoluat prețurile."
        />
      ) : (
        <>
          {offers.map((o) => (
            <Card key={o.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <h3 className="font-medium text-foreground">{o.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(o.offeredAt)}
                  {o.validUntil && ` · valabilă până la ${fmtDate(o.validUntil)}`}
                  {o.unitLabel && o.unitPriceCents != null && ` · ${formatMDL(o.unitPriceCents)} / ${o.unitLabel}`}
                </p>
                {o.notes && <p className="mt-1 text-sm text-muted-foreground">{o.notes}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {o.amountCents == null ? "—" : formatMDL(o.amountCents)}
                </span>
                <Button variant="ghost" size="sm" aria-label={`Șterge oferta ${o.title}`} onClick={() => void onDelete(o.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ))}

          {quotes.map((q) => (
            <Card key={q.id} className="flex flex-wrap items-start justify-between gap-3 border-dashed p-4">
              <div className="min-w-0">
                <h3 className="font-medium text-foreground">
                  {q.title}
                  {q.selected && <Badge variant="success" className="ml-2">Aleasă</Badge>}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Din cerere · {fmtDate(q.offeredAt)}
                  {q.parId && (
                    <>
                      {" · "}
                      <Link to={`/business/par/${q.parId}`} className="text-primary hover:underline">
                        vezi cererea
                      </Link>
                    </>
                  )}
                </p>
                {q.notes && <p className="mt-1 text-sm text-muted-foreground">{q.notes}</p>}
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatMDL(q.amountCents)}</span>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function DocumentsTab({
  documents,
  onAdd,
  onDelete,
}: {
  documents: VendorDocument[];
  onAdd: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const now = Date.now();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adaugă document
        </Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Niciun document"
          description="Contracte, certificate, licențe — cu data până la care sunt valabile. Fișa avertizează când se apropie expirarea."
        />
      ) : (
        documents.map((d) => {
          const until = d.validUntil ? new Date(d.validUntil).getTime() : null;
          const expired = until != null && until < now;
          const expiring = until != null && !expired && until - now < 30 * 86_400_000;
          return (
            <Card key={d.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <h3 className="font-medium text-foreground">
                  {d.title}
                  <span className="ml-2 text-xs text-muted-foreground">{DOC_KIND_LABEL[d.kind] ?? d.kind}</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {d.number && `Nr. ${d.number} · `}
                  {d.issuedAt && `emis ${fmtDate(d.issuedAt)}`}
                </p>
                {d.notes && <p className="mt-1 text-sm text-muted-foreground">{d.notes}</p>}
              </div>
              <div className="flex items-center gap-3">
                {until != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                      expired ? "bg-destructive/10 text-destructive" : expiring ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {expired ? "Expirat" : "Valabil până la"} {fmtDate(d.validUntil)}
                  </span>
                )}
                <Button variant="ghost" size="sm" aria-label={`Șterge documentul ${d.title}`} onClick={() => void onDelete(d.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function NotesTab({
  notes,
  onAdd,
  onDelete,
}: {
  notes: VendorNote[];
  onAdd: (body: string, pinned: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await onAdd(body.trim(), pinned);
      setBody("");
      setPinned(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2 p-4">
        <Label htmlFor="note-body">Notă internă</Label>
        <Textarea
          id="note-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ex: cer avans 50%; livrează doar marțea; persoana de contact s-a schimbat."
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4" />
            Fixează sus (atenționare)
          </label>
          <Button onClick={() => void submit()} disabled={!body.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Adaugă nota
          </Button>
        </div>
      </Card>

      {notes.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquare className="h-6 w-6" />}
          title="Nicio notă internă"
          description="Notele sunt vizibile doar colegilor tăi, niciodată furnizorului."
        />
      ) : (
        notes.map((n) => (
          <Card key={n.id} className={cn("flex flex-col gap-1 p-4", n.pinned && "border-warning/50 bg-warning/5")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {n.pinned && <Pin className="h-3.5 w-3.5 text-warning" aria-label="Fixată" />}
                {n.authorName ?? "Coleg"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{fmtDate(n.createdAt)}</span>
                <Button variant="ghost" size="sm" aria-label="Șterge nota" onClick={() => void onDelete(n.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
          </Card>
        ))
      )}
    </div>
  );
}

function RelationshipDialog({
  open,
  onClose,
  current,
  currentReason,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  current: VendorRelationship;
  currentReason: string | null;
  onSave: (payload: { relationship: VendorRelationship; blocked_reason?: string | null }) => Promise<void>;
}) {
  const [relationship, setRelationship] = useState<VendorRelationship>(current);
  const [reason, setReason] = useState(currentReason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRelationship(current);
      setReason(currentReason ?? "");
      setError(null);
    }
  }, [open, current, currentReason]);

  const submit = async () => {
    if (relationship === "blocked" && !reason.trim()) {
      setError("Scrie de ce blochezi furnizorul — altfel nimeni nu va ști peste șase luni dacă mai e valabil.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ relationship, blocked_reason: relationship === "blocked" ? reason.trim() : null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Starea nu s-a putut salva.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Starea relației"
      description="Blocarea nu șterge furnizorul: istoricul plăților rămâne, dar formularul de cerere avertizează când cineva îl alege."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-col gap-1">
          <Label htmlFor="rel">Stare</Label>
          <Select id="rel" value={relationship} onChange={(e) => setRelationship(e.target.value as VendorRelationship)}>
            <option value="preferred">Preferat — prima opțiune la nevoie</option>
            <option value="active">Activ — colaborare normală</option>
            <option value="trial">În probă — încă îl testăm</option>
            <option value="blocked">Blocat — nu mai lucrăm cu el</option>
          </Select>
        </div>
        {relationship === "blocked" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="rel-reason">Motivul blocării *</Label>
            <Textarea
              id="rel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: a livrat de două ori marfă neconformă și nu a acceptat retur."
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function OfferDialog({
  open,
  onClose,
  categories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  categories: VendorCategory[];
  onSave: (payload: {
    title: string;
    category_id?: string | null;
    amount_cents?: number | null;
    unit_label?: string | null;
    unit_price_cents?: number | null;
    offered_at?: string | null;
    valid_until?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [offeredAt, setOfferedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toCents = (v: string): number | null => {
    const n = Number(v.replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        category_id: categoryId || null,
        amount_cents: toCents(amount),
        unit_label: unitLabel.trim() || null,
        unit_price_cents: toCents(unitPrice),
        offered_at: offeredAt || null,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      });
      setTitle(""); setAmount(""); setUnitLabel(""); setUnitPrice("");
      setOfferedAt(""); setValidUntil(""); setCategoryId(""); setNotes("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Oferta nu s-a salvat.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adaugă ofertă"
      description="Inclusiv oferte din trecut — au valoare tocmai pentru comparație."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-col gap-1">
          <Label htmlFor="of-title">Ce a ofertat *</Label>
          <Input id="of-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Catering pentru instruirea din mai" autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-amount">Total (MDL)</Label>
            <Input id="of-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-cat">Domeniu</Label>
            <Select id="of-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-unit">Unitate de măsură</Label>
            <Input id="of-unit" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="persoană, top hârtie, oră" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-unit-price">Preț pe unitate (MDL)</Label>
            <Input id="of-unit-price" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-date">Data ofertei</Label>
            <Input id="of-date" type="date" value={offeredAt} onChange={(e) => setOfferedAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="of-valid">Valabilă până la</Label>
            <Input id="of-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Prețul pe unitate e cel care face comparația posibilă: „2.000 lei" nu spune nimic dacă nu știi
          pentru câte bucăți.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="of-notes">Observații</Label>
          <Textarea id="of-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function DocumentDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    kind: "contract" | "certificat" | "licenta" | "polita" | "alt";
    title: string;
    number?: string | null;
    issued_at?: string | null;
    valid_until?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<"contract" | "certificat" | "licenta" | "polita" | "alt">("contract");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        kind,
        title: title.trim(),
        number: number.trim() || null,
        issued_at: issuedAt || null,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      });
      setTitle(""); setNumber(""); setIssuedAt(""); setValidUntil(""); setNotes("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Documentul nu s-a salvat.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adaugă document"
      description="Data expirării e ce contează: fișa avertizează cu 30 de zile înainte."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="doc-kind">Tip</Label>
            <Select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="contract">Contract</option>
              <option value="certificat">Certificat</option>
              <option value="licenta">Licență</option>
              <option value="polita">Poliță</option>
              <option value="alt">Alt document</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="doc-number">Număr</Label>
            <Input id="doc-number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="doc-title">Denumire *</Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Contract cadru de prestări servicii" autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="doc-issued">Data emiterii</Label>
            <Input id="doc-issued" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="doc-valid">Valabil până la</Label>
            <Input id="doc-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="doc-notes">Observații</Label>
          <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function CategoryPickDialog({
  open,
  onClose,
  categories,
  selected,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  categories: VendorCategory[];
  selected: string[];
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setPicked(selected);
  }, [open, selected]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Domenii de activitate"
      description="Un furnizor poate ține de mai multe domenii — catering și transport, de exemplu."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button>
          <Button
            onClick={() => {
              setSaving(true);
              void onSave(picked).finally(() => { setSaving(false); onClose(); });
            }}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      }
    >
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nu există domenii încă. Le adaugi din pagina de furnizori, butonul „Domenii".
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.filter((c) => c.active).map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={picked.includes(cat.id)}
              onClick={() => setPicked((p) => (p.includes(cat.id) ? p.filter((x) => x !== cat.id) : [...p, cat.id]))}
              className={cn(
                "touch-target rounded-full border px-3 py-1 text-sm",
                picked.includes(cat.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
