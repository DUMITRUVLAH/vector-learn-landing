/**
 * PARVERIFY-001 — pagina publică de verificare a unui formular PAR tipărit.
 * Rută: `/#/verificare/par/:token[/:amprentă]`
 *
 * PUBLICĂ, fără gardă de sesiune. Cel care scanează codul de pe hârtie e de multe ori un contabil,
 * un auditor sau un furnizor — un ecran de login aici ar face QR-ul inutil exact pentru cine are
 * nevoie de el.
 *
 * Ce răspunde pagina, în ordinea în care se pun întrebările cu hârtia în mână: documentul e real?
 * ce scrie în platformă că s-a aprobat? cine a semnat și când? corespunde hârtia cu ce e acum în
 * sistem? Tot ce ține de plată (IBAN, IDNP, bancă, atașamente) lipsește din răspunsul serverului,
 * deci nu poate ajunge pe ecran nici din greșeală.
 *
 * Se citește pe telefon, pentru că de pe telefon se scanează: o singură coloană, ținte de atins cu
 * degetul, tabelul de linii cu derulare orizontală proprie.
 */
import { useEffect, useState } from "react";
import { BadgeCheck, ShieldAlert, ShieldX, Loader2, Clock, Ban, Search } from "lucide-react";
import {
  verifyParDocument,
  normalizeVerifyCode,
  VerifyError,
  type VerifyApproval,
  type VerifyFailure,
  type VerifyResult,
} from "@/lib/api/parVerify";

/** Starea cererii, în românește. Necunoscutele se arată ca atare, nu traduse aproximativ. */
const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  submitted: "Depusă",
  in_review: "În aprobare",
  approved: "Aprobată",
  rejected: "Respinsă",
  changes_requested: "Modificări cerute",
  paid: "Plătită",
  cancelled: "Anulată",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "Aprobat",
  rejected: "Respins",
  changes_requested: "Modificări cerute",
  pending: "În așteptare",
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ro-MD", { style: "currency", currency }).format(cents / 100);
  } catch {
    // O valută pe care Intl n-o cunoaște nu are voie să golească pagina de verificare.
    return `${(cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2 })} ${currency}`;
  }
}

function dateTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ro-MD", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function dateOnly(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ro-MD", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** „/#/verificare/par/<token>/<amprentă>" → cele două segmente. */
function parseHash(): { token: string | null; fingerprint: string | null } {
  const hash = window.location.hash.replace(/^#/, "").split("?")[0];
  const m = hash.match(/^\/verificare\/par\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return { token: null, fingerprint: null };
  return { token: decodeURIComponent(m[1]), fingerprint: m[2] ? decodeURIComponent(m[2]) : null };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}

const FAILURE_COPY: Record<VerifyFailure, { title: string; body: string }> = {
  invalid_code: {
    title: "Cod invalid",
    body: "Codul din link nu are forma unui cod de verificare. Verificați că ați tastat toate cele 16 caractere de sub codul QR.",
  },
  not_found: {
    title: "Document negăsit",
    body: "Nu există niciun formular PAR cu acest cod. Dacă l-ați tastat de mână, verificați caracterele; dacă l-ați scanat, cereți emitentului o copie nouă.",
  },
  revoked: {
    title: "Cod retras",
    body: "Acest cod de verificare a fost retras de administratorul organizației. Hârtia pe care o aveți nu mai este documentul curent — cereți o copie nouă înainte de a o folosi.",
  },
  rate_limited: {
    title: "Prea multe verificări",
    body: "S-au făcut prea multe verificări de pe această conexiune. Încercați din nou peste câteva minute.",
  },
  network: {
    title: "Verificare indisponibilă",
    body: "Nu am putut contacta serverul. Încercați din nou în câteva momente.",
  },
};

function ApprovalRow({ a }: { a: VerifyApproval }) {
  const approved = a.decision === "approved";
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{a.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{a.title ?? "—"}</p>
        </div>
        <span
          className={
            approved
              ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              : a.decision === "pending"
                ? "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                : "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
          }
        >
          {DECISION_LABELS[a.decision] ?? a.decision}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Data</dt>
        <dd>{approved ? dateTime(a.decidedAt) : "—"}</dd>
        <dt className="text-muted-foreground">Cod semnătură</dt>
        {/* Codul se compară caracter cu caracter cu cel tipărit în rubrica `Signature`: de aceea
            e monospațiat și nu se rupe pe două rânduri. */}
        <dd className="font-mono tracking-wide">{a.signatureCode ?? "—"}</dd>
      </dl>
    </li>
  );
}

/**
 * Introducerea codului cu mâna — pentru cel care nu poate scana: fotocopie cu QR-ul șters, telefon
 * fără cameră, ori codul citit la telefon de la cineva. Adresa `finflow.best/verify` e TIPĂRITĂ pe
 * formular, deci acest ecran e obligatoriu: fără el, instrucțiunea de pe hârtie ar fi o minciună.
 */
function CodeEntry() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeVerifyCode(value);
    if (!token) {
      setError("Codul are 16 caractere, grupate câte patru. Verificați ce ați tastat.");
      return;
    }
    // Fără amprentă: cine tastează codul n-are de unde ști versiunea tipărită, iar pagina va spune
    // doar ce e în platformă acum — corect, fără comparația pe care n-o poate face.
    window.location.hash = `/verificare/par/${token}`;
  };

  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-card p-6">
        <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-center text-xl font-semibold">Verificare document PAR</h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-muted-foreground">
          Introduceți codul tipărit sub codul QR de pe formular.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label htmlFor="par-verify-code" className="block text-xs text-muted-foreground">
            Cod de verificare
          </label>
          <input
            id="par-verify-code"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="K7M2-9QD4-3F8B-X2NV"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "par-verify-error" : undefined}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-base tracking-wider outline-none focus:ring-2 focus:ring-ring"
          />
          {error && (
            <p id="par-verify-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
          >
            Verifică
          </button>
        </form>
      </div>
    </Shell>
  );
}

