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
import { Button, Combobox, DateField, Input, Select, Textarea } from "@/components/ds";
import {
  listBudgetCodes,
  listEvents,
  reconcileInBackground,
  updatePar,
  uploadAttachmentDirect,
  type ParAttachmentKind,
  type ParBudgetCode,
  type ParDetail,
  type ParEvent,
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
  // `api()` aruncă `ApiError`, care ține fraza în română în `body.detail` — `message` e doar
  // codul („forbidden_after_signature"), adică exact ce nu trebuie să vadă omul.
  const body = e && typeof e === "object" && "body" in e ? (e as { body: unknown }).body : null;
  if (body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string") {
    return (body as { detail: string }).detail;
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

/**
 * Ce îi trebuie completării dintr-o cerere. Deliberat mai puțin decât `ParDetail`: aceleași
 * controale se folosesc și din coada de finanțe, unde rândul e un `ParFinanceQueueItem`.
 */
export interface AmendablePar {
  id: string;
  requestNo?: string;
  payerId: string | null;
  projectId: string | null;
  budgetCodeId: string | null;
  budgetCodeNote: string | null;
  endUse: string | null;
  attachmentsNote?: string | null;
  budgetCodeLabel?: string | null;
  /** Folosite doar de completările verificatorului (eveniment + data necesară). */
  eventId?: string | null;
  dateNeeded?: string | null;
  /** Data cererii — pragul de jos pentru „data necesară". */
  dateOfRequest?: string | null;
}

export interface FinanceAmendProps {
  par: AmendablePar;
  onSaved: () => void;
}

/**
 * Codurile bugetare pe care cererea ASTA le poate primi — aceeași regulă ca pe server: codul
 * trebuie să fie al plătitorului cererii, iar un cod legat de un proiect merge doar pe proiectul
 * lui. Se încarcă doar când chiar se editează, nu la fiecare deschidere de fișă.
 */
function useAmendableBudgetCodes(par: AmendablePar, enabled: boolean) {
  const [codes, setCodes] = useState<ParBudgetCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    listBudgetCodes()
      .then((r) => { if (alive) setCodes(r.items.filter((c) => c.active)); })
      .catch(() => { if (alive) setError("Lista codurilor bugetare nu s-a încărcat."); });
    return () => { alive = false; };
  }, [enabled]);

  const options = codes
    .filter(
      (c) =>
        (!c.payerId || !par.payerId || c.payerId === par.payerId) &&
        (!c.projectId || c.projectId === par.projectId)
    )
    .map((c) => ({ value: c.id, label: c.code, hint: c.name }));

  return { options, error };
}

