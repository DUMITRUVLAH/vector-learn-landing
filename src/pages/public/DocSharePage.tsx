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
import { useEffect, useState } from "react";
import { FileText, Loader2, ShieldAlert } from "lucide-react";
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
            className="doc-body prose-sm max-w-none text-sm leading-relaxed text-foreground [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2"
            dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
          />

          {doc.lines.length > 0 && (
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pentru întrebări sau modificări, răspunde la e-mailul prin care ai primit acest link.
        </p>
      </div>
    </div>
  );
}
