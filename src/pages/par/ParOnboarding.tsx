/**
 * VF-003 — /business/par/onboarding
 *
 * 3-step wizard that takes a brand-new organization from an empty PAR setup to a working one
 * in under 2 minutes. Every step is skippable; sensible defaults are pre-filled. On finalize
 * (or full skip) we set parSettings.onboardingComplete = true and redirect to the dashboard.
 *
 * Design system: Vector 365 tokens only, light + dark, WCAG AA.
 */
import { useEffect, useState } from "react";
import {
  Building2, Layers, Users, Loader2, ArrowRight, ArrowLeft, Check, X, Plus, SkipForward,
} from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { Logo } from "@/components/Logo";
import {
  getParSettings, updateParSettings,
  listDepartments, createDepartment,
  listBudgetCodes, createBudgetCode,
} from "@/lib/api/par";

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

export function ParOnboarding() {
  const { navigate } = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — organization
  const [orgName, setOrgName] = useState("");
  const [currency, setCurrency] = useState("MDL");
  const [thresholdMdl, setThresholdMdl] = useState("10000");
  const [prefix, setPrefix] = useState("PAR");

  // Step 2 — structure
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptInput, setDeptInput] = useState("");
  const [codes, setCodes] = useState<{ code: string; name: string }[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [codeNameInput, setCodeNameInput] = useState("");

  // Load current settings (org name pre-fill) once.
  useEffect(() => {
    getParSettings()
      .then((s) => {
        if (s.orgLegalName) setOrgName(s.orgLegalName);
        if (s.defaultCurrency) setCurrency(s.defaultCurrency);
        if (s.requestNoPrefix) setPrefix(s.requestNoPrefix);
        if (s.microPurchaseThresholdCents)
          setThresholdMdl(String(Math.round(s.microPurchaseThresholdCents / 100)));
      })
      .catch(() => {});
  }, []);

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      // 1) Step-1 settings.
      await updateParSettings({
        orgLegalName: orgName.trim() || null,
        defaultCurrency: currency,
        requestNoPrefix: prefix.trim() || "PAR",
        microPurchaseThresholdCents: Math.max(0, Math.round(Number(thresholdMdl) || 0) * 100),
      });

      // 2) Step-2 structure — skip ones that already exist (idempotent on re-run).
      const [existingDepts, existingCodes] = await Promise.all([listDepartments(), listBudgetCodes()]);
      const haveDept = new Set(existingDepts.items.map((d) => d.name));
      const haveCode = new Set(existingCodes.items.map((c) => c.code));
      await Promise.all([
        ...departments.filter((d) => !haveDept.has(d)).map((name) => createDepartment({ name })),
        ...codes.filter((c) => !haveCode.has(c.code)).map((c) => createBudgetCode({ code: c.code, name: c.name })),
      ]);

      // 3) Mark complete last, so a mid-way failure leaves the wizard re-runnable.
      await updateParSettings({ onboardingComplete: true });
      navigate("/business/par");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu am putut salva. Încearcă din nou.");
      setFinishing(false);
    }
  };

  const skipAll = async () => {
    setFinishing(true);
    try {
      await updateParSettings({ onboardingComplete: true });
    } catch {
      /* even if it fails, don't trap the user */
    }
    navigate("/business/par");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={skipAll}
            disabled={finishing}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
          >
            <SkipForward className="h-4 w-4" aria-hidden />
            Sari peste configurare
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
                Configurează-ți organizația
              </h1>
              <span className="text-sm text-muted-foreground">Pasul {step} din {TOTAL_STEPS}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden" role="progressbar"
                 aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
              <div className="h-full bg-primary transition-all" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            {step === 1 && (
              <StepOrg
                orgName={orgName} setOrgName={setOrgName}
                currency={currency} setCurrency={setCurrency}
                thresholdMdl={thresholdMdl} setThresholdMdl={setThresholdMdl}
                prefix={prefix} setPrefix={setPrefix}
              />
            )}
            {step === 2 && (
              <StepStructure
                departments={departments} setDepartments={setDepartments}
                deptInput={deptInput} setDeptInput={setDeptInput}
                codes={codes} setCodes={setCodes}
                codeInput={codeInput} setCodeInput={setCodeInput}
                codeNameInput={codeNameInput} setCodeNameInput={setCodeNameInput}
              />
            )}
            {step === 3 && (
              <StepTeam
                departments={departments} codes={codes} orgName={orgName}
              />
            )}

            {error && (
              <div role="alert" className="mt-4 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Nav buttons */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1 || finishing}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Înapoi
              </button>

              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => ((s + 1) as Step))}
                  disabled={finishing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
                >
                  Continuă
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  disabled={finishing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {finishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  Finalizează
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Step 1: organization ───────────────────────────────────────────────────────

function StepOrg(props: {
  orgName: string; setOrgName: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  thresholdMdl: string; setThresholdMdl: (v: string) => void;
  prefix: string; setPrefix: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeading icon={Building2} title="Despre organizație"
        subtitle="Aceste detalii apar pe formularele de plată generate." />
      <Field label="Denumirea organizației" htmlFor="org-name">
        <input id="org-name" type="text" value={props.orgName}
          onChange={(e) => props.setOrgName(e.target.value)}
          placeholder="ex. Asociația Exemplu"
          className="vf-input" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monedă implicită" htmlFor="currency">
          <select id="currency" value={props.currency}
            onChange={(e) => props.setCurrency(e.target.value)} className="vf-input">
            <option value="MDL">MDL — Leu moldovenesc</option>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dolar american</option>
            <option value="RON">RON — Leu românesc</option>
          </select>
        </Field>
        <Field label="Prefix numerotare" htmlFor="prefix">
          <input id="prefix" type="text" value={props.prefix}
            onChange={(e) => props.setPrefix(e.target.value.toUpperCase().slice(0, 20))}
            placeholder="PAR" className="vf-input" />
        </Field>
      </div>
      <Field label="Prag micro-achiziție" htmlFor="threshold"
        hint="Plățile sub acest prag necesită mai puține aprobări.">
        <div className="relative">
          <input id="threshold" type="number" min={0} value={props.thresholdMdl}
            onChange={(e) => props.setThresholdMdl(e.target.value)}
            className="vf-input pr-14" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{props.currency}</span>
        </div>
      </Field>
    </div>
  );
}

// ─── Step 2: structure ──────────────────────────────────────────────────────────

function StepStructure(props: {
  departments: string[]; setDepartments: (v: string[]) => void;
  deptInput: string; setDeptInput: (v: string) => void;
  codes: { code: string; name: string }[]; setCodes: (v: { code: string; name: string }[]) => void;
  codeInput: string; setCodeInput: (v: string) => void;
  codeNameInput: string; setCodeNameInput: (v: string) => void;
}) {
  const addDept = () => {
    const v = props.deptInput.trim();
    if (v && !props.departments.includes(v)) props.setDepartments([...props.departments, v]);
    props.setDeptInput("");
  };
  const addCode = () => {
    const code = props.codeInput.trim();
    const name = props.codeNameInput.trim();
    if (code && !props.codes.some((c) => c.code === code))
      props.setCodes([...props.codes, { code, name: name || code }]);
    props.setCodeInput("");
    props.setCodeNameInput("");
  };

  return (
    <div className="space-y-6">
      <SectionHeading icon={Layers} title="Structura organizației"
        subtitle="Adaugă departamente și coduri de buget. Le poți modifica oricând din Admin." />

      {/* Departments */}
      <div>
        <label className="block text-sm font-semibold mb-1.5">Departamente</label>
        <div className="flex gap-2">
          <input type="text" value={props.deptInput}
            onChange={(e) => props.setDeptInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDept(); } }}
            placeholder="ex. Finanțe — apasă Enter"
            aria-label="Nume departament"
            className="vf-input flex-1" />
          <button type="button" onClick={addDept} aria-label="Adaugă departament"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 hover:bg-muted transition-colors min-h-[44px]">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {props.departments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {props.departments.map((d) => (
              <Chip key={d} label={d} onRemove={() => props.setDepartments(props.departments.filter((x) => x !== d))} />
            ))}
          </div>
        )}
      </div>

      {/* Budget codes */}
      <div>
        <label className="block text-sm font-semibold mb-1.5">Coduri de buget</label>
        <div className="flex gap-2">
          <input type="text" value={props.codeInput}
            onChange={(e) => props.setCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
            placeholder="Cod (ex. M13)" aria-label="Cod buget"
            className="vf-input w-32" />
          <input type="text" value={props.codeNameInput}
            onChange={(e) => props.setCodeNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
            placeholder="Denumire (opțional)" aria-label="Denumire cod buget"
            className="vf-input flex-1" />
          <button type="button" onClick={addCode} aria-label="Adaugă cod buget"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 hover:bg-muted transition-colors min-h-[44px]">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {props.codes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {props.codes.map((c) => (
              <Chip key={c.code} label={c.name === c.code ? c.code : `${c.code} — ${c.name}`}
                onRemove={() => props.setCodes(props.codes.filter((x) => x.code !== c.code))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: team ───────────────────────────────────────────────────────────────

function StepTeam(props: { departments: string[]; codes: { code: string; name: string }[]; orgName: string }) {
  return (
    <div className="space-y-5">
      <SectionHeading icon={Users} title="Echipa"
        subtitle="Invitarea colegilor vine în curând. Deocamdată, ești gata de pornit." />
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Rezumat configurare</p>
        <SummaryRow label="Organizație" value={props.orgName || "—"} />
        <SummaryRow label="Departamente" value={props.departments.length ? props.departments.join(", ") : "Niciunul (poți adăuga din Admin)"} />
        <SummaryRow label="Coduri de buget" value={props.codes.length ? props.codes.map((c) => c.code).join(", ") : "Niciunul (poți adăuga din Admin)"} />
      </div>
      <p className="text-sm text-muted-foreground">
        Apasă <strong className="text-foreground">Finalizează</strong> ca să salvezi configurarea și să intri în panoul de control.
        Vei putea adăuga membri și ajusta matricea de aprobare oricând din secțiunea Admin.
      </p>
    </div>
  );
}

// ─── Small UI helpers ───────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof Building2; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Elimină ${label}`} className="hover:text-primary/70">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