export function FinanceAmendBudgetLine({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  const [codeId, setCodeId] = useState(par.budgetCodeId ?? "");
  const [note, setNote] = useState(par.budgetCodeNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { options, error: codesError } = useAmendableBudgetCodes(par, open);

  if (!open) {
    return <EditTrigger label="Schimbă linia de buget" onClick={() => setOpen(true)} />;
  }

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
        options={options}
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
      {(error || codesError) && <p className="text-xs text-destructive">{error ?? codesError}</p>}
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
export function FinanceAddendum({
  par,
  onSaved,
  alwaysOpen = false,
}: FinanceAmendProps & { alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen);
  const [kind, setKind] = useState<ParAttachmentKind>("other");
  const [kindOther, setKindOther] = useState("Act adițional");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"compress" | "upload" | "finalize" | null>(null);
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
      if (!alwaysOpen) setOpen(false);
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
          {busy ? (step === "finalize" ? "Se verifică…" : step === "compress" ? "Se pregătește…" : "Se încarcă…") : "Alege fișierul"}
        </Button>
        {!alwaysOpen && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>
            Renunță
          </Button>
        )}
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

// ─── Doar verificatorul: evenimentul și data necesară ─────────────────────────
//
// Verificatorul solicitantului corectează cererea ÎNAINTE de aprobatori (server/lib/par/
// requesterVerifier.ts), deci are două câmpuri în plus față de finanțe: evenimentul (atribuirea
// cheltuielii, alături de linia de buget) și data necesară. Sumele și beneficiarul nu — pentru ele
// cererea se întoarce la solicitant.

export function AmendEvent({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ParEvent[]>([]);
  const [eventId, setEventId] = useState(par.eventId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listEvents(par.projectId)
      .then((r) => {
        // Aceeași regulă ca pe server: un eveniment legat de alt proiect nu merge pe cererea asta.
        if (alive) setEvents(r.events.filter((ev) => ev.active && (!ev.projectId || ev.projectId === par.projectId)));
      })
      .catch(() => { if (alive) setError("Lista evenimentelor nu s-a încărcat."); });
    return () => { alive = false; };
  }, [open, par.projectId]);

  if (!open) {
    return <EditTrigger label={par.eventId ? "Schimbă evenimentul" : "Alege evenimentul"} onClick={() => setOpen(true)} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePar(par.id, { event_id: eventId || null });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(errorText(err, "Evenimentul nu a putut fi schimbat."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2" aria-label="Schimbă evenimentul">
      <Select aria-label="Eveniment" value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="">Fără eveniment</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AmendActions busy={busy} onCancel={() => { setOpen(false); setError(null); }} />
    </form>
  );
}

export function AmendDateNeeded({ par, onSaved }: FinanceAmendProps) {
  const [open, setOpen] = useState(false);
  // `DateField` lucrează cu „YYYY-MM-DD" (afișează zi.lună.an); serverul primește ISO, ca formularul.
  const [value, setValue] = useState(par.dateNeeded ? par.dateNeeded.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <EditTrigger label="Schimbă data" onClick={() => setOpen(true)} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePar(par.id, { date_needed: value ? new Date(value).toISOString() : null });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(errorText(err, "Data nu a putut fi schimbată."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2" aria-label="Schimbă data necesară">
      <DateField
        aria-label="Data necesară"
        className="sm:max-w-[11.5rem]"
        value={value}
        min={par.dateOfRequest ? par.dateOfRequest.slice(0, 10) : undefined}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AmendActions busy={busy} onCancel={() => { setOpen(false); setError(null); }} />
    </form>
  );
}

// ─── Panoul întreg, pentru coada de finanțe ──────────────────────────────────

/**
 * Aceleași completări, dar într-un singur formular — pentru omul de la finanțe, care lucrează din
 * COADĂ, nu din fișa cererii (owner, 23.09.2026: „eu nu văd la coada finanțe să pot edita ceva").
 * Acolo, a deschide fiecare cerere ca să corectezi o linie de buget înseamnă un drum dus-întors
 * pentru fiecare rând; aici se corectează pe loc, cu o singură salvare.
 */
export function FinanceAmendPanel({
  par,
  onSaved,
  onClose,
}: FinanceAmendProps & { onClose: () => void }) {
  const [codeId, setCodeId] = useState(par.budgetCodeId ?? "");
  const [note, setNote] = useState(par.budgetCodeNote ?? "");
  const [endUse, setEndUse] = useState(par.endUse ?? "");
  const [attNote, setAttNote] = useState(par.attachmentsNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { options, error: codesError } = useAmendableBudgetCodes(par, true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Trimitem DOAR ce s-a schimbat: serverul refuză orice câmp din afara listei albe, iar un
      // formular care retrimite tot ar scrie în jurnal modificări care n-au avut loc.
      const payload: Record<string, string | null> = {};
      const nextNote = note.trim() ? note.trim() : null;
      const nextEndUse = endUse.trim() ? endUse.trim() : null;
      const nextAttNote = attNote.trim() ? attNote.trim() : null;
      if ((codeId || null) !== (par.budgetCodeId ?? null)) payload.budget_code_id = codeId || null;
      if (nextNote !== (par.budgetCodeNote ?? null)) payload.budget_code_note = nextNote;
      if (nextEndUse !== (par.endUse ?? null)) payload.end_use = nextEndUse;
      if (nextAttNote !== (par.attachmentsNote ?? null)) payload.attachments_note = nextAttNote;

      if (Object.keys(payload).length) await updatePar(par.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err, "Completarea nu a putut fi salvată."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="amend-bc" className="block text-sm font-medium text-foreground">
          Linia de buget
        </label>
        <Combobox
          id="amend-bc"
          aria-label="Linia de buget"
          value={codeId}
          onChange={setCodeId}
          options={options}
          placeholder="Caută după cod sau denumire…"
          emptyText="Niciun cod bugetar potrivit cererii"
        />
        <Input
          aria-label="Notă la linia de buget"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notă la linia de buget (opțional)"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="amend-enduse" className="block text-sm font-medium text-foreground">
          Descrierea utilizării finale
        </label>
        <Textarea
          id="amend-enduse"
          aria-label="Descrierea utilizării finale"
          value={endUse}
          rows={3}
          maxLength={5000}
          onChange={(e) => setEndUse(e.target.value)}
          placeholder="Ce s-a cumpărat și pentru ce se folosește."
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="amend-attnote" className="block text-sm font-medium text-foreground">
          Nota anexelor
        </label>
        <Textarea
          id="amend-attnote"
          aria-label="Nota anexelor"
          value={attNote}
          rows={2}
          maxLength={2000}
          onChange={(e) => setAttNote(e.target.value)}
          placeholder="ex. Act adițional nr. 2 din 12.09.2026 la contractul nr. 41."
        />
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-foreground">Acte adiționale la dosar</p>
        <FinanceAddendum par={par} onSaved={onSaved} alwaysOpen />
      </div>

      {(error || codesError) && <p className="text-sm text-destructive">{error ?? codesError}</p>}
      <p className="text-xs text-muted-foreground">
        Sumele, liniile și rechizitele beneficiarului rămân cele semnate — nu se pot schimba de aici.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Renunță
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Salvează
        </Button>
      </div>
    </form>
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

/**
 * Corecturile verificatorului, lângă semnături: aprobatorii văd că cererea a fost corectată
 * înainte să ajungă la ei, iar solicitantul vede ce i s-a schimbat și cine a schimbat.
 */
export function VerifierAmendNotice({
  amendments,
}: {
  amendments: NonNullable<ParDetail["verifier_amendments"]>;
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
      Corectată la verificare{last.byName ? ` de ${last.byName}` : ""}
      {whenText ? `, ${whenText}` : ""}
      {fields.length ? `: ${fields.join(", ")}` : ""}. Sumele și beneficiarul sunt cele depuse de solicitant.
    </p>
  );
}
