/**
 * CRM — formularele de captare de pe site (cerința 68 din caietul de sarcini).
 *
 * Ecranul dă două lucruri: tokenul formularului și codul gata de lipit în pagină. Fără al doilea,
 * „ai un token" e o sarcină pentru programatorul clientului; cu el, e o operație de copy-paste.
 *
 * Tokenul se arată în clar, înadins: e public prin natura lui (stă în JavaScriptul paginii) și nu
 * autorizează decât crearea unui lead. A-l ascunde ar sugera un secret pe care nu-l are.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Input, Label, Select, Switch } from "@/components/ds";
import {
  listCrmCaptureSources,
  createCrmCaptureSource,
  updateCrmCaptureSource,
  deleteCrmCaptureSource,
  type CrmCaptureSource,
  type CrmPipeline,
} from "@/lib/api/crm";

export interface CaptureSourcesPanelProps {
  pipelines: readonly CrmPipeline[];
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  webform: "Formular web",
  facebook_ad: "Facebook Ads",
  google_ads: "Google Ads",
  referral: "Recomandare",
  instagram: "Instagram",
  other: "Altă sursă",
};

/** Codul pe care clientul îl pune în pagina lui. Fetch simplu, fără bibliotecă. */
function snippetFor(token: string, origin: string): string {
  return `<form id="cerere-oferta">
  <input name="fullName" placeholder="Nume" required />
  <input name="phone" placeholder="Telefon" />
  <input name="email" type="email" placeholder="Email" />
  <textarea name="message" placeholder="Ce vă interesează?"></textarea>
  <label><input type="checkbox" name="consent" required /> Sunt de acord cu prelucrarea datelor</label>
  <button type="submit">Trimite</button>
</form>
<script>
document.getElementById("cerere-oferta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const u = new URLSearchParams(location.search);
  await fetch("${origin}/api/crm/intake/webform", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: "${token}",
      fullName: f.get("fullName"),
      phone: f.get("phone"),
      email: f.get("email"),
      message: f.get("message"),
      utmSource: u.get("utm_source"),
      utmMedium: u.get("utm_medium"),
      utmCampaign: u.get("utm_campaign"),
      gclid: u.get("gclid"),
      fbclid: u.get("fbclid"),
      consentText: "Sunt de acord cu prelucrarea datelor",
      consentAt: new Date().toISOString(),
    }),
  });
  e.target.reset();
  alert("Mulțumim! Vă contactăm în scurt timp.");
});
</script>`;
}

export function CaptureSourcesPanel({ pipelines, onToast }: CaptureSourcesPanelProps) {
  const [items, setItems] = useState<CrmCaptureSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [source, setSource] = useState("webform");
  const [pipelineId, setPipelineId] = useState("");
  const [origins, setOrigins] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [openSnippet, setOpenSnippet] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCrmCaptureSources();
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setCreating(true);
    try {
      const created = await createCrmCaptureSource({
        name: clean,
        defaultSource: source,
        pipelineId: pipelineId || null,
        allowedOrigins: origins
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      });
      setItems((prev) => [...prev, created]);
      setName("");
      setOrigins("");
      setOpenSnippet(created.id);
      onToast({ kind: "success", message: "Formular creat. Copiază codul și pune-l în pagină." });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut crea formularul." });
    } finally {
      setCreating(false);
    }
  }

  async function toggle(item: CrmCaptureSource, active: boolean) {
    try {
      await updateCrmCaptureSource(item.id, { active });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active } : i)));
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut schimba starea." });
    }
  }

  async function remove(item: CrmCaptureSource) {
    if (!confirm(`Ștergi formularul „${item.name}”? Pagina care îl folosește nu va mai putea trimite leaduri.`)) return;
    try {
      await deleteCrmCaptureSource(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge formularul." });
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      onToast({ kind: "error", message: "Nu am putut copia. Selectează textul manual." });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă formularele..." />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Formulare de pe site</h2>
        <p className="text-sm text-muted-foreground">
          Leadurile intră direct în pâlnie, cu sursa și campania din care au venit — fără ca cineva să le copieze
          din email.
        </p>
      </div>

      {items.length === 0 ? (
        <Alert>
          Niciun formular încă. Creează unul mai jos și pune codul în pagina de contact — de acolo încolo, fiecare
          cerere ajunge singură în CRM.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <Badge variant="secondary">{SOURCE_LABELS[item.defaultSource] ?? item.defaultSource}</Badge>
                    {!item.active && <Badge variant="secondary">oprit</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.leadsCaptured} {item.leadsCaptured === 1 ? "lead adus" : "leaduri aduse"}
                    {item.lastCaptureAt &&
                      ` · ultimul pe ${new Date(item.lastCaptureAt).toLocaleDateString("ro-MD", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}`}
                    {item.allowedOrigins.length > 0 && ` · doar de pe ${item.allowedOrigins.join(", ")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={item.active}
                    onChange={(next) => void toggle(item, next)}
                    aria-label={`Pornit/oprit pentru ${item.name}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenSnippet((cur) => (cur === item.id ? null : item.id))}
                    aria-expanded={openSnippet === item.id}
                  >
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    Cod pentru site
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Șterge formularul ${item.name}`} onClick={() => void remove(item)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {openSnippet === item.id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    {/* `<pre>` nu poate fi eticheta unui `<label htmlFor>` (nu e element de
                        formular) — eticheta accesibilă stă pe el, prin aria-label. */}
                    <p className="text-xs font-medium text-foreground" id={`snippet-label-${item.id}`}>
                      Lipește în pagina de contact
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copy(snippetFor(item.token, window.location.origin), item.id)}
                    >
                      {copied === item.id ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copied === item.id ? "Copiat" : "Copiază"}
                    </Button>
                  </div>
                  <pre
                    id={`snippet-${item.id}`}
                    aria-label="Lipește în pagina de contact"
                    aria-labelledby={`snippet-label-${item.id}`}
                    className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-foreground"
                  >
                    {snippetFor(item.token, window.location.origin)}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="capture-name" required>
              Formular nou
            </Label>
            <Input
              id="capture-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Cerere ofertă — pagina Contact"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="capture-source">Sursa leadurilor</Label>
            <Select id="capture-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          {pipelines.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="capture-pipeline">Intră în pâlnia</Label>
              <Select id="capture-pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">— implicita —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="capture-origins">Domenii permise (opțional)</Label>
            <Input
              id="capture-origins"
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
              placeholder="https://ecosolar.md"
            />
          </div>
        </div>
        <Button className="w-fit" onClick={() => void create()} disabled={!name.trim() || creating}>
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          Creează formularul
        </Button>
      </div>
    </section>
  );
}
