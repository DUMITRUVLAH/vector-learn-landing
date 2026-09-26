/**
 * CONTPLATA-faza-1 — cum arată și cum se numerotează contul de plată
 * (`<baza>/setari`, vezi lib/paymentAccounts/routes.ts).
 *
 * Owner-ul: „nu-l putem personaliza cu logo, cu rechizitele noastre, culorile". Aici se fac toate,
 * o singură dată, cu mostra PDF alături — ce vezi în dreapta e exact ce pleacă la client.
 *
 * Rechizitele NU au un formular nou: sunt „Datele firmei" din CRM (aceeași fișă ca la oferte și
 * contracte), editate prin API-ul ei. Scrise aici, apar și pe oferte; scrise acolo, apar și aici.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Input, Label, Select, Switch, Textarea } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  getCrmCompanyProfile,
  saveCrmCompanyProfile,
  type CrmCompanyProfile,
} from "@/lib/api/crmCompanyProfile";
import {
  getPaymentAccountSettings,
  paymentAccountErrorMessage,
  paymentAccountSampleUrl,
  removePaymentAccountLogo,
  savePaymentAccountSettings,
  uploadPaymentAccountLogo,
  type PaymentAccountLayout,
  type PaymentAccountSettings,
  type PaymentAccountSettingsView,
} from "@/lib/api/paymentAccounts";
import { DOCUMENT_ACCENT_PRESETS, isHexColor } from "@/lib/paymentAccounts/documentColors";
import { paymentAccountsBase } from "@/lib/paymentAccounts/routes";
import { useRouter } from "@/router/HashRouter";
import { InvoicingTabs } from "@/components/fin/ModuleTabs";

const LAYOUTS: { value: PaymentAccountLayout; title: string; hint: string }[] = [
  { value: "modern", title: "Modern", hint: "Bandă colorată, carduri pentru părți, total evidențiat." },
  { value: "clasic", title: "Clasic", hint: "Formal, tabel cu chenar — ca un act tipărit tradițional." },
  { value: "compact", title: "Compact", hint: "Totul strâns — încap multe poziții pe o pagină." },
];

const PROFILE_FIELDS: { key: keyof CrmCompanyProfile; label: string; span?: boolean; required?: boolean }[] = [
  { key: "legalName", label: "Denumirea juridică", span: true, required: true },
  { key: "idno", label: "IDNO" },
  { key: "vatNumber", label: "Cod TVA" },
  { key: "address", label: "Adresa juridică", span: true },
  { key: "iban", label: "IBAN" },
  { key: "bankName", label: "Banca" },
  { key: "bic", label: "Cod bancă (BIC/SWIFT)" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "Email" },
  { key: "administratorName", label: "Administrator (semnează)" },
  { key: "administratorTitle", label: "Funcția (ex.: Director)" },
];

interface IntFieldProps {
  id: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}

/**
 * Câmp numeric care se poate goli în timp ce scrii: altfel „șterge și tastează 279" sărea la
 * 1 la ștergere și dădea 1279 (bug prins de test). Valoarea validă se trimite pe loc; golul
 * rămâne doar în câmp și revine la ultima valoare bună când ieși din el.
 */
