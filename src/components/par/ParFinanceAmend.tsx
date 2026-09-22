/**
 * Completările făcute de FINANȚE după semnare — editate acolo unde se văd.
 *
 * Cerere manager financiar (22.09.2026): „posibilitatea de a edita post semnare: linia de buget,
 * adăugare descriere dacă e nevoie și inserare de acte adiționale la atașament. După semnare și
 * plata nu mai putem modifica sumele însă."
 *
 * Cererea semnată NU se redeschide la editare — s-ar pierde semnăturile. Se completează doar
 * câmpurile care nu schimbă banii, și doar de cine are rolul de finanțe. Creionul stă lângă
 * valoare, la secțiunea ei (7, 11, 13): locul unde vezi greșeala e locul unde o corectezi.
 *
 * Regula reală trăiește pe server (`server/lib/par/postSignatureEdit.ts`) — aici doar nu arătăm
 * ce oricum ar fi refuzat.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Pencil, Plus } from "lucide-react";
import { Button, Combobox, Input, Select, Textarea } from "@/components/ds";
import {
  listBudgetCodes,
  reconcileInBackground,
  updatePar,
  uploadAttachmentDirect,
  type ParAttachmentKind,
  type ParBudgetCode,
  type ParDetail,
} from "@/lib/api/par";
import { ATTACHMENT_KIND_LABELS, ATTACHMENT_KIND_ORDER, KIND_OTHER_MAX_LEN } from "@/lib/par/attachmentKinds";
import { MAX_ATTACHMENT_BYTES, attachmentTooLargeMessage } from "@/lib/par/attachmentLimits";

/** Statusurile în care semnăturile există deja și cererea e la finanțe (oglindește serverul). */
const FINANCE_STAGE_STATUSES = ["approved", "in_finance", "reapproval_required", "paid"];

/**
 * Poate cel care se uită să completeze cererea asta? Rol de finanțe (sau administratorul
 * modulului) + cerere trecută de semnături. Solicitantul și aprobatorul nu intră pe calea asta.
 */
export function canAmendAfterSignature(roles: readonly string[], status: string): boolean {
  const isFinance = roles.includes("finance") || roles.includes("par_admin");
  return isFinance && FINANCE_STAGE_STATUSES.includes(status);
}

function errorText(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "detail" in e && typeof (e as { detail: unknown }).detail === "string") {
    return (e as { detail: string }).detail;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Butonul discret care deschide editarea. Nu ocupă loc cât timp nimeni nu editează. */
function EditTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline max-sm:min-h-[44px]"
    >
      <Pencil className="h-3 w-3" aria-hidden />
      {label}
    </button>
  );
}

