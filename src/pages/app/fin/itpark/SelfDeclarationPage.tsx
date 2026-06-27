/**
 * ITPARK-502: Declarație pe proprie răspundere (decl_self_responsibility)
 * Route: /app/fin/itpark/:id/declaratie
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 *
 * Pre-filled: administrator, SRL name, legal address, fiscal code, period,
 * art. 312 Cod Penal + art. 18(1) Legea 77/2016, 5 negated situations.
 */

import { useState, useEffect } from "react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import { getDoc, upsertDoc } from "@/lib/api/itparkDocs";

function useEngagementId(): string {
  const { path } = useRouter();
  const match = path.match(/^\/app\/fin\/itpark\/([^/]+)\/declaratie$/);
  return match ? match[1] : "";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtPeriod(start: string, end: string): string {
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" });
    } catch { return iso; }
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function generateDeclBody(engagement: ItparkEngagement): { body: string; administrator: string; date: string } {
  const { residentName, idno, periodStart, periodEnd, legalAddress, reportingYear } = engagement;
  const administrator = residentName;
  const period = fmtPeriod(periodStart, periodEnd);
  const addr = legalAddress || "adresă juridică nespecificată";
  const body = `DECLARAȚIE PE PROPRIE RĂSPUNDERE

Subsemnatul/subsemnata, ${administrator}, în calitate de Reprezentant legal/Administrator al ${residentName} (cod fiscal ${idno}), cu sediul juridic la adresa: ${addr},

declarăm pe proprie răspundere că, în perioada ${period} de deținere a statutului de rezident al Parcului Tehnologic IT:

1. Societatea nu s-a aflat în stare de insolvabilitate sau faliment și nu a fost inițiată nicio procedură în acest sens în conformitate cu legislația în vigoare;

2. Societatea nu a inițiat și nu se află în proces de lichidare voluntară sau forțată a activității;

3. Societatea nu a fost supusă restructurării judiciare și nu există hotărâri judecătorești definitive privind restructurarea obligatorie;

4. Societatea nu a suspendat activitatea de bază eligibilă Parcului Tehnologic IT pe perioada menționată;

5. Nu au fost inițiate proceduri legale cu impact semnificativ asupra continuității activității societății sau asupra statutului de rezident IT Park.

Prezenta declarație este dată în conformitate cu prevederile art. 312 din Codul Penal al Republicii Moldova și art. 18 alin. (1) din Legea nr. 77 din 21 aprilie 2016 cu privire la parcurile de tehnologii ale informației, cunoscând consecințele juridice ale declarației false.

Declarația este emisă pentru a fi anexată la dosarul de verificare MITP pentru anul ${reportingYear}.`;
  return { body, administrator, date: todayISO() };
}

function StatusBadge({ status }: { status: "draft" | "ready" | "exported" }) {
  const classes = { draft: "bg-muted text-muted-foreground", ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", exported: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" }[status];
  const labels = { draft: "Ciornă", ready: "Gata", exported: "Exportat" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>{labels[status]}</span>;
}

export function SelfDeclarationPage() {
  const id = useEngagementId();
  const [engagement, setEngagement] = useState<ItparkEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [date, setDate] = useState(todayISO());
  const [administrator, setAdministrator] = useState("");
  const [status, setStatus] = useState<"draft" | "ready" | "exported">("draft");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDoc(id, "decl_self_responsibility")
      .then(({ doc, engagement: eng }) => {
        setEngagement(eng);
        if (doc && doc.dataJson) {
          const saved = doc.dataJson as { body?: string; date?: string; administrator?: string };
          setBody(saved.body || "");
          setDate(saved.date || todayISO());
          setAdministrator(saved.administrator || "");
          setStatus(doc.status as "draft" | "ready" | "exported");
        } else {
          const decl = generateDeclBody(eng);
          setBody(decl.body);
          setDate(decl.date);
          setAdministrator(decl.administrator);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (newStatus?: "draft" | "ready") => {
    if (!id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await upsertDoc(id, "decl_self_responsibility", { dataJson: { body, date, administrator }, status: newStatus ?? status });
      if (newStatus) setStatus(newStatus);
      setSaveMsg("Salvat");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Eroare");
    } finally { setSaving(false); }
  };

  if (!id) return <BusinessShell><div className="p-4 text-destructive" role="alert">ID dosar lipsă</div></BusinessShell>;

  if (loading) {
    return <BusinessShell><div className="flex items-center justify-center min-h-64" aria-busy="true"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" /></div></BusinessShell>;
  }

  if (error) {
    return <BusinessShell><div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive m-4" role="alert"><p className="font-medium">Eroare</p><p className="text-sm mt-1">{error}</p></div></BusinessShell>;
  }

  return (
    <BusinessShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Navigare" className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
          <a href={`#/app/fin/itpark/${id}`} className="hover:text-foreground hover:underline">{engagement?.residentName ?? "Dosar"}</a>
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-foreground font-medium">Declarație pe proprie răspundere</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">Declarație pe proprie răspundere</h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">art. 312 Cod Penal + art. 18(1) Legea 77/2016 — pre-completată</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saveMsg && <span className={`text-sm ${saveMsg === "Salvat" ? "text-green-600 dark:text-green-400" : "text-destructive"}`} aria-live="polite">{saveMsg}</span>}
            <button onClick={() => handleSave("draft")} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60" aria-label="Salvează ca ciornă">
              {saving ? "Salvez..." : "Salvează ciornă"}
            </button>
            <button onClick={() => handleSave("ready")} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60" aria-label="Marchează ca gata">
              Marchează Gata
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Tipărire declarație">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Tipărire
            </button>
          </div>
        </div>

        {/* Date + signatory */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 print:border-none print:p-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="decl-date" className="block text-sm font-medium text-foreground mb-1">Data declarației</label>
              <input id="decl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-[44px]" />
            </div>
            <div>
              <label htmlFor="decl-admin" className="block text-sm font-medium text-foreground mb-1">Reprezentant legal / Administrator</label>
              <input id="decl-admin" type="text" value={administrator} onChange={(e) => setAdministrator(e.target.value)} placeholder="Numele administratorului" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-[44px]" />
            </div>
          </div>
        </div>

        {/* Declaration text */}
        <div className="rounded-xl border border-border bg-card p-4 print:border-none print:p-0">
          <label htmlFor="decl-body" className="block text-sm font-medium text-foreground mb-2 print:hidden">Text declarație (editabil)</label>
          <textarea id="decl-body" value={body} onChange={(e) => setBody(e.target.value)} rows={28} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary resize-y print:border-none print:font-sans print:text-base" aria-label="Textul declarației pe proprie răspundere" />
        </div>

        {/* Signature block */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 print:border-none print:p-0 print:mt-8">
          <h2 className="text-sm font-semibold text-foreground">Semnătură</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div><p className="text-sm text-muted-foreground">Data:</p><p className="text-sm font-medium text-foreground">{date}</p></div>
            <div>
              <p className="text-sm text-muted-foreground">Reprezentant legal / Administrator:</p>
              <p className="text-sm font-medium text-foreground">{administrator || "___________________"}</p>
              <div className="mt-6 border-t border-border pt-2 print:mt-8"><p className="text-xs text-muted-foreground">Semnătura și ștampila</p></div>
            </div>
          </div>
        </div>

        {/* Legal notice */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-4 print:hidden">
          <p className="text-xs text-amber-800 dark:text-amber-200"><strong>Notă:</strong> Semnătura originală este obligatorie pe documentul fizic. Conform art. 312 Cod Penal + art. 18(1) Legea 77/2016.</p>
        </div>
      </div>
    </BusinessShell>
  );
}
