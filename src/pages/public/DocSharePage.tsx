/**
 * Actul, așa cum îl vede CLIENTUL — pagina publică a unui link de act.
 * Rută: `/#/act/:token`
 *
 * PUBLICĂ, fără gardă de sesiune: clientul nu are cont în FinFlow și nu trebuie să-și facă unul ca
 * să citească oferta primită. Un ecran de login aici ar face linkul inutil exact pentru cine
 * trebuie să-l deschidă.
 *
 * Deschiderea paginii e semnalul „Vizualizat" din CRM (cerința 42). De-aceea pagina nu preîncarcă
 * nimic și nu se cere singură de două ori: fiecare deschidere pe care o numără trebuie să fie o
 * deschidere adevărată, făcută de un om.
 *
 * Se citește pe telefon, fiindcă de pe telefon se deschid linkurile din e-mail: o coloană,
 * tabelul de poziții cu derulare proprie, corpul actului randat ca text, nu ca imagine.
 */
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { api } from "@/lib/api";

interface SharedDocLine {
  position: number;
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  vatPercent: number;
}

interface SharedDoc {
  title: string;
  kind: string;
  docNumber: string | null;
  docDate: string;
  status: string;
  counterpartyName: string | null;
  totalCents: number;
  currency: string;
  bodyHtml: string;
  lines: SharedDocLine[];
  /** CRM-D06: clientul poate accepta / refuza de aici. */
  canRespond?: boolean;
  response?: { decision: "accepted" | "declined"; name: string | null; at: string } | null;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ro-MD", { style: "currency", currency }).format((cents ?? 0) / 100);
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${currency}`;
  }
}

function tokenFromHash(): string {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const match = hash.match(/#\/act\/([^/?#]+)/);
  return match ? match[1] : "";
}

export function DocSharePage() {
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = tokenFromHash();
    if (!token) {
      setFailed(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api<SharedDoc>(`/api/public/doc/${encodeURIComponent(token)}`)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă documentul..." />
      </div>
    );
  }

  if (failed || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">Linkul nu mai este valabil</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Documentul a fost retras sau linkul a expirat. Cere-i persoanei de contact un link nou — durează câteva
            secunde.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-start gap-3">
          <FileText className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{doc.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {doc.docNumber ? `Nr. ${doc.docNumber} · ` : ""}
              {new Date(doc.docDate).toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" })}
              {doc.counterpartyName ? ` · pentru ${doc.counterpartyName}` : ""}
            </p>
          </div>
        </header>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          {/* Corpul vine randat de pe server, fără acolade necompletate (`blanks.ts`). Conținutul
              e curățat la salvare (`sanitizeTemplateHtml`), deci aici se afișează ca atare. */}
          <div
            className="doc-body prose-sm max-w-none text-sm leading-relaxed text-foreground [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mb-2 [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2"
            dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
          />

          {/* Tabelul pozițiilor e deja în corpul actului (șabloanele îl conțin) — îl arătăm separat
              doar pentru un act fără el, altfel clientul vedea aceleași rânduri de două ori. */}
          {doc.lines.length > 0 && !/<table/i.test(doc.bodyHtml) && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted text-left">
                    <th className="border border-border p-2">Nr.</th>
                    <th className="border border-border p-2">Denumire</th>
                    <th className="border border-border p-2">UM</th>
                    <th className="border border-border p-2 text-right">Cant.</th>
                    <th className="border border-border p-2 text-right">Preț</th>
                    <th className="border border-border p-2 text-right">Sumă</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((line) => (
                    <tr key={line.position}>
                      <td className="border border-border p-2 text-center">{line.position}</td>
                      <td className="border border-border p-2">{line.description}</td>
                      <td className="border border-border p-2 text-center">{line.unit}</td>
                      <td className="border border-border p-2 text-right tabular-nums">{line.quantity}</td>
                      <td className="border border-border p-2 text-right tabular-nums">
                        {money(line.unitPriceCents, doc.currency)}
                      </td>
                      <td className="border border-border p-2 text-right tabular-nums">
                        {money(line.lineTotalCents, doc.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-6 text-right text-base font-semibold text-foreground">
            Total: {money(doc.totalCents, doc.currency)}
          </p>
        </article>

        {doc.response ? (
          <ResponseDone response={doc.response} />
        ) : doc.canRespond ? (
          <RespondForm
            title={doc.title}
            kind={doc.kind}
            onDone={(response) => setDoc({ ...doc, canRespond: false, response })}
          />
        ) : null}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pentru întrebări sau modificări, răspunde la e-mailul prin care ai primit acest link.
        </p>
      </div>
    </div>
  );
}

// ─── CRM-D06: răspunsul clientului ───────────────────────────────────────────

type SharedResponse = NonNullable<SharedDoc["response"]>;

function ResponseDone({ response }: { response: SharedResponse }) {
  const accepted = response.decision === "accepted";
  const when = new Date(response.at).toLocaleString("ro-MD", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card p-5" role="status">
      {accepted ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div>
        <p className="font-medium text-foreground">{accepted ? "Documentul a fost acceptat" : "Documentul a fost refuzat"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {response.name ? `${response.name} · ` : ""}
          {when}
        </p>
      </div>
    </section>
  );
}

interface RespondFormProps {
  title: string;
  kind: string;
  onDone: (response: SharedResponse) => void;
}

function RespondForm({ title, kind, onDone }: RespondFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === "oferta_comerciala" ? "oferta" : "documentul";

  async function send(decision: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const token = tokenFromHash();
      const res = await api<{ response: SharedResponse }>(`/api/public/doc/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        body: JSON.stringify({ decision, name, email: email || null, reason: decision === "decline" ? reason : null }),
      });
      onDone(res.response);
    } catch (err) {
      const body = (err as { body?: { message?: string } }).body;
      setError(body?.message ?? "Nu am putut trimite răspunsul. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(declining ? "decline" : "accept");
  }

  const nameOk = name.trim().length >= 3;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Răspunsul tău">
      <div>
        <h2 className="text-base font-semibold text-foreground">Răspunsul tău</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Numele tău complet ține loc de semnătură. Păstrăm data, ora și amprenta documentului acceptat.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Numele tău complet</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">E-mail (opțional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground"
          />
        </label>
      </div>

      {declining ? (
        <label className="block text-sm">
          <span className="font-medium text-foreground">De ce refuzi?</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-foreground"
          />
        </label>
      ) : (
        <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Am citit și accept {noun} „{title}".</span>
        </label>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {declining ? (
          <>
            <button
              type="submit"
              disabled={busy || !nameOk || !reason.trim()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Trimite refuzul
            </button>
            <button type="button" onClick={() => setDeclining(false)} className="h-11 px-3 text-sm font-medium text-primary">
              Înapoi
            </button>
          </>
        ) : (
          <>
            <button
              type="submit"
              disabled={busy || !nameOk || !agree}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Accept {noun}
            </button>
            <button type="button" onClick={() => setDeclining(true)} className="h-11 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
              Refuz
            </button>
          </>
        )}
      </div>
    </form>
  );
}
