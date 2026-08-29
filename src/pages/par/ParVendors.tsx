/**
 * PAR-VENDOR360 — /business/par/vendors
 *
 * Registrul de beneficiari a fost până acum un tabel de rechizite ascuns în Administrare: nume,
 * IDNO, IBAN. Pagina asta îl transformă în ceea ce organizația chiar caută când alege pe cineva:
 * „cine ne face catering și cu ce notă", „cui i-am plătit cel mai mult anul ăsta", „cine e blocat
 * și de ce".
 *
 * Filtrul principal e DOMENIUL (mâncare, birotică, servicii juridice…), pentru că așa caută omul:
 * pornește de la nevoie, nu de la numele firmei.
 *
 * Design: tokeni Vector 365, light + dark, WCAG AA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Tags,
  X,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link } from "@/router/HashRouter";
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
} from "@/components/ds";
import { StarRating } from "@/components/par/VendorStars";
import { cn } from "@/lib/utils";
import { formatMDL, createVendor, getParMe } from "@/lib/api/par";
import {
  listVendorCategories,
  listVendorDirectory,
  createVendorCategory,
  seedVendorCategories,
  deleteVendorCategory,
  setVendorCategories,
  type VendorCategory,
  type VendorDirectoryItem,
} from "@/lib/api/parVendorProfile";

const RELATIONSHIP_LABEL: Record<string, string> = {
  preferred: "Preferat",
  active: "Activ",
  trial: "În probă",
  blocked: "Blocat",
};

const RELATIONSHIP_VARIANT: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  preferred: "success",
  active: "secondary",
  trial: "warning",
  blocked: "destructive",
};

function lastPaidLabel(iso: string | null): string {
  if (!iso) return "Nicio plată";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Plătit azi";
  if (days === 1) return "Plătit ieri";
  if (days < 30) return `Plătit acum ${days} zile`;
  if (days < 365) return `Plătit acum ${Math.floor(days / 30)} luni`;
  return `Plătit acum ${Math.floor(days / 365)} ani`;
}

export default function ParVendors() {
  const [vendors, setVendors] = useState<VendorDirectoryItem[]>([]);
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [relationship, setRelationship] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sort, setSort] = useState<"name" | "paid" | "rating" | "recent">("name");

  const [addOpen, setAddOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dir, cats] = await Promise.all([
        listVendorDirectory({
          q: q || undefined,
          category: category || undefined,
          relationship: relationship || undefined,
          minRating: minRating ? Number(minRating) : undefined,
          sort,
        }),
        listVendorCategories(),
      ]);
      setVendors(dir.vendors);
      setCategories(cats.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lista de furnizori nu s-a putut încărca.");
    } finally {
      setLoading(false);
    }
  }, [q, category, relationship, minRating, sort]);

  useEffect(() => {
    // Căutarea se face la 300 ms după ce omul se oprește din tastat, nu la fiecare literă.
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    getParMe()
      .then((me) => setIsAdmin(me.roles.includes("par_admin")))
      .catch(() => setIsAdmin(false));
  }, []);

  const activeFilters = [category, relationship, minRating].filter(Boolean).length;

  const totals = useMemo(
    () => ({
      count: vendors.length,
      paid: vendors.reduce((sum, v) => sum + v.paidCents, 0),
      rated: vendors.filter((v) => v.ratingCount > 0).length,
      blocked: vendors.filter((v) => v.relationship === "blocked").length,
    }),
    [vendors]
  );

  return (
    <BusinessShell
      pageTitle="Furnizori"
      pageDescription={`${totals.count} furnizori · ${formatMDL(totals.paid)} plătiți · ${totals.rated} evaluați${totals.blocked > 0 ? ` · ${totals.blocked} blocați` : ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Tags className="h-4 w-4" aria-hidden="true" />
              Domenii
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adaugă furnizor
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* Domeniile ca filtru principal: omul caută „cine ne face catering", nu numele firmei. */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrează pe domeniu">
            <button
              type="button"
              onClick={() => setCategory("")}
              aria-pressed={category === ""}
              className={cn(
                "touch-target rounded-full border px-3 py-1 text-sm transition-colors",
                category === ""
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              Toate
            </button>
            {categories
              .filter((c) => c.active)
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(category === cat.id ? "" : cat.id)}
                  aria-pressed={category === cat.id}
                  className={cn(
                    "touch-target rounded-full border px-3 py-1 text-sm transition-colors",
                    category === cat.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {cat.name}
                  {cat.vendorCount != null && cat.vendorCount > 0 && (
                    <span className="ml-1 text-xs opacity-70">{cat.vendorCount}</span>
                  )}
                </button>
              ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <Label htmlFor="vendor-search">Caută</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="vendor-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nume, cod fiscal sau IBAN"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vendor-relationship">Stare</Label>
            <Select id="vendor-relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
              <option value="">Toate</option>
              <option value="preferred">Preferați</option>
              <option value="active">Activi</option>
              <option value="trial">În probă</option>
              <option value="blocked">Blocați</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vendor-rating">Notă minimă</Label>
            <Select id="vendor-rating" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
              <option value="">Oricare</option>
              <option value="4">4 stele și peste</option>
              <option value="3">3 stele și peste</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vendor-sort">Sortare</Label>
            <Select id="vendor-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="name">Alfabetic</option>
              <option value="paid">Cei mai plătiți</option>
              <option value="rating">Cei mai bine notați</option>
              <option value="recent">Plătiți recent</option>
            </Select>
          </div>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setCategory("");
                setRelationship("");
                setMinRating("");
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Șterge filtrele ({activeFilters})
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă furnizorii…
          </div>
        ) : vendors.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={activeFilters || q ? "Niciun furnizor pe filtrele astea" : "Niciun furnizor încă"}
            description={
              activeFilters || q
                ? "Schimbă filtrul sau caută altceva."
                : "Furnizorii apar automat din cererile trimise. Poți adăuga și manual pe cineva cu care abia urmează să lucrezi."
            }
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adaugă furnizor
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {vendors.map((v) => (
              <Link
                key={v.id}
                to={`/business/par/vendors/${v.id}`}
                className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium text-foreground">{v.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {v.idnp ? `Cod fiscal ${v.idnp}` : "Fără cod fiscal"}
                      </p>
                    </div>
                    <Badge variant={RELATIONSHIP_VARIANT[v.relationship] ?? "secondary"}>
                      {RELATIONSHIP_LABEL[v.relationship] ?? v.relationship}
                    </Badge>
                  </div>

                  {v.relationship === "blocked" && v.blockedReason && (
                    <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {v.blockedReason}
                    </p>
                  )}

                  {v.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {v.categories.map((cat) => (
                        <span key={cat.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                    <StarRating value={v.ratingAvg} count={v.ratingCount || undefined} />
                    <span className="text-sm font-medium tabular-nums text-foreground">{formatMDL(v.paidCents)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.requestCount} cereri · {lastPaidLabel(v.lastPaidAt)}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddVendorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        onCreated={() => void load()}
      />
      <CategoriesDialog
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={categories}
        onChanged={() => void load()}
      />
    </BusinessShell>
  );
}

/** Adăugarea manuală: cineva cu care abia urmează să lucrezi, înainte de prima cerere. */
function AddVendorDialog({
  open,
  onClose,
  categories,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: VendorCategory[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [idnp, setIdnp] = useState("");
  const [iban, setIban] = useState("");
  const [bank, setBank] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const vendor = await createVendor({
        name: name.trim(),
        idnp: idnp.trim() || null,
        iban: iban.trim() || null,
        bank: bank.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
      });
      if (picked.length) await setVendorCategories(vendor.id, picked);
      setName(""); setIdnp(""); setIban(""); setBank("");
      setContactName(""); setContactPhone(""); setContactEmail(""); setPicked([]);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Furnizorul nu s-a salvat.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adaugă furnizor"
      description="Doar numele e obligatoriu — restul se completează pe parcurs, inclusiv automat din cereri."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-col gap-1">
          <Label htmlFor="nv-name">Denumire *</Label>
          <Input id="nv-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-idnp">Cod fiscal / IDNO</Label>
            <Input id="nv-idnp" value={idnp} onChange={(e) => setIdnp(e.target.value)} inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-iban">IBAN</Label>
            <Input id="nv-iban" value={iban} onChange={(e) => setIban(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-bank">Banca</Label>
            <Input id="nv-bank" value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-contact">Persoană de contact</Label>
            <Input id="nv-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-phone">Telefon</Label>
            <Input id="nv-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} type="tel" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nv-email">Email</Label>
            <Input id="nv-email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" />
          </div>
        </div>
        {categories.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Domenii</legend>
            <div className="flex flex-wrap gap-2">
              {categories.filter((c) => c.active).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={picked.includes(cat.id)}
                  onClick={() =>
                    setPicked((prev) => (prev.includes(cat.id) ? prev.filter((x) => x !== cat.id) : [...prev, cat.id]))
                  }
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
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

/** Administrarea domeniilor — lista pe care se sprijină tot filtrul. */
function CategoriesDialog({
  open,
  onClose,
  categories,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  categories: VendorCategory[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operația nu a reușit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Domenii de activitate"
      description="Filtrul principal din pagina de furnizori. Un furnizor poate ține de mai multe domenii."
      footer={<div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Închide</Button></div>}
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="cat-name">Domeniu nou</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Servicii de traducere"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  e.preventDefault();
                  void run(async () => { await createVendorCategory(name.trim()); setName(""); });
                }
              }}
            />
          </div>
          <Button
            disabled={!name.trim() || busy}
            onClick={() => void run(async () => { await createVendorCategory(name.trim()); setName(""); })}
          >
            Adaugă
          </Button>
        </div>

        {categories.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              Nu ai încă domenii. Pornește de la o listă gata făcută și modific-o după nevoie.
            </p>
            <Button variant="outline" disabled={busy} onClick={() => void run(seedVendorCategories)}>
              Pune lista implicită (12 domenii)
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-foreground">
                  {cat.name}
                  <span className="ml-2 text-xs text-muted-foreground">{cat.vendorCount ?? 0} furnizori</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => deleteVendorCategory(cat.id))}
                  aria-label={`Șterge domeniul ${cat.name}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
