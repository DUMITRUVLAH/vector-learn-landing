/**
 * COMMS-301 — canalele de mesaje din fișa leadului.
 *
 * NU e o a doua cronologie: mesajele (primite și trimise) apar deja în „Activitate", prin
 * `lead_interactions`. Panoul răspunde doar la „pe unde îi pot scrie acum?":
 *  - conversațiile deschise → link în inbox, unde se răspunde;
 *  - WhatsApp / Gmail → se poate scrie primul (WhatsApp doar cu template aprobat);
 *  - Telegram / Viber → botul nu poate scrie primul; agentul copiază linkul de invitație (semnat,
 *    legat de lead) și i-l trimite clientului. Când îl deschide, conversația apare în inbox.
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, MessageCircle, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, Badge, Button, Dialog, Input, Label, Textarea } from "@/components/ds";
import {
  CHANNEL_KIND_LABELS,
  commsErrorText,
  getLeadComms,
  startLeadConversation,
  type LeadChannelOption,
  type LeadConversation,
} from "@/lib/api/comms";
import { TemplateDialog } from "@/components/crm/WhatsappTemplateDialog";

export interface LeadChannelsPanelProps {
  leadId: string;
  onSent?: () => void;
}

export function LeadChannelsPanel({ leadId, onSent }: LeadChannelsPanelProps) {
  const [conversations, setConversations] = useState<LeadConversation[]>([]);
  const [channels, setChannels] = useState<LeadChannelOption[]>([]);
  const [composeFor, setComposeFor] = useState<LeadChannelOption | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getLeadComms(leadId);
      setConversations(Array.isArray(r?.conversations) ? r.conversations : []);
      setChannels(Array.isArray(r?.channels) ? r.channels : []);
    } catch {
      // modulul poate lipsi pe un workspace vechi — panoul pur și simplu nu apare
      setChannels([]);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (channels.length === 0 && conversations.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`lead-ch-${leadId}`}>
      <h3 id={`lead-ch-${leadId}`} className="text-sm font-semibold text-foreground">
        Mesaje
      </h3>
      {conversations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <a
                href={`#/business/crm/mesaje?c=${c.id}`}
                className="touch-target flex items-center gap-2 rounded-md px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge variant="secondary">{CHANNEL_KIND_LABELS[c.channelKind]}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.subject ?? c.lastMessagePreview ?? c.channelName}</span>
                {c.unreadCount > 0 && <Badge variant="default">{c.unreadCount}</Badge>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {channels.map((ch) =>
          ch.canStart ? (
            <Button key={ch.id} size="sm" variant="outline" onClick={() => setComposeFor(ch)}>
              {ch.kind === "gmail" ? <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> : <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />}
              Scrie pe {ch.name}
            </Button>
          ) : ch.optInLink ? (
            <Button
              key={ch.id}
              size="sm"
              variant="ghost"
              title="Botul nu poate scrie primul. Trimite-i clientului linkul; când îl deschide, conversația apare în Mesaje."
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ch.optInLink!);
                  setCopied(ch.id);
                  setTimeout(() => setCopied(null), 2000);
                } catch {
                  setError(`Copiază manual: ${ch.optInLink}`);
                }
              }}
            >
              {copied === ch.id ? <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> : ch.kind === "telegram" ? <Send className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
              {copied === ch.id ? "Link copiat" : `Link invitație ${CHANNEL_KIND_LABELS[ch.kind]}`}
            </Button>
          ) : null
        )}
      </div>
      {composeFor && (
        <StartDialog
          leadId={leadId}
          channel={composeFor}
          onClose={() => setComposeFor(null)}
          onDone={async (conversationId) => {
            setComposeFor(null);
            await load();
            onSent?.();
            window.location.hash = `/business/crm/mesaje?c=${conversationId}`;
          }}
        />
      )}
    </section>
  );
}

interface StartDialogProps {
  leadId: string;
  channel: LeadChannelOption;
  onClose: () => void;
  onDone: (conversationId: string) => void;
}

function StartDialog({ leadId, channel, onClose, onDone }: StartDialogProps) {
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (payload: Parameters<typeof startLeadConversation>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const r = await startLeadConversation(payload);
      if (r.message.status === "failed") setError(r.message.errorMessage ?? "Mesajul nu a plecat.");
      else onDone(r.conversationId);
    } catch (err) {
      setError(commsErrorText(err, "Mesajul nu a plecat."));
    } finally {
      setBusy(false);
    }
  };

  // WhatsApp: primul mesaj către cineva care n-a scris în ultimele 24h trebuie să fie un template.
  if (channel.kind === "whatsapp") {
    return (
      <TemplateDialog
        channelId={channel.id}
        defaultParam=""
        busy={busy}
        sendError={error}
        onClose={onClose}
        onSend={(tpl) => void start({ leadId, channelId: channel.id, template: tpl })}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Email din ${channel.name}`}
      description="Pleacă din cutia ta Gmail; răspunsul clientului apare în Mesaje și în fișă."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button disabled={busy || !subject.trim() || !text.trim()} onClick={() => void start({ leadId, channelId: channel.id, subject, text })}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Trimite
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="start-subject">Subiect</Label>
          <Input id="start-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="start-text">Mesaj</Label>
          <Textarea id="start-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Dialog>
  );
}
