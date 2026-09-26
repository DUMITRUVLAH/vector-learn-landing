/**
 * CRM — Echipa: administratorul invită colegi, le dă rolul, îi scoate din CRM sau le închide contul.
 *
 * Invitația merge pe fluxul existent (email + link, parolă sau Google). Omul care acceptă intră
 * direct în CRM, cu rolul ales aici. Linkul se vede și pe ecran, ca invitația să poată pleca și pe
 * WhatsApp când emailul nu ajunge.
 *
 * „Scoate din CRM" ≠ „Dezactivează contul": primul ia doar CRM-ul (omul rămâne în workspace, cu
 * cererile PAR și semnăturile lui), al doilea închide contul peste tot. Ambele se pot întoarce.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  getCrmTeam,
  inviteCrmTeamMember,
  revokeCrmTeamInvite,
  setCrmTeamMemberAccess,
  setCrmTeamMemberActive,
  setCrmTeamMemberRole,
  type CrmTeamMember,
  type CrmTeamResponse,
  type CrmTeamRole,
} from "@/lib/api/crm";

/** Mesajele pentru codurile de eroare ale rutei — un cod sec nu-i spune omului ce să facă. */
const ERROR_MESSAGES: Record<string, string> = {
  already_member: "Omul ăsta are deja acces în CRM. Schimbă-i rolul din listă.",
  last_admin: "E ultimul administrator activ. Numește întâi alt administrator.",
  cannot_change_self: "Nu îți poți schimba singur rolul sau accesul.",
  admin_always_has_access: "Un administrator are mereu acces. Schimbă-i întâi rolul.",
  email_reserved: "Adresa asta nu poate fi invitată.",
  forbidden: "Doar administratorul workspace-ului poate face asta.",
};

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return ERROR_MESSAGES[err.code] ?? fallback;
  return fallback;
}

type PendingAction =
  | { kind: "revoke-access"; member: CrmTeamMember }
  | { kind: "deactivate"; member: CrmTeamMember };