function IntField({ id, value, min, max, onCommit }: IntFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      id={id}
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        setText(raw);
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

function formatExample(s: PaymentAccountSettings, n: number): string {
  const pattern = s.numberPattern.includes("{nr}") ? s.numberPattern : `${s.numberPattern}-{nr}`;
  return pattern
    .split("{serie}").join(s.series || "CP")
    .split("{an}").join(String(new Date().getFullYear()))
    .split("{nr}").join(String(n).padStart(Math.min(10, Math.max(1, s.numberPad || 1)), "0"));
}

export function CrmPaymentAccountSettingsPage() {
  const { path } = useRouter();
  const base = paymentAccountsBase(path);
  const [view, setView] = useState<PaymentAccountSettingsView | null>(null);
  const [draft, setDraft] = useState<PaymentAccountSettings | null>(null);
  const [profile, setProfile] = useState<CrmCompanyProfile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileLocked, setProfileLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sampleV, setSampleV] = useState(() => String(Date.now()));
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        getPaymentAccountSettings(),
        getCrmCompanyProfile().catch(() => null),
      ]);
      setView(s.data);
      setDraft(s.data.settings);
      if (p) setProfile(p.profile);
      else setProfileLocked(true);
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Setările nu s-au putut încărca."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (p: Partial<PaymentAccountSettings>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setSaved(false);
  };

  const settingsDirty = !!draft && !!view && JSON.stringify(draft) !== JSON.stringify(view.settings);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      if (profile && profileDirty) {
        await saveCrmCompanyProfile(profile);
        setProfileDirty(false);
      }
      const { logoUrl: _logo, ...rest } = draft;
      void _logo;
      const res = await savePaymentAccountSettings(rest);
      setView(res.data);
      setDraft(res.data.settings);
      setSampleV(String(Date.now()));
      setSaved(true);
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Setările nu s-au putut salva."));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Logoul trebuie să fie PNG sau JPG (PDF-ul nu poate desena alte formate).");
      return;
    }
    if (file.size > 1_000_000) {
      setError("Logoul e prea mare — maximum 1 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPaymentAccountLogo(file);
      setView(res.data);
      setDraft((d) => (d ? { ...d, logoUrl: res.data.settings.logoUrl, showLogo: true } : d));
      setSampleV(String(Date.now()));
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Logoul nu s-a putut încărca."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    setUploading(true);
    try {
      const res = await removePaymentAccountLogo();
      setView(res.data);
      setDraft((d) => (d ? { ...d, logoUrl: null } : d));
      setSampleV(String(Date.now()));
    } catch (e) {
      setError(paymentAccountErrorMessage(e, "Logoul nu s-a putut scoate."));
    } finally {
      setUploading(false);
    }
  }

  if (loading || !draft || !view) {
    return (
      <BusinessShell pageTitle="Aspect și numerotare">
        {error ? (
          <Alert variant="destructive">{error}</Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Se încarcă…
          </div>
        )}
      </BusinessShell>
    );
  }

  const accentValid = isHexColor(draft.accentColor);
  const dirty = settingsDirty || profileDirty;

  return (
    <BusinessShell
      pageTitle="Aspect și numerotare"
      pageDescription="Rechizitele, logoul, culorile și formatul numărului — setate o dată, pe toate conturile de plată."
      actions={
        <Button variant="ghost" size="sm" href={base}>
          Înapoi la conturi
        </Button>
      }
    >
      <InvoicingTabs />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
              {error}
            </Alert>
          )}

          {/* Rechizitele */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pas-req-h">
            <h2 id="pas-req-h" className="text-sm font-semibold text-foreground">
              Rechizitele tale
            </h2>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Aceleași ca în „Datele firmei” — apar și pe ofertele și contractele din CRM.
            </p>
            {view.missing.length > 0 && (
              <Alert variant="warning" className="mb-3">
                Lipsesc: {view.missing.join(", ")}. Fără ele clientul nu are unde plăti.
              </Alert>
            )}
            {profile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PROFILE_FIELDS.map((f) => (
                  <div key={f.key} className={f.span ? "sm:col-span-2" : undefined}>
                    <Label htmlFor={`pas-${f.key}`} required={f.required}>
                      {f.label}
                    </Label>
                    <Input
                      id={`pas-${f.key}`}
                      value={profile[f.key] ?? ""}
                      onChange={(e) => {
                        setProfile({ ...profile, [f.key]: e.target.value || (f.key === "legalName" ? "" : null) });
                        setProfileDirty(true);
                        setSaved(false);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{view.issuer.name || "—"}</p>
                <p className="text-muted-foreground">
                  {[view.issuer.idno && `IDNO ${view.issuer.idno}`, view.issuer.iban, view.issuer.bankName].filter(Boolean).join(" · ") || "—"}
                </p>
                {profileLocked && (
                  <p className="text-xs text-muted-foreground">Rechizitele le poate modifica un administrator al CRM-ului, în „Datele firmei”.</p>
                )}
              </div>
            )}
          </section>

          {/* Logo */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pas-logo-h">
            <div className="flex items-center justify-between gap-3">
              <h2 id="pas-logo-h" className="text-sm font-semibold text-foreground">
                Logo
              </h2>
              <Switch checked={draft.showLogo} onChange={(v) => patch({ showLogo: v })} aria-label="Arată logoul pe cont" />
            </div>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              PNG sau JPG, maximum 1 MB. {view.logoUrl ? "Logoul curent se vede în mostră." : "Fără logo, sus apare denumirea firmei."}
              {!draft.logoUrl && view.logoUrl ? " (Folosim logoul organizației.)" : ""}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              id="pas-logo-file"
              onChange={(e) => handleLogo(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
                {view.logoUrl ? "Schimbă logoul" : "Încarcă logoul"}
              </Button>
              {draft.logoUrl && (
                <Button variant="ghost" onClick={handleRemoveLogo} disabled={uploading}>
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                  Scoate
                </Button>
              )}
            </div>
          </section>

          {/* Aspect */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pas-look-h">
            <h2 id="pas-look-h" className="mb-3 text-sm font-semibold text-foreground">
              Aspect
            </h2>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">Macheta</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {LAYOUTS.map((l) => (
                  <label
                    key={l.value}
                    className={cn(
                      "flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors",
                      draft.layout === l.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
                    )}
                  >
                    <input
                      type="radio"
                      name="pas-layout"
                      value={l.value}
                      checked={draft.layout === l.value}
                      onChange={() => patch({ layout: l.value })}
                      className="sr-only"
                    />
                    <span className="font-medium text-foreground">{l.title}</span>
                    <span className="text-xs text-muted-foreground">{l.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="mb-2 text-xs font-medium text-muted-foreground">Culoarea</legend>
              <div className="flex flex-wrap items-center gap-2">
                {DOCUMENT_ACCENT_PRESETS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => patch({ accentColor: c.hex })}
                    aria-label={`Culoarea ${c.name}`}
                    aria-pressed={draft.accentColor.toUpperCase() === c.hex}
                    title={c.name}
                    className={cn(
                      "h-11 w-11 rounded-full border-2 transition-transform hover:scale-105",
                      draft.accentColor.toUpperCase() === c.hex ? "border-foreground" : "border-transparent"
                    )}
                    // Culoarea e DATĂ (se tipărește pe cont), nu tema aplicației — vezi documentColors.ts.
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="sr-only">Altă culoare</span>
                  <input
                    type="color"
                    value={accentValid ? draft.accentColor : DOCUMENT_ACCENT_PRESETS[0].hex}
                    onChange={(e) => patch({ accentColor: e.target.value.toUpperCase() })}
                    className="h-11 w-11 cursor-pointer rounded-md border border-input bg-background p-1"
                  />
                </label>
                <Input
                  aria-label="Codul culorii"
                  value={draft.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                  invalid={!accentValid}
                  className="w-28 font-mono"
                  maxLength={7}
                />
              </div>
            </fieldset>

            <div className="mt-4 space-y-3">
              {(
                [
                  ["showAmountWords", "Suma în litere", "„șase mii două sute patruzeci de lei 00 bani” (pe contul în română)"],
                  ["showSignature", "Semnătura administratorului", "Linie de semnătură cu numele din rechizite"],
                  ["showStamp", "Loc pentru ștampilă", "Un cerc „L.Ș.” lângă semnătură"],
                ] as const
              ).map(([key, title, hint]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch checked={draft[key]} onChange={(v) => patch({ [key]: v } as Partial<PaymentAccountSettings>)} aria-label={title} />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Label htmlFor="pas-footer">Text în subsolul paginii</Label>
              <Input
                id="pas-footer"
                value={draft.footerText ?? ""}
                maxLength={500}
                onChange={(e) => patch({ footerText: e.target.value || null })}
                placeholder="Ex.: Mulțumim pentru încredere! · www.firma.md · +373 …"
              />
            </div>
          </section>

          {/* Numerotare */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pas-num-h">
            <h2 id="pas-num-h" className="text-sm font-semibold text-foreground">
              Numerotare
            </h2>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              Numărul se pune singur la emitere. Următorul va fi <span className="font-mono font-semibold text-foreground">{view.nextNumber}</span>.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pas-series">Seria</Label>
                <Input id="pas-series" value={draft.series} maxLength={20} onChange={(e) => patch({ series: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pas-pattern">Formatul</Label>
                <Input id="pas-pattern" value={draft.numberPattern} maxLength={60} invalid={!draft.numberPattern.includes("{nr}")} onChange={(e) => patch({ numberPattern: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  <code>{"{serie}"}</code> <code>{"{an}"}</code> <code>{"{nr}"}</code> — ex.: <code>{"{nr}/{an}"}</code>
                </p>
              </div>
              <div>
                <Label htmlFor="pas-pad">Cifre în număr</Label>
                <IntField id="pas-pad" value={draft.numberPad} min={1} max={10} onCommit={(n) => patch({ numberPad: n })} />
              </div>
              <div>
                <Label htmlFor="pas-start">Începe de la numărul</Label>
                <IntField id="pas-start" value={draft.numberStart} min={1} max={10_000_000} onCommit={(n) => patch({ numberStart: n })} />
                <p className="mt-1 text-xs text-muted-foreground">Vii din alt program? Pune următorul număr de acolo.</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Exemplu: <span className="font-mono font-semibold text-foreground">{formatExample(draft, Math.max(draft.numberStart, 1))}</span>
            </p>
          </section>

          {/* Implicite */}
          <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="pas-def-h">
            <h2 id="pas-def-h" className="mb-3 text-sm font-semibold text-foreground">
              Ce se completează singur pe un cont nou
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="pas-vat">TVA implicit</Label>
                <Select id="pas-vat" value={draft.defaultVatRate} onChange={(e) => patch({ defaultVatRate: parseInt(e.target.value, 10) || 0 })}>
                  {[...new Set([0, 8, 12, 20, draft.defaultVatRate])].sort((a, b) => a - b).map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="pas-due">Termen de plată (zile)</Label>
                <IntField id="pas-due" value={draft.defaultDueDays} min={0} max={365} onCommit={(n) => patch({ defaultDueDays: n })} />
              </div>
              <div>
                <Label htmlFor="pas-lang">Limba</Label>
                <Select id="pas-lang" value={draft.defaultLang} onChange={(e) => patch({ defaultLang: e.target.value as PaymentAccountSettings["defaultLang"] })}>
                  <option value="ro">Română</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="pas-notes">Mențiuni implicite</Label>
              <Textarea
                id="pas-notes"
                rows={2}
                value={draft.defaultNotes ?? ""}
                onChange={(e) => patch({ defaultNotes: e.target.value || null })}
                placeholder="Ex.: Vă rugăm să indicați numărul contului în destinația plății."
              />
            </div>
          </section>

          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saved ? (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Salvat — mostra din dreapta e actualizată.
                </span>
              ) : dirty ? (
                "Ai modificări nesalvate."
              ) : (
                "Totul e salvat."
              )}
            </span>
            <Button onClick={handleSave} disabled={saving || !dirty || !accentValid || !draft.numberPattern.includes("{nr}")}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Salvează și actualizează mostra
            </Button>
          </div>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <h2 className="mb-2 px-1 text-sm font-semibold text-foreground">Mostră PDF (cu setările salvate)</h2>
            <iframe
              key={sampleV}
              src={paymentAccountSampleUrl(sampleV)}
              title="Mostra contului de plată"
              className="h-[80vh] min-h-[560px] w-full rounded-md border border-border bg-background"
            />
          </div>
        </div>
      </div>
    </BusinessShell>
  );
}

export default CrmPaymentAccountSettingsPage;
