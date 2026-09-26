/**
 * CONTPLATA-faza-1 — editorul contului de plată, în CRM (`/business/crm/conturi-plata/nou|:id`).
 *
 * Tot ce a cerut owner-ul pe 26.09.2026, într-un singur ecran:
 *  - numărul se pune SINGUR (următorul din serie) și se poate schimba de mână doar dacă vrei;
 *  - previzualizarea e PDF-ul adevărat, încadrat din ruta lui (nu un `blob:`, pe care CSP-ul îl
 *    bloca — de aici „foaia tristă"), și se reîncarcă după fiecare salvare automată;
 *  - clientul se ia din CRM sau din registru, cu toate datele;
 *  - pozițiile vin din catalogul CRM (cu stoc) sau din conturile anterioare;
 *  - șabloane ca la PAR: pornești din unul, salvezi contul curent ca unul nou.
 *
 * Ciorna se salvează singură (după o pauză la tastare) de îndată ce are client + o poziție; nu
 * există „Salvează" de apăsat. Emiterea îngheață rechizitele și atribuie numărul.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Download,
  FileStack,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Checkbox, DateField, Dialog, Input, Label, Select, StatusBadge, Textarea } from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import { BuyerPicker, EMPTY_BUYER, type BuyerValue } from "@/components/payment-accounts/BuyerPicker";
import {
  LineItemsEditor,
  centsToPrice,
  lineTotalCents,
  newLine,
  parseQty,
  priceToCents,
  type LineDraft,
} from "@/components/payment-accounts/LineItemsEditor";
import {
  createPaymentAccount,
  deletePaymentAccount,
  duplicatePaymentAccount,
  getNextPaymentAccountNumber,
  getPaymentAccount,
  getPaymentAccountSettings,
  issuePaymentAccount,
  listPaymentAccountTemplates,
  paymentAccountErrorMessage,
  paymentAccountPdfUrl,
  savePaymentAccountTemplate,
  setPaymentAccountStatus,
  updatePaymentAccount,
  startFromPaymentAccountTemplate,
  type PaymentAccountDetail,
  type PaymentAccountInput,
  type PaymentAccountLang,
  type PaymentAccountSettingsView,
  type PaymentAccountTemplate,
} from "@/lib/api/paymentAccounts";

export const PAYMENT_ACCOUNTS_PATH = "/business/crm/conturi-plata";

const CURRENCIES = ["MDL", "EUR", "USD", "RON"] as const;
const LANGS: { value: PaymentAccountLang; label: string }[] = [
  { value: "ro", label: "Română" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

interface CrmPaymentAccountEditorPageProps {
  /** Lipsă = cont nou. */
  accountId?: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDay(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day || todayIso()}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d.toISOString());
}

