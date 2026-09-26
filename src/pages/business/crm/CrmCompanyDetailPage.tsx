/**
 * Fișa unui client (firmă): datele ei, oportunitățile, oamenii de contact, sarcinile deschise,
 * actele și istoricul — tot pe un ecran, la `/business/crm/clienti/<id>`.
 *
 * Istoricul firmei e suma istoricelor lead-urilor ei (apeluri, notițe, emailuri, schimbări de
 * etapă), cel mai nou sus. Nu există o a doua cronologie de ținut în sincron: ce se scrie pe
 * lead apare aici.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  FileText,
  Globe,
  Info,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { CompanyFormDialog } from "@/components/crm/CompanyFormDialog";
import { Alert, Badge, Button, Card, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { Link, useRouter } from "@/router/HashRouter";
import { pipelineHref } from "@/lib/crm/pipelineUrl";
import { COMPANIES_LIST_PATH, companyIdFromPath } from "@/lib/crm/companyUrl";
import { crmDocPath } from "@/lib/docs/paths";
import { CRM_DOC_KIND_LABELS, CRM_DOC_STATUS_LABELS } from "@/lib/api/crmDocuments";
import { formatDate, formatRelative } from "@/lib/i18n/format";
import { getCrmCompanyOverview, type CrmCompanyOverview, type CrmDealOutcome } from "@/lib/api/crmCompanies";


function money(cents: number | null | undefined, currency = "MDL"): string {
  if (cents == null) return "—";
  return `${new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)} ${currency}`;
}

const ACTIVITY: Record<string, { label: string; icon: typeof Phone }> = {
  note: { label: "Notiță", icon: StickyNote },
  call: { label: "Apel", icon: Phone },
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  sms: { label: "SMS", icon: MessageSquare },
  meeting: { label: "Întâlnire", icon: Users },
  stage_change: { label: "Etapă schimbată", icon: ArrowRightLeft },
  system: { label: "Sistem", icon: Info },
};

const DIRECTION: Record<string, string> = { inbound: "primit", outbound: "trimis", internal: "" };

const OUTCOME_VARIANT: Record<CrmDealOutcome, "secondary" | "success" | "destructive"> = {
  open: "secondary",
  won: "success",
  lost: "destructive",
};

export function CrmCompanyDetailPage() {
  const { path } = useRouter();
  const id = companyIdFromPath(path);
  const [data, setData] = useState<CrmCompanyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getCrmCompanyOverview(id));
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 404 ? "Firma nu există sau nu e în acest workspace." : "Nu am putut încărca fișa clientului.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const company = data?.company;
  const subtitle = company
    ? [company.idno && `Cod fiscal ${company.idno}`, company.industry, company.region].filter(Boolean).join(" · ") ||
      "Fișa clientului"
    : "Fișa clientului";

  return (
    <BusinessShell pageTitle={company?.name ?? "Client"} pageDescription={subtitle}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={COMPANIES_LIST_PATH} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Toți clienții
          </Link>
          {company && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editează
            </Button>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading && !data ? (
          <div className="flex justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă fișa clientului" />
          </div>
        ) : data && company ? (
          <>
            <p className="text-sm text-muted-foreground">
              {data.stats.deals === 0 ? (
                "Nicio oportunitate încă."
              ) : (
                <>
                  <span className="text-foreground">{data.stats.deals}</span>{" "}
                  {data.stats.deals === 1 ? "oportunitate" : "oportunități"} ·{" "}
                  <span className="text-foreground">{data.stats.openDeals}</span> deschise, în valoare de{" "}
                  <span className="tabular-nums text-foreground">{money(data.stats.openValueCents)}</span>
                  {data.stats.wonValueCents > 0 && (
                    <>
                      {" "}· câștigat <span className="tabular-nums text-foreground">{money(data.stats.wonValueCents)}</span>
                    </>
                  )}
                </>
              )}
              {data.stats.lastActivityAt && <> · ultima activitate {formatRelative(data.stats.lastActivityAt, "ro")}</>}
            </p>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6">
                <Section title="Datele firmei">
                  <dl className="space-y-3 text-sm">
                    <Fact icon={Building2} label="Denumire" value={company.name} />
                    <Fact label="Cod fiscal" value={company.idno} mono />
                    <Fact label="Industrie" value={company.industry} />
                    <Fact label="Regiune" value={company.region} />
                    <Fact label="Mărime" value={company.companySize} />
                    <Fact
                      icon={Phone}
                      label="Telefon"
                      value={company.phone && <a className="hover:underline" href={`tel:${company.phone}`}>{company.phone}</a>}
                    />
                    <Fact
                      icon={Mail}
                      label="Email"
                      value={company.email && <a className="break-all hover:underline" href={`mailto:${company.email}`}>{company.email}</a>}
                    />
                    <Fact
                      icon={Globe}
                      label="Site"
                      value={
                        company.website && (
                          <a
                            className="break-all hover:underline"
                            href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {company.website}
                          </a>
                        )
                      }
                    />
                    <Fact icon={MapPin} label="Adresă" value={company.address} />
                    <Fact label="În CRM din" value={formatDate(company.createdAt, "ro")} />
                  </dl>
                  {company.notes && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="mb-1 text-sm font-medium">Notițe</p>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">{company.notes}</p>
                    </div>
                  )}
                </Section>

                <Section title="Persoane de contact" count={data.contacts.length}>
                  {data.contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Apar aici persoanele de pe oportunitățile firmei.</p>
                  ) : (
                    <ul className="space-y-3">
                      {data.contacts.map((p) => (
                        <li key={p.id} className="text-sm">
                          <p className="font-medium">
                            {p.fullName}
                            {p.isPrimary && (
                              <Badge variant="secondary" className="ml-2">
                                principal
                              </Badge>
                            )}
                          </p>
                          {p.role && <p className="text-muted-foreground">{p.role}</p>}
                          <p className="text-muted-foreground">
                            {[p.phone, p.email].filter(Boolean).join(" · ") || "fără date de contact"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <div className="space-y-6 lg:col-span-2">
                <Section title="Oportunități" count={data.deals.length}>
                  {data.deals.length === 0 ? (
                    <EmptyState
                      icon={<Building2 className="h-6 w-6" />}
                      title="Nicio oportunitate"
                      description="Când un lead are firma asta, apare aici, cu etapa și valoarea lui."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table aria-label="Oportunitățile firmei">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Oportunitate</TableHead>
                            <TableHead>Etapă</TableHead>
                            <TableHead>Responsabil</TableHead>
                            <TableHead className="text-right">Valoare</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.deals.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell>
                                <Link to={pipelineHref(d.id)} className="font-medium hover:underline">
                                  {d.dealName || d.fullName}
                                </Link>
                                {d.dealName && <span className="block text-xs text-muted-foreground">{d.fullName}</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant={OUTCOME_VARIANT[d.outcome]}>{d.stageLabel}</Badge>
                                {d.pipelineName && (
                                  <span className="block text-xs text-muted-foreground">{d.pipelineName}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{d.ownerName ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{money(d.valueCents)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Section>

                {data.tasks.length > 0 && (
                  <Section title="Sarcini deschise" count={data.tasks.length}>
                    <ul className="space-y-2">
                      {data.tasks.map((t) => {
                        const overdue = t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                        return (
                          <li key={t.id} className="flex items-start gap-3 text-sm">
                            <CalendarClock
                              className={overdue ? "mt-0.5 h-4 w-4 shrink-0 text-destructive" : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"}
                              aria-hidden="true"
                            />
                            <span className="flex-1">
                              <Link to={pipelineHref(t.leadId)} className="font-medium hover:underline">
                                {t.title}
                              </Link>
                              <span className="block text-muted-foreground">
                                {t.dueAt ? `${overdue ? "întârziată, " : ""}${formatDate(t.dueAt, "ro")}` : "fără termen"}
                                {t.leadName && ` · ${t.leadName}`}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                )}

                <Section title="Istoric activitate" count={data.activity.length}>
                  {data.activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Apelurile, notițele, emailurile și schimbările de etapă de pe oportunitățile firmei apar aici.
                    </p>
                  ) : (
                    <ol className="space-y-4">
                      {data.activity.map((a) => {
                        const kind = ACTIVITY[a.type] ?? ACTIVITY.system;
                        const Icon = kind.icon;
                        const dir = DIRECTION[a.direction];
                        return (
                          <li key={a.id} className="flex gap-3 text-sm">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {kind.label}
                                  {dir && ` ${dir}`}
                                </span>
                                {a.userName && ` · ${a.userName}`}
                                {a.leadName && (
                                  <>
                                    {" · "}
                                    <Link to={pipelineHref(a.leadId)} className="hover:underline">
                                      {a.leadName}
                                    </Link>
                                  </>
                                )}
                                {" · "}
                                <time dateTime={a.occurredAt} title={formatDate(a.occurredAt, "ro")}>
                                  {formatRelative(a.occurredAt, "ro")}
                                </time>
                              </p>
                              {a.body && <p className="mt-1 whitespace-pre-line break-words">{a.body}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Section>

                {data.documents.length > 0 && (
                  <Section title="Acte" count={data.documents.length}>
                    <ul className="space-y-2">
                      {data.documents.map((d) => (
                        <li key={d.id} className="flex items-start gap-3 text-sm">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="flex-1">
                            <Link to={crmDocPath(d.id)} className="font-medium hover:underline">
                              {d.title}
                              {d.docNumber && ` nr. ${d.docNumber}`}
                            </Link>
                            <span className="block text-muted-foreground">
                              {CRM_DOC_KIND_LABELS[d.kind as keyof typeof CRM_DOC_KIND_LABELS] ?? d.kind} ·{" "}
                              {CRM_DOC_STATUS_LABELS[d.status] ?? d.status} · {formatDate(d.createdAt, "ro")}
                            </span>
                          </span>
                          <span className="tabular-nums">{money(d.totalCents, d.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {editing && company && (
        <CompanyFormDialog
          company={company}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}
    </BusinessShell>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

function Section({ title, count, children }: SectionProps) {
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-medium">
        {title}
        {count != null && count > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>}
      </h2>
      {children}
    </Card>
  );
}

interface FactProps {
  label: string;
  value: ReactNode;
  icon?: typeof Phone;
  mono?: boolean;
}

function Fact({ label, value, icon: Icon, mono }: FactProps) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
          {label}
        </span>
      </dt>
      <dd className={mono ? "min-w-0 flex-1 tabular-nums" : "min-w-0 flex-1"}>{value || "—"}</dd>
    </div>
  );
}
