/**
 * COMMS-301 — inboxul omnicanal: WhatsApp, Telegram, Viber și Gmail într-un singur loc.
 *
 * O singură coadă, fiindcă un client nu alege canalul după organigrama noastră: scrie unde îi e
 * comod. Agentul răspunde din aceeași fereastră, pe același canal, iar mesajul intră și în
 * cronologia leadului („Activitate" din fișă) — acolo nu există o a doua istorie.
 *
 * Regulile furnizorilor se văd ÎNAINTE de a scrie, nu după o eroare: fereastra de 24h WhatsApp
 * cere template, un bot blocat nu mai poate trimite, consimțământul retras oprește tot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  Check,
  Clock,
  Download,
  Inbox,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Send,
  Settings2,
  AlertCircle,
  UserRound,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Card, EmptyState, Input, Label, Select, Tabs, Textarea, type TabItem } from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import { pipelineHref } from "@/lib/crm/pipelineUrl";
import { TemplateDialog } from "@/components/crm/WhatsappTemplateDialog";
import {
  CHANNEL_KIND_LABELS,
  commsErrorText,
  getConversation,
  getInboxSummary,
  listConversations,
  markConversationRead,
  mediaUrl,
  sendMessage,
  syncGmail,
  updateConversation,
  type ChannelKind,
  type CommMessage,
  type ConversationDetail,
  type ConversationListItem,
} from "@/lib/api/comms";

type KindFilter = "all" | ChannelKind;
const POLL_MS = 15_000;

/** Ora pentru azi, data pentru restul — în listă contează „cât de recent". */
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("ro-MD", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit" });
}

function contactLabel(c: Pick<ConversationListItem, "contactName" | "contactPhone" | "contactEmail" | "contactUsername">): string {
  return c.contactName || c.contactPhone || c.contactEmail || (c.contactUsername ? `@${c.contactUsername}` : "Contact");
}

function ChannelIcon({ kind, className }: { kind: ChannelKind; className?: string }) {
  const Icon = kind === "gmail" ? Mail : kind === "telegram" ? Send : MessageCircle;
  return <Icon className={className ?? "h-4 w-4"} aria-hidden="true" />;
}

const STATUS_LABEL: Record<CommMessage["status"], string> = {
  queued: "Se trimite",
  sent: "Trimis",
  delivered: "Livrat",
  read: "Citit",
  failed: "Nu a plecat",
  received: "",
};

