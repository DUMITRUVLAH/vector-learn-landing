/**
 * CRM — firme și curățarea duplicatelor.
 *
 * Două lucruri diferite pe același ecran, fiindcă în practică sunt același
 * gând: „cine sunt clienții mei și de câte ori îi am scriși".
 *
 * Partea de duplicate e cea delicată. O unificare mută istoricul a două fișe
 * într-una singură și NU se desface dintr-un buton, așa că ecranul impune
 * ordinea: alegi fișa care rămâne → citești ce se va întâmpla → confirmi.
 * Butonul de unificare nu există până nu s-a cerut previzualizarea.
 *
 * Ce spunem pe față omului, fiindcă altfel pare că pierde date: duplicatul NU
 * se șterge. Rămâne în bază, marcat, cu istoricul mutat pe fișa păstrată.
 */
import { useCallback, useEffect, useState } from "react";
import { Building2, Users, Loader2, Plus, Search, GitMerge, AlertTriangle } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from "@/components/ds";
import {
  listCrmCompanies,
  createCrmCompany,
  listCrmDuplicates,
  previewCrmMerge,
  mergeCrmLeads,
  MERGE_FIELD_LABELS,
  type CrmCompany,
  type CrmCompanyInput,
  type CrmDuplicateCluster,
  type CrmMergePlan,
} from "@/lib/api/crmCompanies";

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function CrmCompaniesPage() {
  const [tab, setTab] = useState("firme");

  return (
    <BusinessShell
      pageTitle="Clienți & firme"
      pageDescription="Baza unică de firme și fișele care s-au dublat pe parcurs."
    >
      <div className="space-y-6">
        <Tabs
          aria-label="Secțiunile paginii de clienți"
          tabs={[
            { value: "firme", label: "Firme" },
            { value: "duplicate", label: "Duplicate" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "firme" ? <CompaniesTab /> : <DuplicatesTab />}
      </div>
    </BusinessShell>
  );
}

// ─── Firme ───────────────────────────────────────────────────────────────────

function CompaniesTab() {
  const [items, setItems] = useState<CrmCompany[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmCompanies(term);
      setItems(res.items);
    } catch (err) {
      setError(errText(err, "Nu am putut încărca firmele."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Căutarea se trimite după ce omul se oprește din scris — altfel fiecare
    // literă ar fi o cerere, iar pool-ul de conexiuni e de trei.
    const t = setTimeout(() => void load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-1 sm:max-w-sm">
          <Label htmlFor="firme-cauta">Caută firma</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="firme-cauta"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nume, cod fiscal, telefon sau email"
            />
          </div>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Firmă nouă
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă firmele" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title={search ? "Nicio firmă găsită" : "Nicio firmă încă"}
          description={
            search
              ? "Încearcă alt cuvânt — căutarea merge și pe cod fiscal, telefon sau email."
              : "Firmele apar aici pe măsură ce le adaugi sau le imporți odată cu lead-urile."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Firme">
            <TableHeader>
              <TableRow>
                <TableHead>Firmă</TableHead>
                <TableHead>Cod fiscal</TableHead>
                <TableHead>Industrie</TableHead>
                <TableHead>Regiune</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{c.idno || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.industry || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.region || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || c.email || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {adding && (
        <CompanyDialog
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load(search);
          }}
        />
      )}
    </div>
  );
}

function CompanyDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState<CrmCompanyInput>({ name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CrmCompanyInput>(key: K, value: CrmCompanyInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await createCrmCompany(form);
      await onSaved();
    } catch (err) {
      setError(errText(err, "Nu am putut salva firma."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Firmă nouă">
      <div className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="space-y-1">
          <Label htmlFor="f-nume">Denumire</Label>
          <Input id="f-nume" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="f-idno">Cod fiscal (IDNO)</Label>
            <Input id="f-idno" value={form.idno ?? ""} onChange={(e) => set("idno", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-industrie">Industrie</Label>
            <Input id="f-industrie" value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-regiune">Regiune</Label>
            <Input id="f-regiune" value={form.region ?? ""} onChange={(e) => set("region", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-marime">Mărime</Label>
            <Input id="f-marime" value={form.companySize ?? ""} onChange={(e) => set("companySize", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-telefon">Telefon</Label>
            <Input id="f-telefon" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-email">Email</Label>
            <Input id="f-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-adresa">Adresă</Label>
          <Input id="f-adresa" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-note">Notițe</Label>
          <Textarea id="f-note" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={() => void save()} disabled={saving || form.name.trim().length < 2}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

function DuplicatesTab() {
  const [clusters, setClusters] = useState<CrmDuplicateCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CrmDuplicateCluster | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmDuplicates();
      setClusters(res.clusters);
    } catch (err) {
      setError(errText(err, "Nu am putut căuta duplicatele."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se caută duplicatele" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      {clusters.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Nicio fișă dublată"
          description="Căutăm potriviri pe telefon și email normalizat. Deocamdată baza e curată."
        />
      ) : (
        <>
          <Alert>
            Am găsit {clusters.length} {clusters.length === 1 ? "grup" : "grupuri"} de fișe care par să fie aceeași
            persoană. Unificarea nu șterge nimic: fișa duplicat rămâne în bază, marcată, iar istoricul ei se mută pe fișa
            pe care o păstrezi.
          </Alert>

          {clusters.map((cluster) => (
            <Card key={cluster.records.map((r) => r.id).join("-")} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{cluster.records.length} fișe</Badge>
                {cluster.reasons.map((r) => (
                  <Badge key={r}>{r}</Badge>
                ))}
              </div>
              <div className="overflow-x-auto">
                <Table aria-label="Fișe posibil duplicate">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nume</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Firmă</TableHead>
                      <TableHead className="text-right">Valoare</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cluster.records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.company || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.valueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" onClick={() => setOpen(cluster)}>
                <GitMerge className="h-4 w-4" aria-hidden="true" />
                Unifică fișele
              </Button>
            </Card>
          ))}
        </>
      )}

      {open && (
        <MergeDialog
          cluster={open}
          onClose={() => setOpen(null)}
          onMerged={async () => {
            setOpen(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Ordinea impusă aici e intenționată: alegi fișa păstrată → ceri planul → abia
 * atunci apare butonul care scrie. Nu se poate unifica „din reflex".
 */
function MergeDialog({
  cluster,
  onClose,
  onMerged,
}: {
  cluster: CrmDuplicateCluster;
  onClose: () => void;
  onMerged: () => void | Promise<void>;
}) {
  const [primaryId, setPrimaryId] = useState(cluster.records[0]?.id ?? "");
  const [plan, setPlan] = useState<CrmMergePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicateIds = cluster.records.map((r) => r.id).filter((id) => id !== primaryId);

  // Schimbarea fișei păstrate invalidează planul: altfel omul ar putea confirma
  // un plan calculat pentru altă fișă.
  useEffect(() => {
    setPlan(null);
  }, [primaryId]);

  async function askPlan() {
    setBusy(true);
    setError(null);
    try {
      const res = await previewCrmMerge({ primaryId, duplicateIds });
      setPlan(res.plan);
    } catch (err) {
      setError(errText(err, "Nu am putut calcula planul de unificare."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await mergeCrmLeads({ primaryId, duplicateIds });
      await onMerged();
    } catch (err) {
      setError(errText(err, "Unificarea nu a reușit."));
    } finally {
      setBusy(false);
    }
  }

  const changed = (plan?.fields ?? []).filter((f) => f.keep === "duplicate");

  return (
    <Dialog open onClose={onClose} title="Unifică fișele">
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Care fișă rămâne?</legend>
          {cluster.records.map((r) => (
            <label key={r.id} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <input
                type="radio"
                name="fisa-pastrata"
                className="mt-1"
                checked={primaryId === r.id}
                onChange={() => setPrimaryId(r.id)}
              />
              <span>
                <span className="font-medium">{r.fullName}</span>
                <span className="block text-muted-foreground">
                  {[r.phone, r.email, r.company].filter(Boolean).join(" · ") || "fără date de contact"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {!plan ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button onClick={() => void askPlan()} disabled={busy || duplicateIds.length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Vezi ce se va întâmpla
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">După unificare:</p>
              {changed.length > 0 ? (
                <ul className="space-y-1">
                  {changed.map((f) => (
                    <li key={f.field} className="text-muted-foreground">
                      <span className="text-foreground">{MERGE_FIELD_LABELS[f.field] ?? f.field}</span> se completează cu
                      „{String(f.value ?? "")}" — era gol pe fișa păstrată.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Fișa păstrată are deja toate datele; nu se suprascrie nimic.</p>
              )}
              <p className="text-muted-foreground">
                Valoarea oportunităților se adună: <span className="tabular-nums">{money(plan.valueCentsTotal)}</span>.
              </p>
              {plan.reparented.length > 0 && (
                <p className="text-muted-foreground">
                  Se mută pe fișa păstrată: {plan.reparented.map((r) => `${r.count} × ${r.table}`).join(", ")}.
                </p>
              )}
              {plan.droppedTags.length > 0 && (
                <p className="text-muted-foreground">
                  Etichete deja prezente, rămân pe fișa arhivată: {plan.droppedTags.map((t) => t.tag).join(", ")}.
                </p>
              )}
            </div>

            <Alert variant="destructive">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Unificarea nu se poate desface dintr-un buton. Fișele duplicat rămân în bază, marcate, dar istoricul lor
                se mută definitiv pe fișa păstrată.
              </span>
            </Alert>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPlan(null)}>
                Înapoi
              </Button>
              <Button onClick={() => void confirm()} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Unifică {duplicateIds.length + 1} fișe
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
