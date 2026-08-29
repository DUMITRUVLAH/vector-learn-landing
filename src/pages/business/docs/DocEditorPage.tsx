/**
 * DG-109 — formularul de completare a unui act.
 *
 * Promisiunea, concret: de la „act nou" la PDF în sub două minute, fără să retastezi niciun
 * rechizit. De aceea aici NU există câmpuri de IBAN, cod fiscal sau bancă: alegi furnizorul, iar
 * serverul (DG-108) le citește din registru. Ce rămâne de completat e ce chiar e specific actului:
 * titlul, proiectul, pozițiile.
 *
 * Ciorna se salvează singură (debounce), pentru că actele se fac între două telefoane, iar
 * pierderea a zece minute de completare e motivul clasic pentru care oamenii se întorc la Word.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Trash2,
  Check,
  Download,
  Banknote,
  GitBranch,
  History,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  createDocument,
  getDocument,
  updateDocument,
  finalizeDocument,
  convertDocumentToPar,
  getDocumentTrail,
  listDerivableKinds,
  deriveDocument,
  listDocTemplates,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type DocDetail,
  type DocTemplateListItem,
  type DocTrail,
} from "@/lib/api/docs";
import { listVendors, listProjects, type ParVendor, type ParProject } from "@/lib/api/par";
import { fieldLabel } from "@/lib/docs/fieldCatalog";
import { NewVendorPanel } from "./NewVendorPanel";

/**
 * Cantitatea și prețul se țin ca TEXT cât timp omul tastează.
 * De ce: dacă le ții ca număr, ștergerea câmpului („golesc și scriu 2") îl readuce instantaneu la
 * 1, iar următoarea tastă produce „12" — cantitate greșită pe un act semnat, dintr-o cursă de
 * interfață. Conversia se face o singură dată, la trimitere.
 */
