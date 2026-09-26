/**
 * CRM — fluxul de comunicare al echipei.
 *
 * Răspunde la o întrebare pe care pâlnia n-o poate răspunde: „se lucrează?".
 * Un lead poate sta în aceeași coloană o săptămână și totuși să fie sunat zilnic
 * — sau deloc. Coloana arată la fel în ambele cazuri; fluxul ăsta nu.
 *
 * Zgomotul generat de aplicație (mutări de etapă, mesaje de sistem) e scos din
 * start pe server. Ce rămâne e munca oamenilor.
 */
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone, Mail, Loader2, Users } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Card, EmptyState, Label, Select } from "@/components/ds";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { listCrmFeed, CHANNEL_LABELS, DIRECTION_LABELS, type CrmChannel, type CrmFeedItem } from "@/lib/api/crmComms";

const CHANNEL_ICONS: Partial<Record<CrmChannel, typeof Phone>> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageCircle,
  telegram: MessageCircle,
  viber: MessageCircle,
  meeting: Users,
};

/** Data, scurtă pentru azi și completă pentru restul — cele mai multe rânduri sunt de azi. */
function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return sameDay
    ? d.toLocaleTimeString("ro-MD", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("ro-MD", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CrmCommsPage() {
  const [items, setItems] = useState<CrmFeedItem[]>([]);
  const [channel, setChannel] = useState("all");
  const [owner, setOwner] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { members } = useTeamMembers();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmFeed({
        channel: channel === "all" ? null : channel,
        owner: owner === "all" ? null : owner,
      });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Nu am putut încărca fluxul.");
    } finally {
      setLoading(false);
    }
  }, [channel, owner]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BusinessShell
      pageTitle="Comunicare"
      pageDescription="Ce s-a vorbit și ce s-a scris clienților. Doar munca oamenilor, fără zgomotul aplicației."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="space-y-1">
            <Label htmlFor="com-canal">Canal</Label>
            <Select id="com-canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">Toate</option>
              {(Object.keys(CHANNEL_LABELS) as CrmChannel[]).map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABELS[ch]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="com-agent">Agent</Label>
            <Select id="com-agent" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">Toată echipa</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="flex justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă fluxul" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-6 w-6" />}
            title="Nicio comunicare înregistrată"
            description="Apelurile, emailurile și mesajele apar aici pe măsură ce echipa le face din fișa lead-ului."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const Icon = CHANNEL_ICONS[it.type] ?? MessageCircle;
              const status = (it.metadata?.status as string | undefined) ?? null;
              return (
                <li key={it.id}>
                  <Card className="flex gap-3 p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{it.leadName}</span>
                        {it.leadCompany && <span className="text-sm text-muted-foreground">{it.leadCompany}</span>}
                        <Badge variant="secondary">
                          {CHANNEL_LABELS[it.type]} {DIRECTION_LABELS[it.direction] ?? ""}
                        </Badge>
                        {status && status !== "sent" && <Badge variant="destructive">Nu a plecat</Badge>}
                      </div>
                      {it.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{it.body}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{when(it.occurredAt)}</p>
                      {it.userName && <p className="text-xs text-muted-foreground">{it.userName}</p>}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BusinessShell>
  );
}