export function CrmTeamPage() {
  const [data, setData] = useState<CrmTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CrmTeamRole>("teacher");
  const [sent, setSent] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getCrmTeam());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError("Nu am putut încărca echipa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleLabel = (key: string | null) =>
    data?.roles.find((r) => r.key === key)?.label ?? (key === "owner" ? "Proprietar" : key ?? "—");

  async function run(key: string, action: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(messageFor(err, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    setBusy("invite");
    setError(null);
    setSent(null);
    setCopied(false);
    try {
      const res = await inviteCrmTeamMember({ email: target, role });
      setSent({ email: res.email, url: res.inviteUrl, emailed: res.emailed });
      setEmail("");
      await load();
    } catch (err) {
      setError(messageFor(err, "Nu am putut trimite invitația."));
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function confirmAction() {
    if (!confirm) return;
    const { kind, member } = confirm;
    const ok =
      kind === "revoke-access"
        ? await run(`access:${member.id}`, () => setCrmTeamMemberAccess(member.id, false), "Nu am putut scoate omul din CRM.")
        : await run(`active:${member.id}`, () => setCrmTeamMemberActive(member.id, false), "Nu am putut dezactiva contul.");
    if (ok) setConfirm(null);
  }

  const canManage = data?.canManage ?? false;

  return (
    <BusinessShell
      pageTitle="Echipa CRM"
      pageDescription="Invită colegi, dă-le rolul și scoate-i când pleacă. Cine acceptă invitația intră direct în CRM."
    >
      {forbidden ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Ecranul e pentru administratori"
          description="Cere-i administratorului workspace-ului să te invite sau să-ți schimbe rolul."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă echipa..." />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
              {error}
            </Alert>
          )}

          {canManage && (
            <Card className="p-5">
              <form onSubmit={submitInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end" aria-label="Invită un coleg">
                <div className="flex-1">
                  <Label htmlFor="crm-invite-email">Email</Label>
                  <Input
                    id="crm-invite-email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="coleg@firma.md"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="sm:w-56">
                  <Label htmlFor="crm-invite-role">Rol</Label>
                  <Select id="crm-invite-role" value={role} onChange={(e) => setRole(e.target.value as CrmTeamRole)}>
                    {data?.roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" disabled={busy === "invite" || !email.trim()}>
                  {busy === "invite" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Invită
                </Button>
              </form>

              {sent && (
                <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                    {sent.emailed
                      ? `Invitația a plecat pe email la ${sent.email}.`
                      : `Emailul nu s-a trimis — trimite-i lui ${sent.email} linkul de mai jos.`}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input readOnly value={sent.url} aria-label="Linkul de invitație" className="font-mono text-xs" />
                    <Button type="button" variant="outline" onClick={() => void copyLink()}>
                      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                      {copied ? "Copiat" : "Copiază"}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Linkul e valabil 7 zile și merge o singură dată.</p>
                </div>
              )}
            </Card>
          )}

          {(data?.invites.length ?? 0) > 0 && (
            <section aria-labelledby="crm-invites-title" className="flex flex-col gap-2">
              <h2 id="crm-invites-title" className="text-sm font-semibold text-foreground">
                Invitații în așteptare
              </h2>
              <Table aria-label="Invitații în așteptare">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Expiră</TableHead>
                    {canManage && <TableHead className="text-right">Acțiuni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel(inv.role)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(inv.expiresAt).toLocaleDateString("ro-RO")}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === `invite:${inv.id}`}
                            onClick={() =>
                              void run(`invite:${inv.id}`, () => revokeCrmTeamInvite(inv.id), "Nu am putut anula invitația.")
                            }
                          >
                            Anulează
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          <section aria-labelledby="crm-members-title" className="flex flex-col gap-2">
            <h2 id="crm-members-title" className="text-sm font-semibold text-foreground">
              Oamenii din workspace
            </h2>
            {(data?.members.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Încă nu e nimeni în echipă"
                description="Invită primul coleg de mai sus."
              />
            ) : (
              <Table aria-label="Echipa CRM">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Om</TableHead>
                    <TableHead className="min-w-[180px]">Rol</TableHead>
                    <TableHead>Stare</TableHead>
                    {canManage && <TableHead className="text-right">Acțiuni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.members.map((m) => {
                    const editable = canManage && !m.isSelf;
                    const knownRole = data.roles.some((r) => r.key === m.role);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">
                            {m.name ?? m.email}
                            {m.isSelf && <span className="ml-1 text-xs text-muted-foreground">(tu)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </TableCell>
                        <TableCell>
                          {editable && knownRole ? (
                            <Select
                              aria-label={`Rolul lui ${m.name ?? m.email}`}
                              value={m.role}
                              disabled={busy === `role:${m.id}`}
                              onChange={(e) =>
                                void run(
                                  `role:${m.id}`,
                                  () => setCrmTeamMemberRole(m.id, e.target.value as CrmTeamRole),
                                  "Nu am putut schimba rolul."
                                )
                              }
                            >
                              {data.roles.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.label}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!m.isActive ? (
                            <Badge variant="destructive">Cont dezactivat</Badge>
                          ) : m.crmAccess ? (
                            <Badge variant="success">Are acces</Badge>
                          ) : (
                            <Badge variant="warning">Scos din CRM</Badge>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            {editable && (
                              <div className="flex flex-wrap justify-end gap-2">
                                {m.isActive && m.role !== "admin" && (
                                  m.crmAccess ? (
                                    <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "revoke-access", member: m })}>
                                      Scoate din CRM
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={busy === `access:${m.id}`}
                                      onClick={() =>
                                        void run(`access:${m.id}`, () => setCrmTeamMemberAccess(m.id, true), "Nu am putut reda accesul.")
                                      }
                                    >
                                      Readu în CRM
                                    </Button>
                                  )
                                )}
                                {m.isActive ? (
                                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "deactivate", member: m })}>
                                    Dezactivează contul
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy === `active:${m.id}`}
                                    onClick={() =>
                                      void run(`active:${m.id}`, () => setCrmTeamMemberActive(m.id, true), "Nu am putut reactiva contul.")
                                    }
                                  >
                                    Reactivează
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">
              Drepturile fine (cine șterge leaduri, cine vede rapoartele echipei) se reglează pe om din „Drepturi".
            </p>
          </section>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm?.kind === "deactivate" ? "Dezactivezi contul?" : "Scoți omul din CRM?"}
        description={
          confirm?.kind === "deactivate"
            ? `${confirm.member.name ?? confirm.member.email} nu se mai poate conecta nicăieri în workspace și e deconectat(ă) acum. Leadurile și istoricul rămân. Poți reactiva oricând.`
            : `${confirm?.member.name ?? confirm?.member.email ?? ""} nu mai vede CRM-ul, dar rămâne în workspace (de ex. cererile de plată). Poți reda accesul oricând.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Renunță
            </Button>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void confirmAction()}>
              {confirm?.kind === "deactivate" ? "Dezactivează" : "Scoate din CRM"}
            </Button>
          </>
        }
      />
    </BusinessShell>
  );
}