function formatMoney(cents: number, currency: string): string {
  const v = Math.abs(Math.round(cents));
  const whole = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${cents < 0 ? "-" : ""}${whole},${String(v % 100).padStart(2, "0")} ${currency}`;
}

export function CrmPaymentAccountEditorPage({ accountId }: CrmPaymentAccountEditorPageProps) {
  const { navigate } = useRouter();

  const [id, setId] = useState<string | null>(accountId ?? null);
  const [account, setAccount] = useState<PaymentAccountDetail | null>(null);
  const [view, setView] = useState<PaymentAccountSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Formular ──
  const [buyer, setBuyer] = useState<BuyerValue>(EMPTY_BUYER);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [currency, setCurrency] = useState<string>("MDL");
  const [lang, setLang] = useState<PaymentAccountLang>("ro");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [templateId, setTemplateId] = useState<string | null>(null);

  // ── Număr ──
  const [autoNumber, setAutoNumber] = useState<string>("");
  const [manualMode, setManualMode] = useState(false);
  const [manualNumber, setManualNumber] = useState("");

  // ── Salvare / previzualizare ──
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const hydrated = useRef(false);
  const lastSavedKey = useRef<string>("");

  // ── Șabloane ──
  const [templates, setTemplates] = useState<PaymentAccountTemplate[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplWithBuyer, setTplWithBuyer] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const isDraft = !account || account.status === "draft";
  const settings = view?.settings;

  // ── Încărcare ──
  const hydrate = useCallback((a: PaymentAccountDetail) => {
    setAccount(a);
    setBuyer({
      buyerName: a.buyerName ?? "",
      buyerIdno: a.buyerIdno,
      buyerVatCode: a.buyerVatCode,
      buyerAddress: a.buyerAddress,
      buyerCity: a.buyerCity,
      buyerEmail: a.buyerEmail,
      buyerPhone: a.buyerPhone,
      buyerIban: a.buyerIban,
      buyerBankName: a.buyerBankName,
      buyerContact: a.buyerContact,
      crmCompanyId: a.crmCompanyId,
    });
    setLines(
      a.items.length
        ? a.items.map((it) => ({
            ...newLine(),
            description: it.description,
            unit: it.unit,
            quantity: String(Number(it.quantity)).replace(".", ","),
            price: centsToPrice(it.unitPriceCents),
            vatRate: it.vatRate,
            productId: it.productId ?? null,
          }))
        : [newLine()]
    );
    setCurrency(a.currency);
    setLang(a.lang ?? "ro");
    setIssueDate(isoDay(a.issueDate) || todayIso());
    setDueDate(isoDay(a.dueDate));
    setNotes(a.notes ?? "");
    setTemplateId(a.templateId);
    setPreviewVersion(a.updatedAt);
    setSavedAt(a.updatedAt);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [settingsRes, tplRes, accRes] = await Promise.all([
          getPaymentAccountSettings(),
          listPaymentAccountTemplates().catch(() => ({ data: [] as PaymentAccountTemplate[] })),
          accountId ? getPaymentAccount(accountId) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setView(settingsRes.data);
        setTemplates(tplRes.data);
        if (accRes) {
          hydrate(accRes.data);
        } else {
          const s = settingsRes.data.settings;
          setLang(s.defaultLang);
          setNotes(s.defaultNotes ?? "");
          setDueDate(s.defaultDueDays > 0 ? addDays(todayIso(), s.defaultDueDays) : "");
          setLines([newLine(s.defaultVatRate)]);
          // Cont nou fără șabloane: nu e ce alege — începe direct.
          if (tplRes.data.length > 0) setTemplatesOpen(true);
        }
        hydrated.current = true;
      } catch (e) {
        if (alive) setError(paymentAccountErrorMessage(e, "Contul de plată nu s-a putut încărca."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accountId, hydrate]);

  // ── Numărul automat (se recalculează când se schimbă anul datei) ──
  const year = issueDate.slice(0, 4);
  useEffect(() => {
    if (!isDraft || !view) return;
    getNextPaymentAccountNumber({ date: issueDate, exclude: id ?? undefined, series: account?.series })
      .then((r) => setAutoNumber(r.data.documentNumber))
      .catch(() => setAutoNumber(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, isDraft, view, id]);

  // ── Datele trimise la server ──
  const input = useMemo((): PaymentAccountInput | null => {
    const items = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        unit: l.unit.trim() || "buc",
        quantity: parseQty(l.quantity) || 1,
        unitPriceCents: priceToCents(l.price),
        vatRate: l.vatRate,
        productId: l.productId,
      }));
    if (!buyer.buyerName.trim() || items.length === 0) return null;
    return {
      ...buyer,
      buyerName: buyer.buyerName.trim(),
      templateId,
      currency,
      lang,
      issueDate: issueDate || null,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      items,
    };
  }, [buyer, lines, currency, lang, issueDate, dueDate, notes, templateId]);

  const inputKey = input ? JSON.stringify(input) : "";

  const save = useCallback(async (): Promise<string | null> => {
    if (!input) return id;
    if (inputKey === lastSavedKey.current && id) return id;
    setSaving(true);
    try {
      const res = id ? await updatePaymentAccount(id, input) : await createPaymentAccount(input);
      lastSavedKey.current = inputKey;
      if (!id) {
        setId(res.data.id);
        // Adresa devine cea a contului, fără a remonta pagina (și fără a pierde ce scrii acum).
        window.history.replaceState(null, "", `#${PAYMENT_ACCOUNTS_PATH}/${res.data.id}`);
      }
      setSavedAt(res.data.updatedAt);
      setPreviewVersion(res.data.updatedAt);
      setError(null);
      return res.data.id;
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Ciorna nu s-a putut salva."));
      return null;
    } finally {
      setSaving(false);
    }
  }, [id, input, inputKey]);

  // Salvare automată: după o pauză de tastare, doar pe ciornă și doar dacă e ceva de salvat.
  useEffect(() => {
    if (!hydrated.current || !isDraft || !inputKey || inputKey === lastSavedKey.current) return;
    const t = setTimeout(() => void save(), 900);
    return () => clearTimeout(t);
  }, [inputKey, isDraft, save]);

  // Cheia salvată la hidratare = ce e deja pe server; altfel prima randare ar re-salva degeaba.
  useEffect(() => {
    if (account && inputKey && !lastSavedKey.current) lastSavedKey.current = inputKey;
  }, [account, inputKey]);

  // ── Totaluri ──
  const totals = useMemo(() => {
    let net = 0;
    let vat = 0;
    for (const l of lines) {
      if (!l.description.trim()) continue;
      const n = Math.round(parseQty(l.quantity) * priceToCents(l.price));
      net += n;
      vat += Math.round((n * l.vatRate) / 100);
    }
    return { net, vat, total: net + vat };
  }, [lines]);
  const money = (c: number) => formatMoney(c, currency);

  // ── Acțiuni ──
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Operația nu a reușit."));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function reload(targetId: string) {
    const res = await getPaymentAccount(targetId);
    hydrate(res.data);
    lastSavedKey.current = "";
  }

  async function handleIssue() {
    if (!input || totals.total <= 0) {
      setError("Completează clientul și cel puțin o poziție cu preț înainte de emitere.");
      return;
    }
    await run("issue", async () => {
      const savedId = await save();
      if (!savedId) return;
      const number = manualMode && manualNumber.trim() ? manualNumber.trim() : null;
      await issuePaymentAccount(savedId, number);
      await reload(savedId);
      setManualMode(false);
      setNotice("Contul a fost emis. PDF-ul se descarcă.");
      window.location.assign(paymentAccountPdfUrl(savedId, { download: true }));
    });
  }

  async function handleStatus(status: "paid" | "cancelled") {
    if (!id) return;
    if (status === "cancelled" && !window.confirm("Anulezi contul de plată? Numărul rămâne în registru, marcat anulat.")) return;
    await run(status, async () => {
      await setPaymentAccountStatus(id, status);
      await reload(id);
    });
  }

  async function handleDuplicate() {
    if (!id) return;
    const res = await run("duplicate", () => duplicatePaymentAccount(id));
    if (res) navigate(`${PAYMENT_ACCOUNTS_PATH}/${res.data.id}`);
  }

  async function handleDeleteDraft() {
    if (!id || !window.confirm("Ștergi ciorna? Nu se poate reveni.")) return;
    const res = await run("delete", () => deletePaymentAccount(id));
    if (res) navigate(PAYMENT_ACCOUNTS_PATH);
  }

  async function handleUseTemplate(tpl: PaymentAccountTemplate) {
    setTemplatesOpen(false);
    const current = buyer.buyerName.trim() ? buyer : null;
    if (current || tpl.buyer?.buyerName) {
      // Clientul (din formular sau din șablon) există → ciorna se face pe server, cu numărul ei.
      const res = await run("template", () => startFromPaymentAccountTemplate(tpl.id, current ?? undefined));
      if (res) {
        setId(res.data.id);
        window.history.replaceState(null, "", `#${PAYMENT_ACCOUNTS_PATH}/${res.data.id}`);
        await reload(res.data.id);
      }
      return;
    }
    // Șablon fără client: completăm formularul, clientul îl alegi tu, ciorna se salvează singură.
    setTemplateId(tpl.id);
    setCurrency(tpl.currency);
    if (tpl.notes) setNotes(tpl.notes);
    if (tpl.dueDays != null) setDueDate(addDays(issueDate, tpl.dueDays));
    setLines(
      tpl.items.map((it) => ({
        ...newLine(),
        description: it.description,
        unit: it.unit,
        quantity: String(it.quantity).replace(".", ","),
        price: centsToPrice(it.unitPriceCents),
        vatRate: it.vatRate,
        productId: it.productId ?? null,
      }))
    );
  }

  async function handleSaveTemplate() {
    const savedId = await save();
    if (!savedId || !tplName.trim()) return;
    const res = await run("saveTpl", () => savePaymentAccountTemplate({ name: tplName.trim(), fromAccountId: savedId, includeBuyer: tplWithBuyer }));
    if (res) {
      setTemplates((t) => [res.data, ...t]);
      setSaveTplOpen(false);
      setNotice(`Șablonul „${res.data.name}” a fost salvat.`);
    }
  }

  // ── Randare ──
  const displayNumber = account?.documentNumber ?? (manualMode && manualNumber.trim() ? manualNumber.trim() : autoNumber);
  const pdfSrc = id ? paymentAccountPdfUrl(id, { v: previewVersion }) : "";
  const missing = view?.missing ?? [];

  if (loading) {
    return (
      <BusinessShell pageTitle="Cont de plată">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Se încarcă…
        </div>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell
      pageTitle={account?.documentNumber ? `Cont de plată ${account.documentNumber}` : "Cont de plată nou"}
      pageDescription={
        isDraft
          ? "Numărul se pune singur la emitere. Ciorna se salvează automat, iar PDF-ul din dreapta e exact ce primește clientul."
          : `Emis pe ${new Date(account!.issueDate).toLocaleDateString("ro-MD")} · ${buyer.buyerName}`
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && isDraft && (
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <FileStack className="h-4 w-4" aria-hidden="true" />
              Din șablon
            </Button>
          )}
          <Button variant="ghost" size="sm" href={`#${PAYMENT_ACCOUNTS_PATH}/setari`}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Aspect și numerotare
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        {/* ── Stânga: formularul ── */}
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
              {error}
            </Alert>
          )}
          {notice && (
            <Alert variant="success" icon={<CheckCircle2 className="h-4 w-4" />}>
              {notice}
            </Alert>
          )}
          {isDraft && missing.length > 0 && (
            <Alert variant="warning" icon={<AlertTriangle className="h-4 w-4" />} title="Lipsesc rechizitele tale">
              Contul iese fără: {missing.join(", ")}.{" "}
              <a className="font-medium underline" href={`#${PAYMENT_ACCOUNTS_PATH}/setari`}>
                Completează-le o dată
              </a>{" "}
              — apar apoi pe toate conturile.
            </Alert>
          )}

          {/* Document */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pa-doc-h">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="pa-doc-h" className="text-sm font-semibold text-foreground">
                Document
              </h2>
              {account && <StatusBadge status={account.status} label={account.status === "issued" ? "Emis" : account.status === "cancelled" ? "Anulat" : undefined} />}
            </div>

            <div>
              <Label htmlFor="pa-number">Număr</Label>
              {isDraft && manualMode ? (
                <div className="flex gap-2">
                  <Input
                    id="pa-number"
                    value={manualNumber}
                    placeholder={autoNumber}
                    onChange={(e) => setManualNumber(e.target.value)}
                    maxLength={40}
                  />
                  <Button type="button" variant="outline" onClick={() => { setManualMode(false); setManualNumber(""); }}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Automat
                  </Button>
                </div>
              ) : (
                <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3">
                  <span id="pa-number" className="font-mono text-sm font-semibold text-foreground">
                    {displayNumber || "—"}
                  </span>
                  {isDraft ? (
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">automat</Badge>
                      <Button type="button" variant="link" size="sm" onClick={() => { setManualMode(true); setManualNumber(autoNumber); }}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Schimbă
                      </Button>
                    </span>
                  ) : null}
                </div>
              )}
              {isDraft && manualMode && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Numărul scris de mână trebuie să fie unic. Dacă păstrezi forma seriei, următoarele conturi continuă de la el.
                </p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pa-issue">Data emiterii</Label>
                <DateField id="pa-issue" value={issueDate} disabled={!isDraft} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pa-due">Termen de plată</Label>
                <DateField id="pa-due" value={dueDate} disabled={!isDraft} onChange={(e) => setDueDate(e.target.value)} />
                {isDraft && (
                  <div className="mt-1 flex flex-wrap gap-1" aria-label="Termen rapid">
                    {[3, 5, 10, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDueDate(addDays(issueDate, n))}
                        className="min-h-[32px] rounded-full border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        +{n} zile
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="pa-currency">Valuta</Label>
                <Select id="pa-currency" value={currency} disabled={!isDraft} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="pa-lang">Limba documentului</Label>
                <Select id="pa-lang" value={lang} disabled={!isDraft} onChange={(e) => setLang(e.target.value as PaymentAccountLang)}>
                  {LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </section>

          {/* Client */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pa-buyer-h">
            <h2 id="pa-buyer-h" className="mb-4 text-sm font-semibold text-foreground">
              Client (cumpărător)
            </h2>
            <BuyerPicker value={buyer} onChange={setBuyer} disabled={!isDraft} />
          </section>

          {/* Poziții */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pa-lines-h">
            <h2 id="pa-lines-h" className="mb-4 text-sm font-semibold text-foreground">
              Produse și servicii
            </h2>
            <LineItemsEditor
              lines={lines}
              onChange={setLines}
              currency={currency}
              defaultVatRate={settings?.defaultVatRate ?? 0}
              disabled={!isDraft}
              formatMoney={money}
            />

            <dl className="mt-4 space-y-1 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              {totals.vat > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Total fără TVA</dt>
                    <dd className="text-foreground">{money(totals.net)}</dd>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <dt>TVA</dt>
                    <dd className="text-foreground">{money(totals.vat)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
                <dt>Total de plată</dt>
                <dd className="text-lg text-primary">{money(totals.total)}</dd>
              </div>
            </dl>
          </section>

          {/* Mențiuni */}
          <section className="rounded-lg border border-border bg-card p-5">
            <Label htmlFor="pa-notes">Mențiuni pe cont</Label>
            <Textarea
              id="pa-notes"
              rows={3}
              value={notes}
              disabled={!isDraft}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Vă rugăm să indicați numărul contului în destinația plății."
            />
          </section>

          {/* Acțiuni */}
          <section className="sticky bottom-0 z-10 -mx-1 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Se salvează ciorna…
                </>
              ) : isDraft && savedAt ? (
                <>
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Ciornă salvată automat la{" "}
                  {new Date(savedAt).toLocaleTimeString("ro-MD", { hour: "2-digit", minute: "2-digit" })}
                </>
              ) : isDraft ? (
                "Alege clientul și adaugă o poziție — ciorna se salvează singură."
              ) : null}
              {isDraft && input && totals.total <= 0 && <span className="text-warning">· Pune prețul ca să poți emite.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <>
                  <Button onClick={handleIssue} disabled={!input || totals.total <= 0 || busy !== null}>
                    {busy === "issue" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    Emite și descarcă PDF
                  </Button>
                  <Button variant="outline" onClick={() => { setTplName(buyer.buyerName ? `${buyer.buyerName} — ${lines[0]?.description ?? ""}`.slice(0, 120) : ""); setSaveTplOpen(true); }} disabled={!input || busy !== null}>
                    <FileStack className="h-4 w-4" aria-hidden="true" />
                    Salvează ca șablon
                  </Button>
                  {id && (
                    <Button variant="ghost" onClick={handleDeleteDraft} disabled={busy !== null}>
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      Șterge ciorna
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button href={id ? paymentAccountPdfUrl(id, { download: true }) : undefined}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Descarcă PDF
                  </Button>
                  {account?.status === "issued" && (
                    <Button variant="success" onClick={() => handleStatus("paid")} disabled={busy !== null}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Marchează plătit
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleDuplicate} disabled={busy !== null}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Duplică
                  </Button>
                  <Button variant="outline" onClick={() => { setTplName(buyer.buyerName); setSaveTplOpen(true); }} disabled={busy !== null}>
                    <FileStack className="h-4 w-4" aria-hidden="true" />
                    Salvează ca șablon
                  </Button>
                  {account?.status === "issued" && (
                    <Button variant="ghost" onClick={() => handleStatus("cancelled")} disabled={busy !== null}>
                      <Ban className="h-4 w-4 text-destructive" aria-hidden="true" />
                      Anulează
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        {/* ── Dreapta: PDF-ul adevărat ── */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold text-foreground">Previzualizare PDF</h2>
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se actualizează previzualizarea" />}
            </div>
            {pdfSrc ? (
              <iframe
                key={pdfSrc}
                src={pdfSrc}
                title="Previzualizarea contului de plată"
                className="h-[80vh] min-h-[560px] w-full rounded-md border border-border bg-background"
              />
            ) : (
              <div className="flex h-[60vh] min-h-[420px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
                <p>Alege clientul și adaugă o poziție — PDF-ul apare aici, exact cum îl primește clientul.</p>
                <a className="font-medium text-primary underline" href={`#${PAYMENT_ACCOUNTS_PATH}/setari`}>
                  Vezi o mostră și alege aspectul
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alegerea șablonului */}
      <Dialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="Pornește dintr-un șablon"
        description="Clientul și pozițiile se completează singure; numărul e unul nou."
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setTemplatesOpen(false)}>
            Începe de la zero
          </Button>
        }
      >
        <ul className="divide-y divide-border">
          {templates.map((t) => {
            const total = t.items.reduce(
              (s, it) => s + lineTotalCents({ ...newLine(), quantity: String(it.quantity), price: centsToPrice(it.unitPriceCents), vatRate: it.vatRate, description: it.description }),
              0
            );
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleUseTemplate(t)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.buyer?.buyerName ?? "fără client — îl alegi tu"} · {t.items.length} poziții
                      {t.useCount > 0 ? ` · folosit de ${t.useCount} ori` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(total, t.currency)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>

      {/* Salvarea ca șablon */}
      <Dialog
        open={saveTplOpen}
        onClose={() => setSaveTplOpen(false)}
        title="Salvează ca șablon"
        description="Data viitoare pornești din el cu un click, iar numărul se pune singur."
        footer={
          <>
            <Button variant="outline" onClick={() => setSaveTplOpen(false)}>
              Renunță
            </Button>
            <Button onClick={handleSaveTemplate} disabled={!tplName.trim() || busy === "saveTpl"}>
              {busy === "saveTpl" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Salvează șablonul
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="pa-tpl-name" required>
              Numele șablonului
            </Label>
            <Input id="pa-tpl-name" value={tplName} maxLength={200} onChange={(e) => setTplName(e.target.value)} placeholder="Ex.: Abonament lunar — VECTOR-AP" />
          </div>
          <Checkbox
            id="pa-tpl-buyer"
            checked={tplWithBuyer}
            onChange={setTplWithBuyer}
            label="Păstrează și clientul (debifează pentru un set de servicii trimis la clienți diferiți)"
          />
        </div>
      </Dialog>
    </BusinessShell>
  );
}

export default CrmPaymentAccountEditorPage;
