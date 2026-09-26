/**
 * COMMS-301 — conectarea canalelor de mesaje: WhatsApp, Telegram, Viber, Gmail.
 *
 * Fiecare card spune, în pașii furnizorului, DE UNDE se iau credențialele — omul care conectează
 * e de obicei directorul, nu un programator. Detaliile complete (cu linkurile oficiale) stau în
 * docs/comms/<canal>.md; aici e varianta scurtă, suficientă ca să lipești tokenul corect.
 *
 * După conectare, WhatsApp cere un pas manual în Meta (URL + verify token); Telegram și Viber își
 * setează singure webhook-ul; Gmail trece prin ecranul de consimțământ Google.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, Mail, MessageCircle, PlugZap, Send, Trash2, Activity } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Card, Checkbox, Dialog, Input, Label } from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import {
  CHANNEL_KIND_LABELS,
  commsErrorText,
  connectChannel,
  disconnectChannel,
  listChannelEvents,
  listChannels,
  rotateChannelCredentials,
  simulateInbound,
  startGmailOAuth,
  testChannel,
  updateChannel,
  type ChannelKind,
  type CommChannel,
  type PlatformInfo,
  type WebhookEvent,
} from "@/lib/api/comms";

interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  hint?: string;
}

interface KindDef {
  kind: Exclude<ChannelKind, "gmail">;
  title: string;
  blurb: string;
  steps: string[];
  docs: { label: string; href: string }[];
  fields: FieldDef[];
  config?: FieldDef[];
}

const KINDS: KindDef[] = [
  {
    kind: "whatsapp",
    title: "WhatsApp Business (Cloud API)",
    blurb: "Numărul firmei pe WhatsApp, prin API-ul oficial Meta. Clientul scrie oricând; tu răspunzi liber 24h, apoi doar cu template aprobat.",
    steps: [
      "business.facebook.com → verifică firma (Business Verification).",
      "developers.facebook.com → Create App → cazul „Connect with customers through WhatsApp”.",
      "WhatsApp → API Setup: adaugă numărul și copiază Phone Number ID + WhatsApp Business Account ID.",
      "Business Settings → System Users → Generate token cu whatsapp_business_messaging + whatsapp_business_management.",
      "App Settings → Basic → App Secret.",
    ],
    docs: [
      { label: "Cloud API — Get started", href: "https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started" },
      { label: "Access tokens", href: "https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens" },
    ],
    fields: [
      { key: "accessToken", label: "Access token (System User, permanent)", secret: true },
      { key: "phoneNumberId", label: "Phone Number ID" },
      { key: "wabaId", label: "WhatsApp Business Account ID", hint: "Pentru lista de template-uri" },
      { key: "appSecret", label: "App Secret", secret: true, hint: "Verifică semnătura webhook-urilor Meta" },
    ],
  },
  {
    kind: "telegram",
    title: "Telegram (bot)",
    blurb: "Un bot al firmei. Botul nu poate scrie primul: clientul îl deschide din linkul trimis de agent sau de pe site.",
    steps: [
      "În Telegram deschide @BotFather → /newbot → nume + username terminat în „bot”.",
      "Copiază tokenul (arată ca 123456789:AA…).",
      "Opțional: /setdescription, /setuserpic, /setjoingroups → Disable.",
      "Opțional (răspunzi din contul firmei): BotFather → Bot Settings → Business Mode; apoi în Telegram → Settings → Telegram Business → Chatbots.",
    ],
    docs: [
      { label: "Bot API", href: "https://core.telegram.org/bots/api" },
      { label: "BotFather & deep linking", href: "https://core.telegram.org/bots/features" },
    ],
    fields: [{ key: "botToken", label: "Token bot", secret: true }],
  },
  {
    kind: "viber",
    title: "Viber (bot)",
    blurb: "Bot Viber al firmei. Din 2024 boturile noi se obțin doar pe bază de contract comercial (abonament lunar), prin Viber sau un partener.",
    steps: [
      "Aplică pentru chatbot: forbusiness.viber.com (formular) sau un partener oficial din Moldova/România.",
      "După contract: Viber → Settings → Bots → Edit Info → „Your app key” — acesta e tokenul.",
      "Lipește tokenul aici; webhook-ul se setează automat.",
    ],
    docs: [
      { label: "REST Bot API", href: "https://developers.viber.com/docs/api/rest-bot-api/" },
      { label: "Parteneri Viber", href: "https://www.forbusiness.viber.com/en/messaging-partners/" },
    ],
    fields: [{ key: "authToken", label: "Token bot (app key)", secret: true }],
    config: [{ key: "senderName", label: "Numele expeditorului (max 28)", optional: true }],
  },
];

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs text-foreground">{value}</code>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Copiază ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // clipboard indisponibil — valoarea rămâne vizibilă pentru copiere manuală
            }
          }}
        >
          {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<CommChannel["status"], { label: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
  active: { label: "Activ", variant: "success" },
  disabled: { label: "Deconectat", variant: "secondary" },
  error: { label: "Eroare", variant: "destructive" },
  pending: { label: "În conectare", variant: "warning" },
};

export function CrmChannelsPage() {
  const { path } = useRouter();
  const [channels, setChannels] = useState<CommChannel[]>([]);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<KindDef | null>(null);
  const [manualSteps, setManualSteps] = useState<{ channel: CommChannel; steps: string[] } | null>(null);
  const [eventsFor, setEventsFor] = useState<CommChannel | null>(null);
  const [simulateFor, setSimulateFor] = useState<CommChannel | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listChannels();
      setChannels(r.channels);
      setPlatform(r.platform);
      setError(null);
    } catch (err) {
      setError(commsErrorText(err, "Nu am putut încărca canalele."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Întoarcerea din Google OAuth: ?gmail=connected | denied | …
  useEffect(() => {
    const g = new URLSearchParams(path.split("?")[1] ?? "").get("gmail");
    if (!g) return;
    const msg: Record<string, string> = {
      connected: "Cutia Gmail e conectată. Emailurile leadurilor apar în Mesaje.",
      denied: "Ai refuzat accesul în ecranul Google.",
      scopes_missing: "Nu ai bifat toate permisiunile Gmail. Reconectează și bifează citire + trimitere.",
      already_connected: "Cutia e deja conectată într-un alt workspace.",
      invalid_state: "Sesiunea de conectare a expirat. Încearcă din nou.",
    };
    setNotice(msg[g] ?? `Conectarea Gmail nu a reușit (${g}).`);
  }, [path]);

  const active = channels.filter((c) => c.status !== "disabled");

  return (
    <BusinessShell
      pageTitle="Canale de mesaje"
      pageDescription="Conectează WhatsApp, Telegram, Viber și Gmail. Mesajele clienților intră în Mesaje și în fișa leadului."
    >
      <div className="space-y-6">
        {error && <Alert variant="destructive">{error}</Alert>}
        {notice && <Alert variant="info">{notice}</Alert>}
        {platform && !platform.encryptionKeySet && (
          <Alert variant="warning">
            ENCRYPTION_KEY nu e setată pe server — tokenurile canalelor nu pot fi stocate criptat în producție. Setează-o înainte de a conecta canale reale.
          </Alert>
        )}

        <section aria-labelledby="ch-connected" className="space-y-3">
          <h2 id="ch-connected" className="text-base font-semibold text-foreground">
            Conectate
          </h2>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Niciun canal conectat încă. Alege unul mai jos.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {active.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  ch={ch}
                  onChanged={load}
                  onEvents={() => setEventsFor(ch)}
                  onSimulate={() => setSimulateFor(ch)}
                  onSteps={(steps) => setManualSteps({ channel: ch, steps })}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="ch-add" className="space-y-3">
          <h2 id="ch-add" className="text-base font-semibold text-foreground">
            Adaugă un canal
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {KINDS.map((k) => (
              <Card key={k.kind} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  {k.kind === "telegram" ? <Send className="h-5 w-5 text-primary" aria-hidden="true" /> : <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />}
                  <h3 className="font-semibold text-foreground">{k.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{k.blurb}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button onClick={() => setConnecting(k)}>
                    <PlugZap className="mr-2 h-4 w-4" aria-hidden="true" />
                    Conectează
                  </Button>
                  {k.docs.map((d) => (
                    <a
                      key={d.href}
                      href={d.href}
                      target="_blank"
                      rel="noreferrer"
                      className="touch-target inline-flex items-center gap-1 rounded-md px-2 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {d.label}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </Card>
            ))}
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Gmail (cutia ta)</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Fiecare agent își conectează propria cutie. Răspunsurile pleacă din adresa ta reală; în CRM intră doar emailurile de la leaduri.
              </p>
              {platform && !platform.gmailConfigured && (
                <Alert variant="warning">Integrarea Google nu e configurată pe platformă (GOOGLE_OAUTH_CLIENT_ID / SECRET).</Alert>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  disabled={!platform?.gmailConfigured}
                  onClick={async () => {
                    try {
                      const { url } = await startGmailOAuth();
                      window.location.href = url;
                    } catch (err) {
                      setError(commsErrorText(err));
                    }
                  }}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Conectează cu Google
                </Button>
                <a
                  href="https://developers.google.com/workspace/gmail/api/guides"
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target inline-flex items-center gap-1 rounded-md px-2 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Gmail API
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </Card>
          </div>
        </section>
      </div>

      {connecting && (
        <ConnectDialog
          def={connecting}
          mockAllowed={Boolean(platform?.mockAllowed)}
          onClose={() => setConnecting(null)}
          onConnected={async (channel, steps) => {
            setConnecting(null);
            await load();
            if (steps.length) setManualSteps({ channel, steps });
            else setNotice(`${channel.name} e conectat.`);
          }}
        />
      )}

      {manualSteps && (
        <Dialog
          open
          onClose={() => setManualSteps(null)}
          title="Un ultim pas în Meta"
          description="Meta nu permite setarea automată a webhook-ului aplicației. Fă asta o singură dată:"
          footer={<Button onClick={() => setManualSteps(null)}>Gata</Button>}
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            {manualSteps.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="mt-3 space-y-2">
            {manualSteps.channel.webhookUrl && <Copyable label="Callback URL" value={manualSteps.channel.webhookUrl} />}
            {manualSteps.channel.verifyToken && <Copyable label="Verify token" value={manualSteps.channel.verifyToken} />}
          </div>
        </Dialog>
      )}

      {eventsFor && <EventsDialog channel={eventsFor} onClose={() => setEventsFor(null)} />}
      {simulateFor && <SimulateDialog channel={simulateFor} onClose={() => setSimulateFor(null)} />}
    </BusinessShell>
  );
}

// ─── cardul unui canal conectat ──────────────────────────────────────────────

interface ChannelCardProps {
  ch: CommChannel;
  onChanged: () => Promise<void> | void;
  onEvents: () => void;
  onSimulate: () => void;
  onSteps: (steps: string[]) => void;
}

function ChannelCard({ ch, onChanged, onEvents, onSimulate, onSteps }: ChannelCardProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [rotating, setRotating] = useState(false);
  const badge = STATUS_BADGE[ch.status];
  const cfg = ch.config;
  const identity =
    ch.kind === "telegram"
      ? cfg.botUsername
        ? `@${String(cfg.botUsername)}`
        : null
      : ch.kind === "viber"
        ? (cfg.botName as string | undefined) ?? null
        : ch.kind === "whatsapp"
          ? (cfg.displayPhone as string | undefined) ?? null
          : (cfg.email as string | undefined) ?? null;
  const autoCreate = cfg.autoCreateLead !== undefined ? cfg.autoCreateLead === true : ch.kind !== "gmail";

  const run = async (fn: () => Promise<{ ok: boolean; text: string } | void>) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      if (r) setResult(r);
      await onChanged();
    } catch (err) {
      setResult({ ok: false, text: commsErrorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground">{ch.name}</h3>
        <Badge variant="secondary">{CHANNEL_KIND_LABELS[ch.kind]}</Badge>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {ch.mock && <Badge variant="warning">Simulat</Badge>}
      </div>
      {identity && <p className="text-sm text-muted-foreground">{identity}</p>}
      {ch.lastError && <Alert variant="destructive">{ch.lastError}</Alert>}
      {ch.kind === "whatsapp" && ch.webhookUrl && !ch.mock && (
        <div className="space-y-2">
          <Copyable label="Callback URL (Meta → WhatsApp → Configuration)" value={ch.webhookUrl} />
          {ch.verifyToken && <Copyable label="Verify token" value={ch.verifyToken} />}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Ultimul eveniment: {ch.lastEventAt ? new Date(ch.lastEventAt).toLocaleString("ro-MD") : "niciunul încă"}
      </p>
      <Checkbox
        id={`auto-${ch.id}`}
        label={ch.kind === "gmail" ? "Creează lead din orice email primit (cutie comună)" : "Creează lead automat pentru un contact nou"}
        checked={autoCreate}
        onChange={(next) => void run(() => updateChannel(ch.id, { config: { autoCreateLead: next } }).then(() => undefined))}
      />
      {result && <Alert variant={result.ok ? "success" : "destructive"}>{result.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
          const r = await testChannel(ch.id);
          return { ok: r.ok, text: r.detail };
        })}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Testează
        </Button>
        {ch.kind !== "gmail" && !ch.mock && (
          <Button size="sm" variant="outline" onClick={() => setRotating(true)}>
            Schimbă tokenul
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEvents}>
          <Activity className="mr-2 h-4 w-4" aria-hidden="true" />
          Jurnal
        </Button>
        {ch.mock && (
          <Button size="sm" variant="ghost" onClick={onSimulate}>
            Simulează mesaj
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm(`Deconectezi ${ch.name}? Conversațiile rămân, dar nu mai primești și nu mai trimiți mesaje pe el.`)) {
              void run(() => disconnectChannel(ch.id).then(() => undefined));
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Deconectează
        </Button>
      </div>
      {rotating && (
        <ConnectDialog
          def={KINDS.find((k) => k.kind === ch.kind)!}
          rotateChannel={ch}
          mockAllowed={false}
          onClose={() => setRotating(false)}
          onConnected={async (_c, steps) => {
            setRotating(false);
            await onChanged();
            if (steps.length) onSteps(steps);
          }}
        />
      )}
    </Card>
  );
}

// ─── conectare / rotire token ────────────────────────────────────────────────

interface ConnectDialogProps {
  def: KindDef;
  mockAllowed: boolean;
  rotateChannel?: CommChannel;
  onClose: () => void;
  onConnected: (channel: CommChannel, manualSteps: string[]) => void;
}

function ConnectDialog({ def, mockAllowed, rotateChannel, onClose, onConnected }: ConnectDialogProps) {
  const [name, setName] = useState(rotateChannel?.name ?? CHANNEL_KIND_LABELS[def.kind]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = def.fields.filter((f) => !f.optional && !(def.kind === "whatsapp" && f.key === "wabaId"));
  const ready = mock || required.every((f) => values[f.key]?.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const credentials = Object.fromEntries(def.fields.filter((f) => values[f.key]?.trim()).map((f) => [f.key, values[f.key].trim()]));
      const config = Object.fromEntries((def.config ?? []).filter((f) => values[f.key]?.trim()).map((f) => [f.key, values[f.key].trim()]));
      const r = rotateChannel
        ? await rotateChannelCredentials(rotateChannel.id, credentials)
        : await connectChannel({ kind: def.kind, name: name.trim(), credentials: mock ? {} : credentials, config, mock });
      onConnected(r.channel, r.manualSteps);
    } catch (err) {
      setError(commsErrorText(err, "Conectarea a eșuat."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={rotateChannel ? `Schimbă tokenul — ${rotateChannel.name}` : `Conectează ${def.title}`}
      description="Tokenurile se salvează criptat și nu mai sunt afișate niciodată."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button disabled={!ready || busy || !name.trim()} onClick={() => void submit()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {rotateChannel ? "Salvează" : "Conectează"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {def.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {!rotateChannel && (
          <div className="space-y-1">
            <Label htmlFor="ch-name">Numele canalului în CRM</Label>
            <Input id="ch-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        {!mock &&
          [...def.fields, ...(rotateChannel ? [] : def.config ?? [])].map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`ch-${f.key}`}>
                {f.label}
                {(f.optional || (def.kind === "whatsapp" && f.key === "wabaId")) && <span className="text-muted-foreground"> (opțional)</span>}
              </Label>
              <Input
                id={`ch-${f.key}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        {mockAllowed && !rotateChannel && (
          <Checkbox
            id="ch-mock"
            label="Canal simulat (fără furnizor real) — pentru demo și teste"
            checked={mock}
            onChange={setMock}
          />
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Dialog>
  );
}

// ─── jurnalul de webhook-uri ─────────────────────────────────────────────────

function EventsDialog({ channel, onClose }: { channel: CommChannel; onClose: () => void }) {
  const [events, setEvents] = useState<WebhookEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listChannelEvents(channel.id)
      .then((r) => setEvents(r.events))
      .catch((err) => setError(commsErrorText(err)));
  }, [channel.id]);
  return (
    <Dialog open onClose={onClose} title={`Jurnal — ${channel.name}`} description="Ce a trimis furnizorul în ultimele 14 zile." size="lg">
      {error && <Alert variant="destructive">{error}</Alert>}
      {!events && !error && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />}
      {events && events.length === 0 && <p className="text-sm text-muted-foreground">Niciun webhook primit încă.</p>}
      {events && events.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-muted-foreground">{new Date(e.receivedAt).toLocaleString("ro-MD")}</span>
              <Badge variant={e.signatureOk ? "success" : "destructive"}>{e.signatureOk ? "semnătură OK" : "respins"}</Badge>
              {e.error ? <span className="text-destructive">{e.error}</span> : e.processedAt ? <span className="text-muted-foreground">procesat</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ─── simulare (canale mock) ──────────────────────────────────────────────────

function SimulateDialog({ channel, onClose }: { channel: CommChannel; onClose: () => void }) {
  const isEmail = channel.kind === "gmail";
  const [from, setFrom] = useState(isEmail ? "client@exemplu.md" : "37360000001");
  const [name, setName] = useState("Client Demo");
  const [text, setText] = useState("Bună ziua, aș vrea o ofertă.");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Simulează un mesaj primit"
      description="Parcurge exact drumul unui mesaj real: contact → lead → conversație → cronologie."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Închide
          </Button>
          <Button
            disabled={busy || !from.trim() || !text.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await simulateInbound(channel.id, {
                  from: from.trim(),
                  name,
                  text,
                  ...(channel.kind === "whatsapp" ? { phone: `+${from.replace(/\D+/g, "")}` } : {}),
                  ...(isEmail ? { subject: "Cerere ofertă" } : {}),
                });
                setResult(
                  r.result.messages
                    ? `Mesaj primit${r.result.leadsCreated ? " — lead nou creat" : ""}. Îl vezi în Mesaje.`
                    : r.result.skipped
                      ? "Ignorat: expeditorul nu e lead (regula Gmail)."
                      : "Nimic nou (duplicat)."
                );
              } catch (err) {
                setResult(commsErrorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Trimite simularea
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="sim-from">{isEmail ? "Adresa expeditorului" : channel.kind === "whatsapp" ? "Numărul (cu prefix țară)" : "Id-ul utilizatorului"}</Label>
          <Input id="sim-from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sim-name">Nume</Label>
          <Input id="sim-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sim-text">Mesaj</Label>
          <Input id="sim-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {result && <Alert variant="info">{result}</Alert>}
      </div>
    </Dialog>
  );
}
