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
  ShieldCheck,
  ShieldAlert,
  Mail,
  FileType,
  Eye,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  createDocument,
  getDocument,
  updateDocument,
  finalizeDocument,
  convertDocumentToPar,
  emailDocument,
  wordExportUrl,
  getDocumentTrail,
  listDerivableKinds,
  deriveDocument,
  listDocTemplates,
  searchParties,
  importPartiesFromPar as importPartiesApi,
  type DocParty,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type DocDetail,
  type DocTemplateListItem,
  type DocTrail,
} from "@/lib/api/docs";
import { listProjects, createVendor, type ParProject } from "@/lib/api/par";
import { fieldLabel } from "@/lib/docs/fieldCatalog";
import { parseMoneyRo, formatMoneyRo } from "@/lib/docs/money";
import { downloadDocumentPdf, ensureStoredPdf, fetchPrintable } from "@/lib/docs/documentPdfClient";
import { DocPreviewDialog } from "./DocPreviewDialog";
import { BlanksConfirmDialog } from "./BlanksConfirmDialog";
import { docPath, docsListPath, documentIdFromPath } from "@/lib/docs/paths";

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

const money = formatMoneyRo;

const parseMoney = parseMoneyRo;

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
  // Citirea id-ului stă în `@/lib/docs/paths`, comună cu ruta veche și cu testele: un prefix
  // scris de mână aici s-ar rupe tăcut la următoarea mutare a modulului.
  const docId = useMemo(() => documentIdFromPath(path), [path]);

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [templates, setTemplates] = useState<DocTemplateListItem[]>([]);
  /** Actul nou pornește cu șablonul tipului său: „Fără șablon" scotea acte fără corp. */
  const templateChosenByUser = useRef(false);
  const [projects, setProjects] = useState<ParProject[]>([]);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("act_primire_predare");
  const [templateId, setTemplateId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  /** Câmpurile furnizorului, mereu vizibile: se completează din căutare SAU se scriu direct. */
  const [party, setParty] = useState({
    name: "",
    idno: "",
    iban: "",
    bank: "",
    address: "",
    administrator: "",
  });
  const [saveToRegistry, setSaveToRegistry] = useState(true);
  const [parties, setParties] = useState<DocParty[]>([]);
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  /**
   * DC-103: ce anume întrebăm înainte de hârtie. `finalize` vine cu rechizitele lipsă semnalate de
   * server; `pdf`/`word` vin cu rândurile care ies goale, ca omul să nu descopere golurile abia în
   * fișierul trimis contrapărții.
   */
  const [blanksPrompt, setBlanksPrompt] = useState<
    { kind: "finalize" | "pdf" | "word"; fields: string[] } | null
  >(null);
  const [trail, setTrail] = useState<DocTrail | null>(null);
  const [derivableKinds, setDerivableKinds] = useState<string[]>([]);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
        const [tpls, prj] = await Promise.all([
          listDocTemplates().catch(() => []),
          listProjects().then((r) => r.items).catch(() => []),
        ]);
        if (cancelled) return;
        setTemplates(tpls);
        setProjects(prj);
        if (!docId && !templateChosenByUser.current) {
          const forKind = tpls.find((t) => t.kind === "act_primire_predare");
          if (forKind) setTemplateId(forKind.id);
        }

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
          const snap = (d.counterpartySnapshot ?? {}) as Record<string, string>;
          setParty({
            name: d.counterpartyName ?? "",
            idno: snap.idno ?? "",
            iban: snap.iban ?? "",
            bank: snap.banca ?? "",
            address: snap.adresa ?? "",
            administrator: snap.administrator ?? "",
          });
          // Rămâne pornită dacă actul are date de furnizor scrise de mână, dar nicio fișă în
          // registru — altfel furnizorul s-ar pierde din nou la actul următor.
          setSaveToRegistry(!d.counterpartyId && !!d.counterpartyName);
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

  // Căutarea merge la server: acolo se unesc registrul și beneficiarii scriși pe cereri de plată.
  useEffect(() => {
    const q = vendorQuery.trim();
    if (q.length < 2) {
      setParties([]);
      return;
    }
    const t = setTimeout(() => {
      void searchParties(q)
        .then((r) => setParties(r.items))
        .catch(() => setParties([]));
    }, 250);
    return () => clearTimeout(t);
  }, [vendorQuery]);

  const pickParty = useCallback((p: DocParty) => {
    dirty.current = true;
    setVendorId(p.id ?? "");
    setParty({
      name: p.name,
      idno: p.idno ?? "",
      iban: p.iban ?? "",
      bank: p.bank ?? "",
      address: p.address ?? "",
      administrator: p.administrator ?? "",
    });
    // Cine vine din registru e deja salvat; cine vine dintr-o cerere merită salvat acum.
    setSaveToRegistry(p.source === "par");
    setVendorQuery("");
    setParties([]);
  }, []);

  const payload = useCallback(
    () => ({
      templateId: templateId || null,
      kind,
      title: title.trim() || "Act fără titlu",
      projectId: projectId || null,
      counterparty: vendorId
        ? { kind: "vendor" as const, id: vendorId }
        : {
            kind: "inline" as const,
            name: party.name.trim() || null,
            snapshot: {
              idno: party.idno.trim(),
              iban: party.iban.replace(/\s/g, "").toUpperCase(),
              banca: party.bank.trim(),
              adresa: party.address.trim(),
              administrator: party.administrator.trim(),
            },
          },
      // Câmpurile scrise de mână intră și în contextul actului, ca șablonul să le poată tipări.
      context: vendorId
        ? undefined
        : {
            "contraparte.denumire": party.name.trim(),
            "contraparte.idno": party.idno.trim(),
            "contraparte.iban": party.iban.replace(/\s/g, "").toUpperCase(),
            "contraparte.banca": party.bank.trim(),
            "contraparte.adresa": party.address.trim(),
            "contraparte.administrator": party.administrator.trim(),
          },
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          unit: l.unit,
          quantity: lineQty(l),
          unitPriceCents: parseMoney(l.unitPrice),
        })),
    }),
    [templateId, kind, title, projectId, vendorId, party, lines]
  );

  const save = useCallback(async () => {
    if (doc?.status && doc.status !== "draft") return;
    setSaving(true);
    setError(null);
    try {
      // Furnizorul nou intră în registru la prima salvare, dacă omul a lăsat bifa — ca data
      // viitoare să nu-l mai scrie nimeni.
      if (!vendorId && saveToRegistry && party.name.trim()) {
        try {
          const created = await createVendor({
            name: party.name.trim(),
            idnp: party.idno.trim() || null,
            iban: party.iban.replace(/\s/g, "").toUpperCase() || null,
            bank: party.bank.trim() || null,
            legal_address: party.address.trim() || null,
            administrator_name: party.administrator.trim() || null,
          });
          setVendorId(created.id);
          setSaveToRegistry(false);
        } catch {
          // Salvarea în registru e un bonus: actul se face și fără ea.
        }
      }
      if (docId) {
        const updated = await updateDocument(docId, payload());
        setMissing(updated.missing ?? []);
      } else {
        const created = await createDocument(payload());
        setMissing((created as DocDetail).missing ?? []);
        navigate(docPath(created.id));
      }
      setSavedAt(new Date());
      dirty.current = false;
    } catch {
      setError("Ciorna nu a putut fi salvată.");
    } finally {
      setSaving(false);
    }
  }, [doc?.status, docId, payload, navigate, vendorId, saveToRegistry, party]);

  // Auto-save: ciorna nu se pierde pentru că a sunat telefonul.
  useEffect(() => {
    if (loading || !dirty.current) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [title, kind, templateId, vendorId, projectId, lines, loading, save]);

  const touch = useCallback(() => {
    dirty.current = true;
  }, []);

  const finalize = useCallback(async (confirm = false) => {
    if (!docId) return;
    setError(null);
    try {
      if (dirty.current) await save();
      await finalizeDocument(docId, confirm);
      // Recitim actul: răspunsul de la finalizare e rândul brut, fără jurnal și fără poziții, iar
      // ecranul le folosește. Un obiect „aproape complet" pus în stare a albit pagina.
      const finalized = await getDocument(docId);
      setDoc(finalized);
      // Rămânem pe act, nu fugim în listă: abia acum apar numărul, PDF-ul, trimiterea și
      // transformarea în cerere de plată — adică lucrurile pentru care omul a apăsat butonul.
      setEmailNotice(
        finalized.docNumber
          ? `Act finalizat: ${finalized.docNumber}. Poți descărca PDF-ul sau face cererea de plată.`
          : "Act finalizat."
      );
    } catch (e) {
      const body = (e as {
        body?: { error?: string; missing?: string[]; warnings?: string[]; message?: string };
      }).body;
      // Rechizite lipsă: nu e un refuz, e o întrebare (DC-103). Zidul rămâne doar pentru ce face
      // actul să nu fie act — titlu, poziții, sumă.
      if (body?.error === "needs_confirmation" && body.warnings?.length) {
        setMissing(body.warnings);
        setBlanksPrompt({ kind: "finalize", fields: body.warnings });
      } else if (body?.missing?.length) {
        setMissing(body.missing);
        setError(`Nu pot finaliza — lipsește: ${body.missing.join(", ")}.`);
      } else {
        setError(body?.message ?? "Actul nu a putut fi finalizat.");
      }
    }
  }, [docId, save]);

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
        navigate(docPath(created.id));
      } catch {
        setError("Actul derivat nu a putut fi creat.");
      }
    },
    [docId, navigate]
  );

  /**
   * Trimiterea către contraparte. Răspunsul poate fi „nu am trimis" fără să fie eroare (mediul
   * blochează e-mailurile reale) — atunci spunem exact asta, nu „a eșuat".
   */
  const sendEmail = useCallback(async () => {
    if (!docId) return;
    const to = window.prompt("Către ce adresă trimitem actul?", doc?.counterpartyName ? "" : "");
    if (!to) return;
    setError(null);
    setEmailNotice("Pregătesc actul și îl trimit…");
    try {
      // Întâi ne asigurăm că PDF-ul există (se randează în browser), abia apoi trimitem: altfel
      // e-mailul ar pleca fără actul pe care îl promite în text.
      await ensureStoredPdf(docId).catch(() => false);
      const res = await emailDocument(docId, to.trim());
      setEmailNotice(res.sent ? `Actul a plecat către ${res.to}.` : res.message);
      if (docId) setDoc(await getDocument(docId));
    } catch (e) {
      const body = (e as { body?: { message?: string } }).body;
      setError(body?.message ?? "Actul nu a putut fi trimis.");
    }
  }, [docId, doc?.counterpartyName]);

  /**
   * „Previzualizează" — aceeași foaie din care se face PDF-ul, deschisă pe loc.
   *
   * Ciorna nesalvată se salvează întâi: serverul compune HTML-ul din actul din bază, deci fără
   * pasul ăsta previzualizarea ar arăta varianta de acum două minute — exact genul de minciună
   * care face oamenii să nu mai aibă încredere în buton.
   */
  const openPreview = useCallback(async () => {
    if (!docId) return;
    setPreviewOpen(true);
    setPreviewHtml(null);
    setPreviewLoading(true);
    setError(null);
    try {
      if (dirty.current && (!doc || doc.status === "draft")) await save();
      const printable = await fetchPrintable(docId);
      setPreviewHtml(printable.html);
    } catch {
      setPreviewOpen(false);
      setError("Previzualizarea nu a putut fi generată. Reîncearcă sau descarcă PDF-ul.");
    } finally {
      setPreviewLoading(false);
    }
  }, [docId, doc, save]);

  /** PDF-ul se scrie pe server (DC-102) și se salvează de aici ca fișier. */
  const downloadPdf = useCallback(async () => {
    if (!docId) return;
    setPdfBusy(true);
    setError(null);
    try {
      await downloadDocumentPdf(docId);
    } catch {
      setError("PDF-ul nu a putut fi generat. Reîncearcă sau folosește exportul pentru Word.");
    } finally {
      setPdfBusy(false);
    }
  }, [docId]);

  /** Rândurile care ies goale pe hârtie — lista din fișa actului, calculată de server. */
  const blanks = doc?.unresolved ?? [];

  /** Orice ieșire pe hârtie trece pe aici: dacă sunt goluri, se întreabă o dată, apoi se execută. */
  const exportWithConfirm = useCallback(
    (kind: "pdf" | "word") => {
      if (blanks.length > 0) {
        setBlanksPrompt({ kind, fields: blanks });
        return;
      }
      if (kind === "pdf") void downloadPdf();
      else if (docId) window.location.href = wordExportUrl(docId);
    },
    [blanks, downloadPdf, docId]
  );

  const importPartiesFromPar = useCallback(async () => {
    try {
      const res = await importPartiesApi();
      setEmailNotice(
        res.imported > 0
          ? `Am adus în registru ${res.imported} beneficiari din cererile de plată.`
          : "Registrul era deja la zi — n-am găsit beneficiari noi în cereri."
      );
    } catch {
      setError("Nu am putut aduce beneficiarii din cereri.");
    }
  }, []);


  const readOnly = !!doc && doc.status !== "draft";

  return (
    <BusinessShell
      pageTitle={docId ? "Act" : "Act nou"}
      pageDescription={
        doc?.status === "final"
          ? "Act finalizat și sigilat — conținutul nu se mai schimbă."
          : doc?.status === "cancelled"
            ? "Act anulat — rămâne în registru ca urmă."
            : "Alege furnizorul — rechizitele vin din registru. Completează doar ce e specific actului."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {docId && (
            <button
              type="button"
              onClick={() => void openPreview()}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Previzualizează
            </button>
          )}
          {docId && (
            <button
              type="button"
              onClick={() => exportWithConfirm("word")}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <FileType className="h-4 w-4" aria-hidden="true" />
              Descarcă pentru Word
            </button>
          )}
          {docId && doc?.status === "final" && (
            <button
              type="button"
              onClick={() => void sendEmail()}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Trimite pe email
            </button>
          )}
          {docId && (
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => exportWithConfirm("pdf")}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              {pdfBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              Descarcă PDF
            </button>
          )}
        <button
          type="button"
          onClick={() => navigate(docsListPath())}
          className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi la acte
        </button>
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-6">
        {emailNotice && (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {emailNotice}
          </p>
        )}

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
                    const nextKind = e.target.value;
                    setKind(nextKind);
                    // Schimbi tipul → primești șablonul lui, dacă nu l-ai ales tu pe altul.
                    if (!templateChosenByUser.current) {
                      const forKind = templates.find((t) => t.kind === nextKind);
                      setTemplateId(forKind?.id ?? "");
                    }
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
                    templateChosenByUser.current = true;
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
                      <a href={`#${docPath(d.id)}`} className="text-primary hover:underline">
                        {d.docNumber ?? d.title}
                      </a>
                      <span className="text-muted-foreground"> · {DOC_STATUS_LABELS[d.status] ?? d.status}</span>
                    </li>
                  ))}
                  {(trail.derived ?? []).map((d) => (
                    <li key={d.id}>
                      <span className="text-muted-foreground">A născut: </span>
                      <a href={`#${docPath(d.id)}`} className="text-primary hover:underline">
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

            {/*
              Furnizorul, la vedere.

              Înainte era un singur câmp de căutare: tastai, apărea o listă, alegeai — iar dacă
              furnizorul nu exista, trebuia să ghicești că butonul de adăugare apare abia după 2
              litere. Owner-ul a spus-o direct: „să fie obvious, nu să apeși contraparte, să cauți
              și după să apară să adaugi info". Acum câmpurile sunt vizibile de la început, iar
              căutarea doar le COMPLETEAZĂ — inclusiv din beneficiarii care trăiesc doar pe cereri
              de plată, nu în registru.
            */}
            <section className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-foreground">Furnizorul / beneficiarul</h2>
                <span className="text-xs text-muted-foreground">
                  Rechizitele apar automat dacă îl alegi din listă; altfel le scrii aici.
                </span>
              </div>

              <label htmlFor="doc-vendor" className="mt-3 block text-sm font-medium text-foreground">
                Caută în registru și în cererile de plată
              </label>
              <input
                id="doc-vendor"
                value={vendorQuery}
                disabled={readOnly}
                onChange={(e) => {
                  touch();
                  setVendorQuery(e.target.value);
                }}
                placeholder="Denumire, cod fiscal sau IBAN…"
                className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />

              {!readOnly && vendorQuery.trim().length >= 2 && (
                <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {parties.map((p) => (
                    <li key={`${p.source}-${p.id ?? p.name}`}>
                      <button
                        type="button"
                        onClick={() => pickParty(p)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/40"
                      >
                        <span className="text-foreground">
                          {p.name}
                          {p.source === "par" && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              din cereri de plată
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.idno ?? p.iban ?? "fără cod"}
                        </span>
                      </button>
                    </li>
                  ))}
                  {parties.length === 0 && (
                    <li className="p-3 text-sm text-muted-foreground">
                      Nu l-am găsit nicăieri — completează câmpurile de mai jos și îl salvăm noi.
                    </li>
                  )}
                </ul>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="party-name" className="block text-sm font-medium text-foreground">
                    Denumirea furnizorului <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="party-name"
                    value={party.name}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, name: e.target.value }));
                      setVendorId("");
                    }}
                    placeholder='SRL "Tehnica Nouă"'
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="party-idno" className="block text-sm font-medium text-foreground">
                    Cod fiscal (IDNO/IDNP)
                  </label>
                  <input
                    id="party-idno"
                    value={party.idno}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, idno: e.target.value }));
                      setVendorId("");
                    }}
                    placeholder="1234567890123"
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="party-iban" className="block text-sm font-medium text-foreground">
                    IBAN
                  </label>
                  <input
                    id="party-iban"
                    value={party.iban}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, iban: e.target.value }));
                      setVendorId("");
                    }}
                    placeholder="MD48ML000002259A19498121"
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="party-bank" className="block text-sm font-medium text-foreground">
                    Banca
                  </label>
                  <input
                    id="party-bank"
                    value={party.bank}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, bank: e.target.value }));
                      setVendorId("");
                    }}
                    placeholder="BC Moldindconbank SA"
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="party-address" className="block text-sm font-medium text-foreground">
                    Adresa juridică
                  </label>
                  <input
                    id="party-address"
                    value={party.address}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, address: e.target.value }));
                    }}
                    placeholder="mun. Chișinău, bd. Dacia 45"
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="party-admin" className="block text-sm font-medium text-foreground">
                    Administrator
                  </label>
                  <input
                    id="party-admin"
                    value={party.administrator}
                    disabled={readOnly}
                    onChange={(e) => {
                      touch();
                      setParty((x) => ({ ...x, administrator: e.target.value }));
                    }}
                    placeholder="Andrei Rusu"
                    className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>

              {!readOnly && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveToRegistry}
                      onChange={(e) => setSaveToRegistry(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Salvează furnizorul în registru (se completează singur data viitoare)
                  </label>
                  <button
                    type="button"
                    onClick={() => void importPartiesFromPar()}
                    className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Adu în registru toți beneficiarii din cererile de plată
                  </button>
                </div>
              )}
            </section>

            {/* Pozițiile actului: totalul se calculează pe server, aici doar se vede. */}
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

            {doc?.integrity?.sealed && (
              <div
                role={doc.integrity.valid ? undefined : "alert"}
                className={
                  doc.integrity.valid
                    ? "flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                    : "flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                }
              >
                {doc.integrity.valid ? (
                  <>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Act sigilat — conținutul e neschimbat de la finalizare. Amprentă:{" "}
                    <span className="font-mono">{doc.integrity.hash?.slice(0, 16)}…</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Atenție: conținutul actului nu mai corespunde amprentei de la finalizare.
                    Verifică-l înainte să-l folosești.
                  </>
                )}
              </div>
            )}

            {doc && (doc.audit?.length ?? 0) > 0 && (
              <section aria-label="Jurnalul actului" className="rounded-lg border border-border p-4">
                <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <History className="h-4 w-4" aria-hidden="true" />
                  Jurnal
                </h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {(doc.audit ?? []).map((a) => (
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
                ) : readOnly ? (
                  "Act finalizat — se poate descărca, trimite sau transforma în cerere de plată."
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

      {blanksPrompt && (
        <BlanksConfirmDialog
          title={
            blanksPrompt.kind === "finalize"
              ? "Finalizezi actul fără toate rechizitele?"
              : "Scoți actul cu rânduri necompletate?"
          }
          intro={
            blanksPrompt.kind === "finalize"
              ? "Actul se poate semna așa, dar aceste date lipsesc din registru:"
              : "Documentul se descarcă imediat, însă aceste câmpuri vor ieși goale:"
          }
          fields={blanksPrompt.fields}
          confirmLabel={
            blanksPrompt.kind === "finalize"
              ? "Finalizează oricum"
              : blanksPrompt.kind === "word"
                ? "Descarcă oricum"
                : "Descarcă PDF oricum"
          }
          onCancel={() => setBlanksPrompt(null)}
          onConfirm={() => {
            const { kind } = blanksPrompt;
            setBlanksPrompt(null);
            if (kind === "finalize") void finalize(true);
            else if (kind === "pdf") void downloadPdf();
            else if (docId) window.location.href = wordExportUrl(docId);
          }}
        />
      )}

      <DocPreviewDialog
        open={previewOpen}
        html={previewHtml}
        loading={previewLoading}
        downloading={pdfBusy}
        onDownloadPdf={() => exportWithConfirm("pdf")}
        onClose={() => setPreviewOpen(false)}
      />
    </BusinessShell>
  );
}
