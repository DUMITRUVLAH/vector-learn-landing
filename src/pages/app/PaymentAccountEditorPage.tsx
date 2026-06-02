import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { CompanySearchInput } from "@/components/payment-accounts/CompanySearchInput";
import {
  createPaymentAccount,
  updatePaymentAccount,
  getPaymentAccount,
  formatMdl,
  type PaymentAccountInput,
  type RegistryCompanyDetail,
} from "@/lib/api/paymentAccounts";

interface EditorLine {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string; // MDL, decimal string
  vatRate: string;
}

interface PaymentAccountEditorPageProps {
  accountId?: string;
}

const emptyLine = (): EditorLine => ({
  description: "",
  unit: "buc",
  quantity: "1",
  unitPrice: "0",
  vatRate: "20",
});

function toCents(mdl: string): number {
  const n = parseFloat(mdl.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function PaymentAccountEditorPage({ accountId }: PaymentAccountEditorPageProps) {
  const { navigate } = useRouter();
  const isEdit = !!accountId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buyerName, setBuyerName] = useState("");
  const [buyerIdno, setBuyerIdno] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerCity, setBuyerCity] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([emptyLine()]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    (async () => {
      try {
        const { data } = await getPaymentAccount(accountId);
        if (!active) return;
        if (data.status !== "draft") {
          // Issued docs are immutable → send the user to the view.
          navigate(`/app/conturi-plata/${accountId}`);
          return;
        }
        setBuyerName(data.buyerName);
        setBuyerIdno(data.buyerIdno ?? "");
        setBuyerAddress(data.buyerAddress ?? "");
        setBuyerCity(data.buyerCity ?? "");
        setDueDate(data.dueDate ? data.dueDate.slice(0, 10) : "");
        setNotes(data.notes ?? "");
        setLines(
          data.items.length
            ? data.items.map((it) => ({
                description: it.description,
                unit: it.unit,
                quantity: String(it.quantity),
                unitPrice: (it.unitPriceCents / 100).toFixed(2),
                vatRate: String(it.vatRate),
              }))
            : [emptyLine()]
        );
      } catch {
        if (active) setError("Contul de plată nu a putut fi încărcat.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountId, navigate]);

  function applyCompany(c: RegistryCompanyDetail) {
    setBuyerName(c.name);
    setBuyerIdno(c.idno ?? "");
    setBuyerAddress(c.address ?? "");
    setBuyerCity(c.city ?? "");
  }

  function updateLine(idx: number, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => {
        const qty = parseFloat(l.quantity.replace(",", ".")) || 0;
        const unit = toCents(l.unitPrice);
        const rate = parseInt(l.vatRate, 10) || 0;
        const sub = Math.round(qty * unit);
        const vat = Math.round((sub * rate) / 100);
        acc.subtotal += sub;
        acc.vat += vat;
        acc.total += sub + vat;
        return acc;
      },
      { subtotal: 0, vat: 0, total: 0 }
    );
  }, [lines]);

  async function handleSave(thenIssue: boolean) {
    setError(null);
    if (!buyerName.trim()) {
      setError("Selectează sau introdu plătitorul.");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      setError("Adaugă cel puțin o linie cu descriere.");
      return;
    }
    const payload: PaymentAccountInput = {
      buyerName: buyerName.trim(),
      buyerIdno: buyerIdno.trim() || null,
      buyerAddress: buyerAddress.trim() || null,
      buyerCity: buyerCity.trim() || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      notes: notes.trim() || null,
      items: validLines.map((l) => ({
        description: l.description.trim(),
        unit: l.unit.trim() || "buc",
        quantity: parseFloat(l.quantity.replace(",", ".")) || 1,
        unitPriceCents: toCents(l.unitPrice),
        vatRate: parseInt(l.vatRate, 10) || 0,
      })),
    };

    setSaving(true);
    try {
      const { data } = accountId
        ? await updatePaymentAccount(accountId, payload)
        : await createPaymentAccount(payload);
      // After save, go to the document view (which offers the "Emite" action),
      // or to the editor's saved state. `thenIssue` jumps straight to view+issue.
      navigate(`/app/conturi-plata/${data.id}${thenIssue ? "?issue=1" : ""}`);
    } catch {
      setError("Salvarea a eșuat. Verifică datele și încearcă din nou.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell pageTitle="Cont de plată" pageDescription="Se încarcă…">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle={isEdit ? "Editează contul de plată" : "Cont de plată nou"}
      pageDescription="Caută plătitorul în registru și completează liniile"
      actions={
        <button
          onClick={() => navigate("/app/conturi-plata")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-4" /> Înapoi
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Buyer */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Plătitor (client)</h2>
            <CompanySearchInput onSelect={applyCompany} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Denumire" value={buyerName} onChange={setBuyerName} required />
              <Field label="IDNO" value={buyerIdno} onChange={setBuyerIdno} />
              <Field label="Adresă" value={buyerAddress} onChange={setBuyerAddress} />
              <Field label="Localitate" value={buyerCity} onChange={setBuyerCity} />
            </div>
          </section>

          {/* Lines */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Linii</h2>
              <button
                onClick={() => setLines((p) => [...p, emptyLine()])}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70"
              >
                <Plus className="size-3.5" /> Adaugă linie
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border/60 p-3"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <Label>Descriere</Label>
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      placeholder="Serviciu / produs"
                      aria-label={`Descriere linia ${idx + 1}`}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label>Cant.</Label>
                    <input
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      aria-label={`Cantitate linia ${idx + 1}`}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <Label>U.M.</Label>
                    <input
                      value={l.unit}
                      onChange={(e) => updateLine(idx, { unit: e.target.value })}
                      aria-label={`Unitate linia ${idx + 1}`}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label>Preț (MDL)</Label>
                    <input
                      inputMode="decimal"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                      aria-label={`Preț unitar linia ${idx + 1}`}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-8 sm:col-span-1">
                    <Label>TVA %</Label>
                    <input
                      inputMode="numeric"
                      value={l.vatRate}
                      onChange={(e) => updateLine(idx, { vatRate: e.target.value })}
                      aria-label={`Cotă TVA linia ${idx + 1}`}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-4 flex justify-end sm:col-span-1">
                    <button
                      onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1}
                      aria-label={`Șterge linia ${idx + 1}`}
                      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar: totals + meta */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Total</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMdl(totals.subtotal)} />
              <Row label="TVA" value={formatMdl(totals.vat)} />
              <div className="my-2 border-t border-border" />
              <Row label="Total de plată" value={formatMdl(totals.total)} strong />
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Detalii document</h2>
            <Label>Scadență</Label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Data scadenței"
              className={inputCls}
            />
            <div className="mt-3">
              <Label>Notițe</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                aria-label="Notițe"
                className={inputCls + " resize-none"}
              />
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvează ciorna
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Small presentational helpers ──

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted-foreground">{children}</span>;
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "text-base font-bold tabular-nums text-foreground"
            : "font-medium tabular-nums text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
