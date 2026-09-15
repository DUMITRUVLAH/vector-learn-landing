/**
 * CRM → API: cheile de acces pentru integrări externe și cum se folosesc (cerințele 64 și 71).
 *
 * Ecranul are două treburi, în ordinea asta:
 *  1. **să arate cheia o singură dată, fără ambiguitate.** După creare, valoarea în clar nu mai
 *     există nicăieri — nici în bază, nici pe server. Dacă omul închide caseta fără s-o copieze,
 *     face alta. Asta se scrie pe ecran, nu se lasă de înțeles.
 *  2. **să spună concret cum se conectează Power BI sau Excel.** O listă de chei fără exemplul de
 *     conectare e o funcție pe care o folosește doar cine a scris-o.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Dialog, EmptyState, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyRow } from "@/lib/api/apiKeys";

const BASE_URL = typeof window === "undefined" ? "" : window.location.origin;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CrmApiPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Cheia proaspăt creată — trăiește doar în starea ecranului, până la închiderea casetei. */
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await listApiKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca cheile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const created = await createApiKey(name.trim());
      setFreshKey(created.key);
      setName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cheia nu a putut fi creată.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyRow) {
    if (!window.confirm(`Revoci cheia „${key.name}”? Integrările care o folosesc se opresc imediat.`)) return;
    try {
      await revokeApiKey(key.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cheia nu a putut fi revocată.");
    }
  }

  async function copyFresh() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocat (context nesigur, permisiune refuzată): cheia rămâne pe ecran, se poate
      // selecta cu mâna. Un buton care tace ar fi mai rău decât unul care nu face nimic vizibil.
    }
  }

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <BusinessShell
      pageTitle="API"
      pageDescription="Chei de acces pentru integrări externe și pentru conectarea unui instrument de raportare."
      actions={
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Cheie nouă
        </Button>
      }
    >
      {error && (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />} className="mb-4">
          {error}
        </Alert>
      )}

      {/* Cheia proaspătă, o singură dată. Sus, nu jos: e singurul moment în care există. */}
      {freshKey && (
        <Alert className="mb-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Copiaz-o acum — nu se mai poate vedea niciodată.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="select-all break-all rounded-md bg-muted px-2 py-1 font-mono text-sm">{freshKey}</code>
              <Button variant="outline" size="sm" onClick={() => void copyFresh()}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? "Copiat" : "Copiază"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFreshKey(null)}>
                Am copiat-o
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              În bază rămâne doar amprenta ei. Dacă o pierzi, revoci cheia asta și faci alta — nimic nu se strică.
            </p>
          </div>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă cheile..." />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title="Nicio cheie încă"
          description="O cheie lasă un instrument extern (Power BI, Excel, un script) să CITEASCĂ datele comerciale ale workspace-ului. Nu poate scrie nimic."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Cheie nouă
            </Button>
          }
        />
      ) : (
        <Table aria-label={`Chei de API — ${active.length} active`}>
          <TableHeader>
            <TableRow>
              <TableHead>Nume</TableHead>
              <TableHead>Început</TableHead>
              <TableHead>Creată</TableHead>
              <TableHead>Folosită ultima dată</TableHead>
              <TableHead>Stare</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{key.prefix}…</code>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(key.lastUsedAt)}</TableCell>
                <TableCell>
                  {key.revokedAt ? (
                    <Badge variant="secondary">Revocată</Badge>
                  ) : (
                    <Badge variant="success">Activă</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!key.revokedAt && (
                    <Button variant="ghost" size="icon" aria-label={`Revocă cheia ${key.name}`} onClick={() => void revoke(key)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Cum se folosește — fără asta, ecranul e o listă de chei fără rost. */}
      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Cum conectezi un instrument extern</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          API-ul e <strong>doar de citire</strong>: o cheie pierdută nu poate schimba nimic în bază. Limita e de 120 de
          cereri pe minut per cheie.
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">Adresa</dt>
            <dd>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{BASE_URL}/api/public/v1</code>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Documentația (OpenAPI 3.1)</dt>
            <dd>
              <a
                className="text-primary underline"
                href={`${BASE_URL}/api/public/v1/openapi.json`}
                target="_blank"
                rel="noreferrer"
              >
                {BASE_URL}/api/public/v1/openapi.json
              </a>
              <span className="text-muted-foreground"> — se poate importa în Postman, Insomnia sau într-un generator de client.</span>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Exemplu</dt>
            <dd>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
{`curl -H "X-API-Key: fk_..." \\
  "${BASE_URL}/api/public/v1/leads?pageSize=100"`}
              </pre>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">În Power BI / Excel</dt>
            <dd className="text-muted-foreground">
              Obține date → Web → Avansat, adresa de mai sus, iar la „Parametri de antet” pui
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">X-API-Key</code>
              cu valoarea cheii. Pentru reîmprospătare incrementală, adaugă
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">?updatedSince=2026-01-01T00:00:00Z</code>
              — trage doar ce s-a schimbat.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Ce se poate citi</dt>
            <dd className="text-muted-foreground">
              Leaduri, firme, produse, pâlnii cu etape, oameni, taskuri, acte și un rezumat agregat
              (<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/reports/summary</code>) cu conversia și
              forecastul ponderat.
            </dd>
          </div>
        </dl>
      </section>

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Cheie nouă"
        description="Dă-i un nume din care să se înțeleagă unde e folosită — „Power BI finanțe”, nu „cheie 2”."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={busy}>
              Renunță
            </Button>
            <Button onClick={() => void create()} disabled={busy || name.trim().length < 2}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Creează
            </Button>
          </>
        }
      >
        <Label htmlFor="crm-api-key-name">Numele cheii</Label>
        <Input
          id="crm-api-key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Power BI — raport vânzări"
          autoFocus
        />
      </Dialog>
    </BusinessShell>
  );
}
