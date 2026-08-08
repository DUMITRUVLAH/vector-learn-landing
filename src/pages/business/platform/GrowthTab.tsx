/**
 * PLATFORM-002 — fila „Creștere".
 *
 * Patru lucruri pe care marketingul nu le putea afla din produs:
 *
 *   1. **Pâlnia** înregistrare → logare → activare. „S-a logat" nu înseamnă nimic comercial;
 *      activarea (a emis o factură, a făcut o cerere) e singurul semn că produsul a prins.
 *   2. **Sursele** — ce canal aduce clienți ȘI câți dintre ei se activează. Un canal cu multe
 *      înregistrări și zero activări costă bani degeaba.
 *   3. **Adopția reală** — câte workspace-uri AU modulul pornit vs câte îl FOLOSESC. Diferența
 *      dintre cele două coloane e exact lista de funcționalități care arată bine în ofertă și
 *      nu se folosesc.
 *   4. **De sunat azi** — clienții unde un telefon chiar schimbă ceva, cu motivul scris.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, PhoneCall, TrendingUp } from "lucide-react";
import { getPlatformGrowth, type PlatformGrowth } from "@/lib/api/platform";
import {
  Alert,
  Badge,
  Card,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import { formatRelative } from "./format";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function GrowthTab() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<PlatformGrowth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getPlatformGrowth(days));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Se încarcă…
      </div>
    );
  }
  if (error || !data) return <Alert variant="destructive">Datele de creștere nu au putut fi încărcate.</Alert>;

  const { funnel } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Perioada analizată"
          className="max-w-[200px]"
        >
          <option value="30">Ultimele 30 zile</option>
          <option value="90">Ultimele 90 zile</option>
          <option value="180">Ultimele 6 luni</option>
          <option value="365">Ultimul an</option>
        </Select>
        <div className="flex-1" />
        <a
          href="/api/platform/growth/contacts.csv"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export contacte ({data.contactsAvailable})
        </a>
      </div>

      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          Pâlnia clienților noi
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Din câți își fac cont, câți intră măcar o dată și câți ajung să facă ceva real în produs.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FunnelStep label="Și-au făcut cont" value={funnel.signedUp} base={funnel.signedUp} />
          <FunnelStep label="S-au logat măcar o dată" value={funnel.loggedIn} base={funnel.signedUp} />
          <FunnelStep label="Au făcut ceva real" value={funnel.activated} base={funnel.signedUp} />
        </div>
        {funnel.signedUp > 0 && funnel.activated < funnel.loggedIn && (
          <p className="mt-4 text-sm text-muted-foreground">
            {funnel.loggedIn - funnel.activated} {funnel.loggedIn - funnel.activated === 1 ? "client a intrat" : "clienți au intrat"} în
            produs fără să ajungă la prima acțiune reală — acolo se pierde cel mai mult.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">De unde vin</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sursă</TableHead>
                <TableHead className="text-right">Conturi</TableHead>
                <TableHead className="text-right">Activate</TableHead>
                <TableHead className="text-right">Rată</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-medium text-foreground">{s.source}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.signups}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.activated}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {pct(s.activated, s.signups)}%
                  </TableCell>
                </TableRow>
              ))}
              {data.sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Niciun cont nou în perioada aleasă.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Sursa se ia din parametrii <code>utm_source</code> ai linkului. Trimite linkuri de forma{" "}
            <code>/#/business/signup?utm_source=linkedin</code> ca rândurile astea să însemne ceva.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Module: pornite vs folosite</h2>
          <ul className="space-y-3">
            {data.adoption.map((m) => (
              <li key={m.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{m.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {m.used} folosesc / {m.enabled} au acces
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct(m.used, Math.max(m.enabled, 1))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Un modul cu mulți „au acces" și puțini „folosesc" e ori nedescoperit, ori nu-i trebuie
            nimănui — merită aflat care din două înainte să-l mai pui în ofertă.
          </p>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          De sunat azi
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Ultima logare</TableHead>
              <TableHead>De ce</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.callList.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.contactEmail ? (
                    <a href={`mailto:${t.contactEmail}`} className="text-primary hover:underline">
                      {t.contactEmail}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{t.plan}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatRelative(t.lastLoginAt)}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {t.reasons.map((r) => (
                      <Badge key={r} variant="warning">
                        {r}
                      </Badge>
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {data.callList.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Niciun client care să aibă nevoie de o intervenție acum.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, base }: { label: string; value: number; base: number }) {
  const percentage = pct(value, base);
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-3xs font-semibold uppercase tracking-group text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{percentage}% din cei înscriși</p>
    </div>
  );
}