interface LineDraft {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { description: "", unit: "buc", quantity: "1", unitPrice: "" };

function lineQty(l: LineDraft): number {
  const n = Number.parseInt(l.quantity, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** „12,50" sau „12.50" → 1250 bani. Omul tastează cum îi vine, nu în unități minore. */
function parseMoney(text: string): number {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Jurnalul se citește de oameni: „a finalizat actul", nu „finalized". */
const AUDIT_LABELS: Record<string, string> = {
  created: "a creat actul",
  updated: "a modificat actul",
  finalized: "a finalizat actul",
  cancelled: "a anulat actul",
  downloaded: "a descărcat PDF-ul",
  emailed: "a trimis actul pe email",
  converted_to_par: "a transformat actul în cerere de plată",
  derived: "a creat un act pe baza acestuia",
};

export function DocEditorPage() {
  const { path, navigate } = useRouter();
  const docId = useMemo(() => {
    // Ruta se citește fără prefix fix: dacă mâine actele se mută sub alt segment, pagina nu se rupe.
    const m = path.match(/\/docs\/([^/?]+)/);
    const id = m?.[1];
    return id && id !== "nou" && id !== "templates" ? id : null;
  }, [path]);

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [templates, setTemplates] = useState<DocTemplateListItem[]>([]);
  const [vendors, setVendors] = useState<ParVendor[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("act_primire_predare");
  const [templateId, setTemplateId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [trail, setTrail] = useState<DocTrail | null>(null);
  const [derivableKinds, setDerivableKinds] = useState<string[]>([]);
  const dirty = useRef(false);

  const total = useMemo(
    () => lines.reduce((s, l) => s + lineQty(l) * parseMoney(l.unitPrice), 0),
    [lines]
  );

  // ── Încărcare ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [tpls, vnd, prj] = await Promise.all([
          listDocTemplates().catch(() => []),
          listVendors().then((r) => r.items).catch(() => []),
          listProjects().then((r) => r.items).catch(() => []),
        ]);
        if (cancelled) return;
        setTemplates(tpls);
        setVendors(vnd);
        setProjects(prj);

        if (docId) {
          const d = await getDocument(docId);
          if (cancelled) return;
          setDoc(d);
          void getDocumentTrail(docId).then((t) => !cancelled && setTrail(t)).catch(() => {});
          if (d.status === "final") {
            void listDerivableKinds(docId)
              .then((r) => !cancelled && setDerivableKinds(r.kinds))
              .catch(() => {});
          }
          setTitle(d.title);
          setKind(d.kind);
          setTemplateId(d.templateId ?? "");
          setVendorId(d.counterpartyId ?? "");
          setProjectId(d.projectId ?? "");
          setLines(
            d.lines.length > 0
              ? d.lines.map((l) => ({
                  description: l.description,
                  unit: l.unit,
                  quantity: String(l.quantity),
                  unitPrice: money(l.unitPriceCents),
                }))
              : [{ ...EMPTY_LINE }]
          );
        }
      } catch {
        if (!cancelled) setError("Nu am putut încărca actul.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const payload = useCallback(
    () => ({
      templateId: templateId || null,
      kind,
      title: title.trim() || "Act fără titlu",
      projectId: projectId || null,
      counterparty: vendorId
        ? { kind: "vendor" as const, id: vendorId }
        : { kind: "inline" as const, name: vendorQuery.trim() || null },
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          unit: l.unit,
          quantity: lineQty(l),
          unitPriceCents: parseMoney(l.unitPrice),
        })),
    }),
    [templateId, kind, title, projectId, vendorId, vendorQuery, lines]
  );

  const save = useCallback(async () => {
    if (doc?.status && doc.status !== "draft") return;
    setSaving(true);
    setError(null);
    try {
      if (docId) {
        const updated = await updateDocument(docId, payload());
        setMissing(updated.missing ?? []);
      } else {
        const created = await createDocument(payload());
        setMissing((created as DocDetail).missing ?? []);
        navigate(`/business/docs/${created.id}`);
      }
      setSavedAt(new Date());
      dirty.current = false;
    } catch {
      setError("Ciorna nu a putut fi salvată.");
    } finally {
      setSaving(false);
    }
  }, [doc?.status, docId, payload, navigate]);

  // Auto-save: ciorna nu se pierde pentru că a sunat telefonul.
  useEffect(() => {
    if (loading || !dirty.current) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [title, kind, templateId, vendorId, projectId, lines, loading, save]);

  const touch = useCallback(() => {
    dirty.current = true;
  }, []);

  const finalize = useCallback(async () => {
    if (!docId) return;
    setError(null);
    try {
      if (dirty.current) await save();
      const d = await finalizeDocument(docId);
      setDoc(d);
      navigate("/business/docs");
    } catch (e) {
      const body = (e as { body?: { missing?: string[]; message?: string } }).body;
      if (body?.missing?.length) {
        setMissing(body.missing);
        setError(`Nu pot finaliza — lipsește: ${body.missing.join(", ")}.`);
      } else {
        setError(body?.message ?? "Actul nu a putut fi finalizat.");
      }
    }
  }, [docId, save, navigate]);

  /**
   * „Transformă în PAR" — motivul pentru care există modulul. Dacă actul are deja o cerere, serverul
   * răspunde 409 și abia atunci întrebăm omul: o a doua cerere din același act e uneori intenționată
   * (plată în tranșe), dar niciodată din greșeală.
   */
  const toPar = useCallback(async () => {
    if (!docId) return;
    setError(null);
    try {
      const res = await convertDocumentToPar(docId);
      navigate(`/business/par/${res.parId}`);
    } catch (e) {
      const body = (e as { body?: { error?: string; message?: string } }).body;
      if (body?.error === "already_converted") {
        const again = window.confirm(
          "Actul are deja o cerere de plată. Creezi încă una? (se face doar dacă plata e în tranșe)"
        );
        if (!again) return;
        try {
          const res = await convertDocumentToPar(docId, true);
          navigate(`/business/par/${res.parId}`);
          return;
        } catch {
          setError("Cererea de plată nu a putut fi creată.");
          return;
        }
      }
      setError(body?.message ?? "Cererea de plată nu a putut fi creată.");
    }
  }, [docId, navigate]);

  /** „Act nou pe baza acestuia": derivatul preia părțile și pozițiile, cu referința scrisă singură. */
  const derive = useCallback(
    async (kind: string) => {
      if (!docId) return;
      setError(null);
      try {
        const created = await deriveDocument(docId, kind);
        navigate(`/business/docs/${created.id}`);
      } catch {
        setError("Actul derivat nu a putut fi creat.");
      }
    },
    [docId, navigate]
  );

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return vendors.slice(0, 8);
    return vendors
      .filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.idnp ?? "").includes(q)
      )
      .slice(0, 8);
  }, [vendors, vendorQuery]);

  const selectedVendor = vendors.find((v) => v.id === vendorId) ?? null;
  const readOnly = !!doc && doc.status !== "draft";

  return (
    <BusinessShell
      pageTitle={docId ? "Act" : "Act nou"}
      pageDescription="Alege furnizorul — rechizitele vin din registru. Completează doar ce e specific actului."
      actions={
        <div className="flex gap-2">
          {docId && (
            <a
              href={`/api/docs/documents/${docId}/pdf`}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Descarcă PDF
            </a>
          )}
        <button
          type="button"
          onClick={() => navigate("/business/docs")}
          className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi la acte
        </button>
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="doc-title" className="block text-sm font-medium text-foreground">
                  Titlul actului
                </label>
                <input
                  id="doc-title"
                  value={title}
                  disabled={readOnly}
                  onChange={(e) => {
                    touch();
                    setTitle(e.target.value);
                  }}
                  placeholder="Act de primire-predare — echipament IT"
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label htmlFor="doc-kind" className="block text-sm font-medium text-foreground">
                  Tipul actului
                </label>
                <select
                  id="doc-kind"
                  value={kind}
                  disabled={readOnly}
                  onChange={(e) => {
                    touch();
                    setKind(e.target.value);
                  }}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="doc-template" className="block text-sm font-medium text-foreground">
                  Șablon
                </label>
                <select
                  id="doc-template"
                  value={templateId}
                  disabled={readOnly}
                  onChange={(e) => {
                    touch();
                    setTemplateId(e.target.value);
                  }}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Fără șablon</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="doc-project" className="block text-sm font-medium text-foreground">
                  Proiect
                </label>
                <select
                  id="doc-project"
                  value={projectId}
                  disabled={readOnly}
                  onChange={(e) => {
                    touch();
                    setProjectId(e.target.value);
                  }}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Fără proiect</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Traseul actului: contract → act → cerere de plată. Răspunde la „unde s-a oprit?". */}
            {trail &&
              ((trail.basedOn?.length ?? 0) > 0 ||
                (trail.derived?.length ?? 0) > 0 ||
                (trail.paymentRequests?.length ?? 0) > 0) && (
              <section aria-label="Traseul actului" className="rounded-lg border border-border p-4">
                <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                  Traseul actului
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {(trail.basedOn ?? []).map((d) => (
                    <li key={d.id}>
                      <span className="text-muted-foreground">În baza: </span>
                      <a href={`#/business/docs/${d.id}`} className="text-primary hover:underline">
                        {d.docNumber ?? d.title}
                      </a>
                      <span className="text-muted-foreground"> · {DOC_STATUS_LABELS[d.status] ?? d.status}</span>
                    </li>
                  ))}
                  {(trail.derived ?? []).map((d) => (
                    <li key={d.id}>
                      <span className="text-muted-foreground">A născut: </span>
                      <a href={`#/business/docs/${d.id}`} className="text-primary hover:underline">
                        {d.docNumber ?? d.title}
                      </a>
                      <span className="text-muted-foreground"> · {DOC_STATUS_LABELS[d.status] ?? d.status}</span>
                    </li>
                  ))}
                  {(trail.paymentRequests ?? []).map((p) => (
                    <li key={p.id}>
                      <span className="text-muted-foreground">Cerere de plată: </span>
                      <a href={`#/business/par/${p.id}`} className="text-primary hover:underline">
                        {p.requestNo}
                      </a>
                      <span className="text-muted-foreground">
                        {" · "}
                        {p.paidAt ? "plătită" : p.approvedAt ? "aprobată" : p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {derivableKinds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-4">
                <label htmlFor="derive-kind" className="text-sm text-foreground">
                  Creează act pe baza acestuia:
                </label>
                <select
                  id="derive-kind"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) void derive(e.target.value);
                  }}
                  className="touch-target rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Alege tipul…</option>
                  {derivableKinds.map((k) => (
                    <option key={k} value={k}>
                      {DOC_KIND_LABELS[k] ?? k}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Contrapartea: un singur câmp de căutare, apoi rechizitele apar singure. */}
            <section className="rounded-lg border border-border p-4">
              <label htmlFor="doc-vendor" className="block text-sm font-medium text-foreground">
                Contrapartea
              </label>
              <input
                id="doc-vendor"
                value={selectedVendor ? selectedVendor.name : vendorQuery}
                disabled={readOnly}
                onChange={(e) => {
                  touch();
                  setVendorId("");
                  setVendorQuery(e.target.value);
                }}
                placeholder="Scrie 2 litere din denumire sau codul fiscal…"
                className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />

              {!selectedVendor && vendorQuery.trim().length >= 2 && (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {filteredVendors.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          touch();
                          setVendorId(v.id);
                          setVendorQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/40"
                      >
                        <span className="text-foreground">{v.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {v.idnp ?? "fără cod fiscal"}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredVendors.length === 0 && (
                    <li className="p-3 text-sm text-muted-foreground">
                      Niciun furnizor găsit în registru.
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      onClick={() => setAddingVendor(true)}
                      className="flex w-full items-center gap-2 p-3 text-left text-sm text-primary hover:bg-muted/40"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Adaugă furnizor nou
                    </button>
                  </li>
                </ul>
              )}

              {addingVendor && (
                <NewVendorPanel
                  initialName={vendorQuery}
                  onCancel={() => setAddingVendor(false)}
                  onCreated={(v) => {
                    // Furnizorul nou intră imediat în listă și în act — fără să reîncarci pagina și
                    // fără să pierzi ce ai completat până acum.
                    setVendors((vs) => [v, ...vs.filter((x) => x.id !== v.id)]);
                    setVendorId(v.id);
                    setVendorQuery("");
                    setAddingVendor(false);
                    touch();
                  }}
                />
              )}

              {selectedVendor && (
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Cod fiscal</dt>
                    <dd className="text-foreground">{selectedVendor.idnp ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">IBAN</dt>
                    <dd className="font-mono text-foreground">{selectedVendor.iban ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Banca</dt>
                    <dd className="text-foreground">{selectedVendor.bank ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Adresa juridică</dt>
                    <dd className="text-foreground">{selectedVendor.legalAddress ?? "—"}</dd>
                  </div>
                </dl>
              )}
            </section>

            {/* Pozițiile: totalul se calculează pe server, aici doar se vede. */}
            <section className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">Pozițiile actului</h2>
                <span className="text-sm text-muted-foreground">
                  Total: <strong className="text-foreground">{money(total)} MDL</strong>
                </span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 font-medium">Denumire</th>
                      <th className="px-2 py-1 font-medium">UM</th>
                      <th className="px-2 py-1 font-medium">Cant.</th>
                      <th className="px-2 py-1 font-medium">Preț</th>
                      <th className="px-2 py-1 font-medium text-right">Sumă</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Denumirea poziției ${i + 1}`}
                            value={l.description}
                            disabled={readOnly}
                            onChange={(e) => {
                              touch();
                              setLines((ls) =>
                                ls.map((x, j) => (i === j ? { ...x, description: e.target.value } : x))
                              );
                            }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Unitatea de măsură ${i + 1}`}
                            value={l.unit}
                            disabled={readOnly}
                            onChange={(e) => {
                              touch();
                              setLines((ls) => ls.map((x, j) => (i === j ? { ...x, unit: e.target.value } : x)));
                            }}
                            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-foreground"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Cantitatea ${i + 1}`}
                            inputMode="numeric"
                            value={l.quantity}
                            disabled={readOnly}
                            onChange={(e) => {
                              touch();
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              setLines((ls) => ls.map((x, j) => (i === j ? { ...x, quantity: raw } : x)));
                            }}
                            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-foreground"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Prețul unitar ${i + 1}`}
                            inputMode="decimal"
                            value={l.unitPrice}
                            disabled={readOnly}
                            onChange={(e) => {
                              touch();
                              setLines((ls) =>
                                ls.map((x, j) => (i === j ? { ...x, unitPrice: e.target.value } : x))
                              );
                            }}
                            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-foreground"
                          />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-foreground">
                          {money(lineQty(l) * parseMoney(l.unitPrice))}
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            aria-label={`Șterge poziția ${i + 1}`}
                            disabled={readOnly}
                            onClick={() => {
                              touch();
                              setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));
                            }}
                            className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  touch();
                  setLines((ls) => [...ls, { ...EMPTY_LINE }]);
                }}
                className="touch-target mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adaugă poziție
              </button>
            </section>

            {doc && doc.audit.length > 0 && (
              <section aria-label="Jurnalul actului" className="rounded-lg border border-border p-4">
                <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <History className="h-4 w-4" aria-hidden="true" />
                  Jurnal
                </h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {doc.audit.map((a) => (
                    <li key={a.id}>
                      {AUDIT_LABELS[a.action] ?? a.action} ·{" "}
                      {new Date(a.createdAt).toLocaleString("ro-MD")}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {missing.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Mai lipsesc, pentru a putea finaliza:</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {missing.map((f) => (
                    <li key={f}>{fieldLabel(f)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se salvează…
                  </span>
                ) : savedAt ? (
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Ciornă salvată la {savedAt.toLocaleTimeString("ro-MD")}
                  </span>
                ) : (
                  "Ciorna se salvează singură."
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => void save()}
                  className="touch-target rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Salvează ciorna
                </button>
                {doc?.status === "final" && (
                  <button
                    type="button"
                    onClick={() => void toPar()}
                    className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Banknote className="h-4 w-4" aria-hidden="true" />
                    Transformă în cerere de plată
                  </button>
                )}
                <button
                  type="button"
                  disabled={readOnly || !docId}
                  onClick={() => void finalize()}
                  className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Finalizează
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </BusinessShell>
  );
}