function StatusMark({ m }: { m: CommMessage }) {
  if (m.direction !== "outbound") return null;
  const Icon = m.status === "read" || m.status === "delivered" ? CheckCheck : m.status === "sent" ? Check : m.status === "failed" ? AlertCircle : Clock;
  return (
    <span className="inline-flex items-center gap-1" title={m.errorMessage ?? STATUS_LABEL[m.status]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{STATUS_LABEL[m.status]}</span>
    </span>
  );
}

// ─── pagina ──────────────────────────────────────────────────────────────────

export function CrmInboxPage() {
  const { path, navigate } = useRouter();
  const selectedFromUrl = useMemo(() => new URLSearchParams(path.split("?")[1] ?? "").get("c"), [path]);

  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [mine, setMine] = useState(false);
  const [unread, setUnread] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(selectedFromUrl);

  useEffect(() => setSelected(selectedFromUrl), [selectedFromUrl]);

  const loadList = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const [list, summary] = await Promise.all([
          listConversations({ kind: kind === "all" ? null : kind, status, mine, unread, q }),
          getInboxSummary(),
        ]);
        setItems(list.items);
        setCounts(Object.fromEntries(Object.entries(summary.byKind).map(([k, v]) => [k, v.unread])));
        setError(null);
      } catch (err) {
        if (!quiet) setError(commsErrorText(err, "Nu am putut încărca conversațiile."));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [kind, status, mine, unread, q]
  );

  useEffect(() => {
    const t = setTimeout(() => void loadList(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);

  // Ultima variantă a încărcării, citită de intervale fără să le repornească la fiecare tastă.
  const loadRef = useRef(loadList);
  useEffect(() => {
    loadRef.current = loadList;
  }, [loadList]);

  // Gmail nu are întotdeauna push (Pub/Sub); deschiderea inboxului e momentul natural de a aduce ce
  // e nou. O SINGURĂ dată la deschidere — nu la fiecare filtru sau tastă din căutare.
  useEffect(() => {
    void syncGmail()
      .then((r) => (r.messages > 0 ? loadRef.current(true) : undefined))
      .catch(() => undefined);
    const id = setInterval(() => void loadRef.current(true), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const refreshQuietly = useCallback(() => void loadRef.current(true), []);

  const open = (id: string | null) => {
    setSelected(id);
    navigate(id ? `/business/crm/mesaje?c=${id}` : "/business/crm/mesaje");
  };

  const totalUnread = Object.values(counts).reduce((s, n) => s + n, 0);
  const tabs: TabItem<KindFilter>[] = [
    { value: "all", label: "Toate", count: totalUnread || undefined },
    ...(["whatsapp", "telegram", "viber", "gmail"] as const).map((k) => ({ value: k, label: CHANNEL_KIND_LABELS[k], count: counts[k] || undefined })),
  ];

  return (
    <BusinessShell
      pageTitle="Mesaje"
      pageDescription="WhatsApp, Telegram, Viber și Gmail într-un singur inbox. Răspunsul pleacă pe canalul pe care a scris clientul."
      actions={
        <Button variant="outline" onClick={() => navigate("/business/crm/canale")}>
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Canale
        </Button>
      }
    >
      <div className="space-y-3">
        <Tabs tabs={tabs} value={kind} onChange={setKind} aria-label="Filtrează după canal" />
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_1fr]">
          {/* Lista */}
          <Card className={`flex min-h-[60vh] flex-col overflow-hidden p-0 ${selected ? "hidden lg:flex" : "flex"}`}>
            <div className="space-y-2 border-b border-border p-3">
              <Label htmlFor="inbox-q" className="sr-only">
                Caută
              </Label>
              <Input
                id="inbox-q"
                icon={<Search className="h-4 w-4" aria-hidden="true" />}
                placeholder="Caută nume, telefon, email, text…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="inbox-status" className="sr-only">
                  Stare
                </Label>
                <Select id="inbox-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-32">
                  <option value="open">Deschise</option>
                  <option value="closed">Închise</option>
                  <option value="all">Toate</option>
                </Select>
                <Button size="sm" variant={mine ? "secondary" : "ghost"} aria-pressed={mine} onClick={() => setMine((v) => !v)}>
                  Ale mele
                </Button>
                <Button size="sm" variant={unread ? "secondary" : "ghost"} aria-pressed={unread} onClick={() => setUnread((v) => !v)}>
                  Necitite
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-12" role="status">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă" />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Inbox className="h-6 w-6" />}
                  title="Nicio conversație"
                  description="Când un client scrie pe un canal conectat, conversația apare aici."
                  action={
                    <Button variant="outline" size="sm" onClick={() => navigate("/business/crm/canale")}>
                      Conectează un canal
                    </Button>
                  }
                />
              ) : (
                <ul aria-label="Conversații">
                  {items.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => open(it.id)}
                        aria-current={selected === it.id ? "true" : undefined}
                        className={`touch-target flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selected === it.id ? "bg-muted" : ""
                        }`}
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                          <ChannelIcon kind={it.channelKind} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate ${it.unreadCount > 0 ? "font-semibold text-foreground" : "text-foreground"}`}>
                              {contactLabel(it)}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{when(it.lastMessageAt)}</span>
                          </span>
                          {it.subject && <span className="block truncate text-xs text-muted-foreground">{it.subject}</span>}
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm text-muted-foreground">
                              {it.lastMessageDirection === "outbound" ? "Tu: " : ""}
                              {it.lastMessagePreview ?? ""}
                            </span>
                            {it.unreadCount > 0 && (
                              <Badge variant="default" aria-label={`${it.unreadCount} necitite`}>
                                {it.unreadCount}
                              </Badge>
                            )}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                            <span>{it.channelName}</span>
                            {it.leadName && <span>· {it.leadName}</span>}
                            {it.assignedName && <span>· {it.assignedName}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Conversația */}
          <Card className={`min-h-[60vh] overflow-hidden p-0 ${selected ? "flex" : "hidden lg:flex"} flex-col`}>
            {selected ? (
              <Thread key={selected} id={selected} onBack={() => open(null)} onChanged={refreshQuietly} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState icon={<MessageCircle className="h-6 w-6" />} title="Alege o conversație" description="Mesajele și răspunsul apar aici." />
              </div>
            )}
          </Card>
        </div>
      </div>
    </BusinessShell>
  );
}

// ─── firul unei conversații ──────────────────────────────────────────────────

interface ThreadProps {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}

function Thread({ id, onBack, onChanged }: ThreadProps) {
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const d = await getConversation(id);
        setData(d);
        setError(null);
        if (!quiet) setSubject((s) => s || d.conversation.subject || "");
        if (d.conversation.unreadCount > 0) {
          await markConversationRead(id);
          onChangedRef.current();
        }
      } catch (err) {
        if (!quiet) setError(commsErrorText(err, "Nu am putut deschide conversația."));
      }
    },
    [id]
  );

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [count]);

  const send = async (payload: Parameters<typeof sendMessage>[1]) => {
    setSending(true);
    setSendError(null);
    try {
      const r = await sendMessage(id, payload);
      if (r.message.status === "failed") setSendError(r.message.errorMessage ?? "Mesajul nu a plecat.");
      else setText("");
      await load(true);
      onChanged();
    } catch (err) {
      setSendError(commsErrorText(err, "Mesajul nu a plecat."));
    } finally {
      setSending(false);
    }
  };

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) {
    return (
      <div className="flex flex-1 justify-center py-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă conversația" />
      </div>
    );
  }

  const { conversation, channel, contact, lead, messages, compose } = data;
  const isEmail = channel.kind === "gmail";
  const name = contact.displayName || contact.phone || contact.email || (contact.username ? `@${contact.username}` : "Contact");
  const disabled = compose.blocked || compose.consentRevoked;

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Înapoi la conversații">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ChannelIcon kind={channel.kind} className="h-3.5 w-3.5" />
              {channel.name}
            </span>
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && <span>{contact.email}</span>}
            {contact.username && <span>@{contact.username}</span>}
            {channel.mock && <Badge variant="warning">Simulat</Badge>}
          </p>
        </div>
        {lead && (
          <a
            href={`#${pipelineHref(lead.id)}`}
            className="touch-target inline-flex items-center gap-1 rounded-md px-2 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Fișa leadului
          </a>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await updateConversation(id, { status: conversation.status === "open" ? "closed" : "open" });
              await load(true);
              onChanged();
            } catch (err) {
              setSendError(commsErrorText(err, "Nu am putut schimba starea conversației."));
            }
          }}
        >
          {conversation.status === "open" ? "Închide" : "Redeschide"}
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-background p-3" aria-live="polite">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Niciun mesaj încă.</p>}
        {messages.map((m) => {
          const out = m.direction === "outbound";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  out
                    ? m.status === "failed"
                      ? "border border-destructive bg-card text-foreground"
                      : "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {isEmail && m.subject && <p className="mb-1 text-xs font-semibold opacity-80">{m.subject}</p>}
                {m.templateName && <p className="mb-1 text-xs opacity-80">Template: {m.templateName}</p>}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {(m.media ?? []).map((md, i) => (
                  <a
                    key={i}
                    href={mediaUrl(m.id, i)}
                    className="mt-1 inline-flex items-center gap-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    {md.name ?? (md.type === "image" ? "Imagine" : md.type === "audio" ? "Mesaj vocal" : "Fișier")}
                  </a>
                ))}
                <p className={`mt-1 flex items-center justify-end gap-1 text-xs ${out && m.status !== "failed" ? "opacity-80" : "text-muted-foreground"}`}>
                  {out && m.senderName && <span>{m.senderName} ·</span>}
                  <span>{when(m.createdAt)}</span>
                  <StatusMark m={m} />
                </p>
                {m.status === "failed" && m.errorMessage && <p className="mt-1 text-xs text-destructive">{m.errorMessage}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {compose.consentRevoked && <Alert variant="destructive">Leadul și-a retras consimțământul — nu i se mai pot trimite mesaje.</Alert>}
        {compose.blocked && !compose.consentRevoked && <Alert variant="warning">{compose.reason}</Alert>}
        {compose.needsTemplate && !disabled && (
          <Alert variant="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{compose.reason}</span>
              <Button size="sm" onClick={() => setTemplatesOpen(true)}>
                Alege template
              </Button>
            </div>
          </Alert>
        )}
        {sendError && <Alert variant="destructive">{sendError}</Alert>}
        {!disabled && !compose.needsTemplate && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void send({ text, subject: isEmail ? subject : null });
            }}
          >
            {isEmail && (
              <>
                <Label htmlFor="inbox-subject" className="sr-only">
                  Subiect
                </Label>
                <Input id="inbox-subject" placeholder="Subiect" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </>
            )}
            <Label htmlFor="inbox-text" className="sr-only">
              Mesaj
            </Label>
            <Textarea
              id="inbox-text"
              rows={isEmail ? 5 : 2}
              placeholder={`Scrie pe ${CHANNEL_KIND_LABELS[channel.kind]}… (Ctrl+Enter trimite)`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) {
                  e.preventDefault();
                  void send({ text, subject: isEmail ? subject : null });
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              {compose.windowExpiresAt ? (
                <p className="text-xs text-muted-foreground">
                  Fereastra WhatsApp se închide la {new Date(compose.windowExpiresAt).toLocaleString("ro-MD", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </p>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {channel.kind === "whatsapp" && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)}>
                    Template
                  </Button>
                )}
                <Button type="submit" disabled={sending || !text.trim()}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Trimite
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>

      {templatesOpen && (
        <TemplateDialog
          channelId={channel.id}
          defaultParam={lead?.fullName ?? contact.displayName ?? ""}
          onClose={() => setTemplatesOpen(false)}
          onSend={async (tpl) => {
            setTemplatesOpen(false);
            await send({ template: tpl });
          }}
        />
      )}
    </>
  );
}