function AmendActions({
  busy,
  onCancel,
  saveLabel = "Salvează",
}: {
  busy: boolean;
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {saveLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Renunță
      </Button>
    </div>
  );
}

// ─── Secțiunea 7: linia de buget ──────────────────────────────────────────────

export interface FinanceAmendProps {
  par: ParDetail;
  onSaved: () => void;
}

export function FinanceAmendBudgetLine({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<ParBudgetCode[]>([]);
  const [codeId, setCodeId] = useState(par.budgetCodeId ?? "");
  const [note, setNote] = useState(par.budgetCodeNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listBudgetCodes()
      .then((r) => { if (alive) setCodes(r.items.filter((c) => c.active)); })
      .catch(() => { if (alive) setError("Lista codurilor bugetare nu s-a încărcat."); });
    return () => { alive = false; };
  }, [open]);

  if (!open) {
    return <EditTrigger label="Schimbă linia de buget" onClick={() => setOpen(true)} />;
  }

  // Aceeași regulă ca pe server: codul trebuie să fie al plătitorului cererii, iar un cod legat
  // de un proiect merge doar pe proiectul lui.
  const eligible = codes.filter(
    (c) =>
      (!c.payerId || !par.payerId || c.payerId === par.payerId) &&
      (!c.projectId || c.projectId === par.projectId)
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePar(par.id, {
        budget_code_id: codeId || null,
        budget_code_note: note.trim() ? note.trim() : null,
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(errorText(err, "Linia de buget nu a putut fi schimbată."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2" aria-label="Schimbă linia de buget">
      <Combobox
        aria-label="Cod bugetar"
        value={codeId}
        onChange={setCodeId}
        options={eligible.map((c) => ({ value: c.id, label: c.code, hint: c.name }))}
        placeholder="Caută după cod sau denumire…"
        emptyText="Niciun cod bugetar potrivit cererii"
      />
      <Input
        aria-label="Notă la linia de buget"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notă (opțional)"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AmendActions busy={busy} onCancel={() => { setOpen(false); setError(null); }} />
    </form>
  );
}

// ─── Secțiunea 11: descrierea utilizării finale ───────────────────────────────

export function FinanceAmendEndUse({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(par.endUse ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <EditTrigger
        label={par.endUse ? "Completează descrierea" : "Adaugă descriere"}
        onClick={() => setOpen(true)}
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePar(par.id, { end_use: text.trim() ? text.trim() : null });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(errorText(err, "Descrierea nu a putut fi salvată."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2" aria-label="Completează descrierea">
      <Textarea
        aria-label="Scopul și descrierea utilizării finale"
        value={text}
        rows={4}
        maxLength={5000}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ce s-a cumpărat și pentru ce se folosește."
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AmendActions busy={busy} onCancel={() => { setOpen(false); setError(null); }} />
    </form>
  );
}

// ─── Secțiunea 13: acte adiționale la dosar ───────────────────────────────────

/**
 * Actele adiționale se pun la dosar cu tip și nume, nu ca „Alt document": peste un an, cine
 * deschide dosarul trebuie să știe ce a semnat, nu doar că mai era un fișier.
 */
export function FinanceAddendum({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ParAttachmentKind>("other");
  const [kindOther, setKindOther] = useState("Act adițional");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"upload" | "finalize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded text-xs font-medium text-primary hover:underline max-sm:min-h-[44px]"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Adaugă act adițional la dosar
      </button>
    );
  }

  const upload = async (file: File) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(attachmentTooLargeMessage(file.name));
      return;
    }
    if (kind === "other" && !kindOther.trim()) {
      setError("Scrie ce document este.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const att = await uploadAttachmentDirect(par.id, file, {
        kind,
        ...(kind === "other" ? { kind_other: kindOther.trim() } : {}),
        onStep: setStep,
      });
      reconcileInBackground(par.id, att.id);
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(errorText(err, "Documentul nu a putut fi atașat."));
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-3" aria-label="Adaugă act adițional">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Tipul documentului"
          className="w-auto min-w-[12rem]"
          value={kind}
          onChange={(e) => setKind(e.target.value as ParAttachmentKind)}
          disabled={busy}
        >
          {ATTACHMENT_KIND_ORDER.filter((k) => k !== "par_pdf").map((k) => (
            <option key={k} value={k}>{ATTACHMENT_KIND_LABELS[k]}</option>
          ))}
        </Select>
        {kind === "other" && (
          <Input
            aria-label="Ce document este"
            className="w-auto min-w-[14rem]"
            value={kindOther}
            maxLength={KIND_OTHER_MAX_LEN}
            onChange={(e) => setKindOther(e.target.value)}
            disabled={busy}
          />
        )}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Paperclip className="h-3.5 w-3.5" aria-hidden />}
          {busy ? (step === "finalize" ? "Se verifică…" : "Se încarcă…") : "Alege fișierul"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>
          Renunță
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label="Fișierul actului adițional"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Documentul intră în dosarul cererii. Sumele semnate rămân neschimbate.
      </p>
    </div>
  );
}

// ─── Urma completărilor, pe fișă ──────────────────────────────────────────────

/**
 * Cine a semnat documentul trebuie să afle DIN document că a fost completat după semnare —
 * nu dintr-un jurnal pe care nu-l deschide nimeni.
 */
export function FinanceAmendNotice({
  amendments,
}: {
  amendments: NonNullable<ParDetail["finance_amendments"]>;
}) {
  if (!amendments.length) return null;
  const last = amendments[amendments.length - 1];
  const when = new Date(last.at);
  const whenText = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  const fields = [...new Set(amendments.flatMap((a) => a.fields))];

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Completat de finanțe după semnare{last.byName ? ` (${last.byName})` : ""}
      {whenText ? `, ${whenText}` : ""}
      {fields.length ? `: ${fields.join(", ")}` : ""}. Sumele semnate nu s-au schimbat.
    </p>
  );
}