export function ParVerifyPage() {
  const [{ token, fingerprint }] = useState(parseHash);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [failure, setFailure] = useState<VerifyFailure | null>(null);

  useEffect(() => {
    // Un link scanat nu trebuie să ajungă niciodată într-un index de căutare. Serverul trimite deja
    // `X-Robots-Tag` pe API; eticheta de aici acoperă pagina însăși.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    verifyParDocument(token, fingerprint ?? undefined)
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((err) => {
        if (!alive) return;
        setFailure(err instanceof VerifyError ? err.reason : "network");
      });
    return () => {
      alive = false;
    };
  }, [token, fingerprint]);

  // Fără cod în adresă, ecranul cere unul — nu e o eroare, e intrarea normală pentru cine tastează.
  if (!token) return <CodeEntry />;

  if (failure) {
    const copy = FAILURE_COPY[failure];
    return (
      <Shell>
        <div role="alert" className="rounded-2xl border border-border bg-card p-6 text-center">
          {failure === "revoked" ? (
            <Ban className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          ) : (
            <ShieldX className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          )}
          <h1 className="mt-3 text-xl font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-16" aria-live="polite" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">Se verifică documentul…</p>
        </div>
      </Shell>
    );
  }

  const { par } = result;
  const approvedCount = par.approvals.filter((a) => a.decision === "approved").length;

  return (
    <Shell>
      <header className="mb-6 text-center">
        <BadgeCheck className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold sm:text-2xl">Document înregistrat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {par.requestNo ?? "PAR"}
          {result.organization ? ` · ${result.organization}` : ""}
        </p>
      </header>

      {/* Avertismentul de versiune e primul lucru după titlu: dacă hârtia nu mai corespunde, restul
          paginii se citește altfel. `null` = hârtie tipărită înainte de a exista amprenta, caz în
          care o comparație inventată ar fi mai rea decât tăcerea. */}
      {result.matchesPrinted === true && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Hârtia pe care o aveți corespunde exact cu înregistrarea din platformă.
        </p>
      )}
      {result.matchesPrinted === false && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Documentul s-a schimbat de când a fost tipărită hârtia. Mai jos e starea de acum —
          folosiți-o pe aceasta, nu exemplarul tipărit.
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Stare</dt>
            <dd className="font-medium">{STATUS_LABELS[par.status] ?? par.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sumă totală</dt>
            <dd className="text-lg font-semibold">{money(par.totalEstimatedCents, par.currency)}</dd>
            {par.totalMdlCents !== null && par.currency !== "MDL" && (
              <dd className="text-xs text-muted-foreground">≈ {money(par.totalMdlCents, "MDL")}</dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Solicitant</dt>
            <dd>{par.requestedByName ?? "—"}</dd>
            {par.requestorTitle && <dd className="text-xs text-muted-foreground">{par.requestorTitle}</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Data cererii</dt>
            <dd>{dateOnly(par.dateOfRequest)}</dd>
          </div>
          {par.departmentName && (
            <div>
              <dt className="text-xs text-muted-foreground">Departament</dt>
              <dd>{par.departmentName}</dd>
            </div>
          )}
          {(par.projectName || par.eventName) && (
            <div>
              <dt className="text-xs text-muted-foreground">Proiect</dt>
              <dd>{[par.projectName, par.eventName].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Scop</dt>
            <dd className="whitespace-pre-wrap">{par.purpose}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Servicii / bunuri
        </h2>
        {/* Tabelul e singurul lucru mai lat decât ecranul unui telefon, deci derulează el, nu pagina. */}
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Descriere</th>
                <th scope="col" className="px-3 py-2 text-center font-medium">Cant.</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Preț</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {par.lineItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    Fără linii detaliate
                  </td>
                </tr>
              )}
              {par.lineItems.map((it, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{it.description}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {money(it.unitPriceCents, par.currency)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                    {money(it.lineTotalCents, par.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Aprobări ({approvedCount} din {par.approvals.length})
        </h2>
        <ul className="space-y-2">
          {par.approvals.length === 0 && (
            <li className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              Nicio aprobare înregistrată pentru acest document.
            </li>
          )}
          {par.approvals.map((a, i) => (
            <ApprovalRow key={`${a.step}-${i}`} a={a} />
          ))}
        </ul>
        {par.requestor && (
          <>
            <h2 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Depunere
            </h2>
            <ul>
              <ApprovalRow a={par.requestor} />
            </ul>
          </>
        )}
      </section>

      <footer className="mt-8 space-y-2 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Verificat la {dateTime(result.checkedAt)}
        </p>
        <p>
          Comparați codurile de mai sus cu cele tipărite în rubricile <em>Signature</em> ale
          formularului. Această pagină arată doar aprobările; datele de plată rămân în platformă.
        </p>
      </footer>
    </Shell>
  );
}
