import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, ArrowLeft, Building2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import {
  getSellerProfile,
  saveSellerProfile,
  type SellerProfile,
} from "@/lib/api/paymentAccounts";

/**
 * CONT-PLATA: edit the issuer's own company ("beneficiar") + bank coordinates.
 * These values are snapshotted onto each payment account at creation time.
 */
export function SellerProfilePage() {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    idno: "",
    legalForm: "",
    vatCode: "",
    address: "",
    city: "",
    iban: "",
    bankName: "",
    bankCode: "",
    contactEmail: "",
    contactPhone: "",
    defaultSeries: "CP",
    defaultVatRate: "20",
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSellerProfile();
        if (data) {
          setForm({
            name: data.name ?? "",
            idno: data.idno ?? "",
            legalForm: data.legalForm ?? "",
            vatCode: data.vatCode ?? "",
            address: data.address ?? "",
            city: data.city ?? "",
            iban: data.iban ?? "",
            bankName: data.bankName ?? "",
            bankCode: data.bankCode ?? "",
            contactEmail: data.contactEmail ?? "",
            contactPhone: data.contactPhone ?? "",
            defaultSeries: data.defaultSeries ?? "CP",
            defaultVatRate: String(data.defaultVatRate ?? 20),
          });
        }
      } catch {
        setError("Profilul nu a putut fi încărcat.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    if (!form.name.trim()) {
      setError("Denumirea companiei este obligatorie.");
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<SellerProfile> & { name: string } = {
        name: form.name.trim(),
        idno: form.idno.trim() || null,
        legalForm: form.legalForm.trim() || null,
        vatCode: form.vatCode.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        iban: form.iban.trim() || null,
        bankName: form.bankName.trim() || null,
        bankCode: form.bankCode.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        defaultSeries: form.defaultSeries.trim() || "CP",
        defaultVatRate: parseInt(form.defaultVatRate, 10) || 20,
      };
      await saveSellerProfile(payload);
      setSaved(true);
    } catch {
      setError("Salvarea a eșuat. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      pageTitle="Profil emitent"
      pageDescription="Datele companiei tale (beneficiar) folosite pe conturile de plată"
      actions={
        <button
          onClick={() => navigate("/app/conturi-plata")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-4" /> Înapoi
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="size-4 text-muted-foreground" /> Identitate
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Denumire" value={form.name} onChange={(v) => set("name", v)} required />
              <Field label="IDNO" value={form.idno} onChange={(v) => set("idno", v)} />
              <Field
                label="Formă juridică"
                value={form.legalForm}
                onChange={(v) => set("legalForm", v)}
              />
              <Field label="Cod TVA" value={form.vatCode} onChange={(v) => set("vatCode", v)} />
              <Field label="Adresă" value={form.address} onChange={(v) => set("address", v)} />
              <Field label="Localitate" value={form.city} onChange={(v) => set("city", v)} />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Coordonate bancare</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="IBAN" value={form.iban} onChange={(v) => set("iban", v)} />
              <Field label="Banca" value={form.bankName} onChange={(v) => set("bankName", v)} />
              <Field
                label="Cod bancar / SWIFT"
                value={form.bankCode}
                onChange={(v) => set("bankCode", v)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Contact & document</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Email"
                value={form.contactEmail}
                onChange={(v) => set("contactEmail", v)}
              />
              <Field
                label="Telefon"
                value={form.contactPhone}
                onChange={(v) => set("contactPhone", v)}
              />
              <Field
                label="Serie implicită"
                value={form.defaultSeries}
                onChange={(v) => set("defaultSeries", v)}
              />
              <Field
                label="TVA implicit (%)"
                value={form.defaultVatRate}
                onChange={(v) => set("defaultVatRate", v)}
              />
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvează profilul
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" /> Salvat
              </span>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
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
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
