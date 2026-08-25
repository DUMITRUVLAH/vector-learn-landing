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
import { Alert, Badge, Button, Card, Input, Label, PastelIcon, Progress, Select } from "@/components/ds";
import { FinFlowMark } from "@/components/business/FinFlowLogo";
import {
  getParSettings, updateParSettings,
  listDepartments, createDepartment,
  listBudgetCodes, createBudgetCode,
  listPayers, createPayer,
  createParInvite,
  type ParRole,
} from "@/lib/api/par";

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

/** VF-003bis: team invites straight from the wizard (the API existed, the step said "coming soon"). */
interface Invitee {
  email: string;
  role: ParRole;
}

const INVITE_ROLE_OPTIONS: Array<{ value: ParRole; label: string }> = [
  { value: "requestor", label: "Solicitant — creează cereri" },
  { value: "approver", label: "Aprobator — aprobă cereri" },
  { value: "finance", label: "Finanțe — procesează plăți" },
  { value: "par_admin", label: "Administrator — configurează tot" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Step 3 — team invites (skippable, like everything else in the wizard)
  const [invitees, setInvitees] = useState<Invitee[]>([]);

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

      // 3) A payer must exist before anyone can be invited (payer scope is required) or
      //    any PAR can be created. A brand-new org has none — make one from the org name.
      let payerIds = (await listPayers()).items.filter((p) => p.active !== false).map((p) => p.id);
      if (payerIds.length === 0) {
        const created = await createPayer({ name: orgName.trim() || "Organizația mea" });
        payerIds = [created.id];
      }

      // 4) Team invites — a re-invite for the same email just replaces the pending one, so
      //    this is idempotent too. An email already in the org is reported, not fatal to the rest.
      const failed: string[] = [];
      for (const inv of invitees) {
        try {
          await createParInvite({ email: inv.email, par_role: inv.role, payer_ids: payerIds });
        } catch (e) {
          const already = e instanceof Error && e.message.includes("already_member");
          if (!already) failed.push(inv.email);
        }
      }
      if (failed.length > 0) {
        setError(`Nu am putut trimite invitația pentru: ${failed.join(", ")}. Restul configurării e salvat — încearcă din nou sau invită mai târziu din Admin → Membri.`);
        setFinishing(false);
        return;
      }

      // 5) Mark complete last, so a mid-way failure leaves the wizard re-runnable.
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
          {/* This is a FinFlow (PAR) screen — it used to render the CRM's
              "Vector Learn" logo, which is a different product. */}
          <span className="flex items-center gap-3">
            <FinFlowMark size={32} className="rounded-xl" />
            <span className="text-[15px] font-bold tracking-tight">FinFlow</span>
          </span>
          <Button variant="ghost" onClick={skipAll} disabled={finishing} className="text-muted-foreground">
            <SkipForward className="h-4 w-4" aria-hidden />
            Sari peste configurare
          </Button>
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
            <Progress
              value={(step / TOTAL_STEPS) * 100}
              height={8}
              aria-label={`Pasul ${step} din ${TOTAL_STEPS}`}
            />
          </div>

          <Card tone="dashboard" className="p-6 shadow-sm sm:p-8">
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
                invitees={invitees} setInvitees={setInvitees}
              />
            )}

            {error && <Alert variant="destructive" className="mt-4">{error}</Alert>}

            {/* Nav buttons */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1 || finishing}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Înapoi
              </Button>

              {step < TOTAL_STEPS ? (
                <Button size="lg" onClick={() => setStep((s) => ((s + 1) as Step))} disabled={finishing}>
                  Continuă
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button size="lg" onClick={finish} disabled={finishing}>
                  {finishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  Finalizează
                </Button>
              )}
            </div>
          </Card>
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
        <Input id="org-name" type="text" value={props.orgName}
          onChange={(e) => props.setOrgName(e.target.value)}
          placeholder="ex. Asociația Exemplu"
          />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monedă implicită" htmlFor="currency">
          <Select id="currency" value={props.currency}
            onChange={(e) => props.setCurrency(e.target.value)}>
            <option value="MDL">MDL — Leu moldovenesc</option>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dolar american</option>
            <option value="RON">RON — Leu românesc</option>
          </Select>
        </Field>
        <Field label="Prefix numerotare" htmlFor="prefix">
          <Input id="prefix" type="text" value={props.prefix}
            onChange={(e) => props.setPrefix(e.target.value.toUpperCase().slice(0, 20))}
            placeholder="PAR" />
        </Field>
      </div>
      <Field label="Prag micro-achiziție" htmlFor="threshold"
        hint="Plățile sub acest prag necesită mai puține aprobări.">
        <div className="relative">
          <Input id="threshold" type="number" min={0} value={props.thresholdMdl}
            onChange={(e) => props.setThresholdMdl(e.target.value)}
            className="pr-14" />
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
        <Label className="mb-1.5 block">Departamente</Label>
        <div className="flex gap-2">
          <Input type="text" value={props.deptInput}
            onChange={(e) => props.setDeptInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDept(); } }}
            placeholder="ex. Finanțe — apasă Enter"
            aria-label="Nume departament"
            className="flex-1" />
          <Button onClick={addDept} aria-label="Adaugă departament"
            variant="outline" size="lg" className="px-3">
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
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
        <Label className="mb-1.5 block">Coduri de buget</Label>
        <div className="flex gap-2">
          <Input type="text" value={props.codeInput}
            onChange={(e) => props.setCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
            placeholder="Cod (ex. M13)" aria-label="Cod buget"
            className="w-32" />
          <Input type="text" value={props.codeNameInput}
            onChange={(e) => props.setCodeNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
            placeholder="Denumire (opțional)" aria-label="Denumire cod buget"
            className="flex-1" />
          <Button onClick={addCode} aria-label="Adaugă cod buget"
            variant="outline" size="lg" className="px-3">
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
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

function StepTeam(props: {
  departments: string[]; codes: { code: string; name: string }[]; orgName: string;
  invitees: Invitee[]; setInvitees: (v: Invitee[]) => void;
}) {
  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<ParRole>("requestor");
  const [inputError, setInputError] = useState<string | null>(null);

  const addInvitee = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setInputError("Adresa de email nu pare validă.");
      return;
    }
    if (props.invitees.some((i) => i.email === email)) {
      setInputError("Emailul e deja în listă.");
      return;
    }
    setInputError(null);
    props.setInvitees([...props.invitees, { email, role: roleInput }]);
    setEmailInput("");
  };

  const roleLabel = (r: ParRole) => INVITE_ROLE_OPTIONS.find((o) => o.value === r)?.label.split(" — ")[0] ?? r;

  return (
    <div className="space-y-5">
      <SectionHeading icon={Users} title="Echipa"
        subtitle="Invită-ți colegii pe email, cu rolul potrivit. Poți sări peste și invita mai târziu din Admin." />

      <div>
        <Label htmlFor="invite-email" className="mb-1.5 block">Invită un coleg</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="invite-email" type="email" value={emailInput}
            onChange={(e) => { setEmailInput(e.target.value); setInputError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInvitee(); } }}
            placeholder="coleg@organizația-ta.md"
            className="flex-1" />
          <Select value={roleInput} onChange={(e) => setRoleInput(e.target.value as ParRole)}
            aria-label="Rolul colegului invitat" className="sm:w-56">
            {INVITE_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Button onClick={addInvitee} aria-label="Adaugă invitația"
            variant="outline" size="lg" className="px-3">
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {inputError && <p className="mt-1 text-xs text-destructive" role="alert">{inputError}</p>}
        {props.invitees.length > 0 && (
          <ul className="mt-2 space-y-1.5" aria-label="Colegi de invitat">
            {props.invitees.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{i.email}</span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <Badge variant="info">{roleLabel(i.role)}</Badge>
                  <button type="button" aria-label={`Elimină invitația pentru ${i.email}`}
                    onClick={() => props.setInvitees(props.invitees.filter((x) => x.email !== i.email))}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Invitațiile se trimit la Finalizare și rămân vizibile (cu link de copiat) în Admin → Membri.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Rezumat configurare</p>
        <SummaryRow label="Organizație" value={props.orgName || "—"} />
        <SummaryRow label="Departamente" value={props.departments.length ? props.departments.join(", ") : "Niciunul (poți adăuga din Admin)"} />
        <SummaryRow label="Coduri de buget" value={props.codes.length ? props.codes.map((c) => c.code).join(", ") : "Niciunul (poți adăuga din Admin)"} />
        <SummaryRow label="Invitații" value={props.invitees.length ? props.invitees.map((i) => i.email).join(", ") : "Niciuna (poți invita din Admin)"} />
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
      <PastelIcon tone="indigo" size={40}>
        <Icon className="h-5 w-5" />
      </PastelIcon>
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
      <Label htmlFor={htmlFor} className="mb-1.5 block">{label}</Label>
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
