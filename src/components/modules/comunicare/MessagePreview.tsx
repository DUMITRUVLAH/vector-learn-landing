import { useState } from "react";
import { MessageCircle, Send, Mail, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export type Channel = "whatsapp" | "telegram" | "sms" | "email";

export interface MessageContext {
  nume: string;
  curs: string;
  data: string;
}

const DEFAULT_CTX: MessageContext = {
  nume: "Maria",
  curs: "Engleză B2",
  data: "joi, 30 mai 14:00",
};

const CHANNEL_META: Record<Channel, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  telegram: { label: "Telegram", icon: Send },
  sms: { label: "SMS", icon: Smartphone },
  email: { label: "Email", icon: Mail },
};

export function interpolate(template: string, ctx: MessageContext): string {
  return template
    .replace(/\{nume\}/g, ctx.nume)
    .replace(/\{curs\}/g, ctx.curs)
    .replace(/\{data\}/g, ctx.data);
}

const DEFAULT_TEMPLATE =
  "Bună, {nume} a lipsit azi la {curs}. Sistemul a propus 3 sloturi pentru recuperare. Confirmă unul aici: vlearn.io/r/abc123";

interface MessagePreviewProps {
  template?: string;
  ctx?: MessageContext;
}

export function MessagePreview({ template = DEFAULT_TEMPLATE, ctx = DEFAULT_CTX }: MessagePreviewProps) {
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const body = interpolate(template, ctx);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-bold">Cum arată mesajul</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Schimbă canalul ca să vezi cum apare pe fiecare platformă.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div role="tablist" aria-label="Selectare canal" className="flex flex-wrap gap-1.5 mb-5">
          {(Object.keys(CHANNEL_META) as Channel[]).map((ch) => {
            const meta = CHANNEL_META[ch];
            const Icon = meta.icon;
            const active = channel === ch;
            return (
              <button
                key={ch}
                role="tab"
                aria-selected={active}
                aria-controls={`preview-${ch}`}
                onClick={() => setChannel(ch)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div
          id={`preview-${channel}`}
          role="tabpanel"
          aria-label={`Previzualizare ${CHANNEL_META[channel].label}`}
          data-testid="message-preview-body"
        >
          {channel === "whatsapp" && <WhatsAppBubble body={body} />}
          {channel === "telegram" && <TelegramBubble body={body} />}
          {channel === "sms" && <SmsBubble body={body} />}
          {channel === "email" && <EmailPreview body={body} />}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          Template:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{template}</code>
        </p>
      </div>
    </div>
  );
}

function WhatsAppBubble({ body }: { body: string }) {
  return (
    <div className="rounded-2xl bg-[#0b141a] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-xs font-bold text-white">
          VL
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Vector Learn — Lingua School</p>
          <p className="text-[10px] text-white/60">online</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-[#005c4b] px-3 py-2 text-white">
          <p className="text-sm leading-relaxed">{body}</p>
          <p className="text-[10px] text-white/60 mt-1 text-right">14:32 ✓✓</p>
        </div>
      </div>
    </div>
  );
}

function TelegramBubble({ body }: { body: string }) {
  return (
    <div className="rounded-2xl bg-[#17212b] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-400 to-sky-700 flex items-center justify-center text-xs font-bold text-white">
          VL
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Vector Learn Bot</p>
          <p className="text-[10px] text-white/60">bot</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-[#2b5278] px-3 py-2 text-white">
          <p className="text-sm leading-relaxed">{body}</p>
          <p className="text-[10px] text-white/60 mt-1 text-right">14:32</p>
        </div>
      </div>
    </div>
  );
}

function SmsBubble({ body }: { body: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 p-4">
      <div className="text-center mb-2">
        <p className="text-[10px] text-foreground/60">Mesaj text · azi 14:32</p>
      </div>
      <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-foreground/10 px-3 py-2 ml-0">
        <p className="text-sm leading-relaxed text-foreground">{body}</p>
      </div>
      <p className="text-[10px] text-foreground/60 mt-2 text-right">
        {body.length} caractere · 1 SMS
      </p>
    </div>
  );
}

function EmailPreview({ body }: { body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5 space-y-1">
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="text-muted-foreground w-12 flex-shrink-0">De la:</span>
          <span className="text-foreground font-medium">contact@lingua-school.ro</span>
        </div>
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="text-muted-foreground w-12 flex-shrink-0">Către:</span>
          <span className="text-foreground">cristina.popescu@gmail.com</span>
        </div>
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="text-muted-foreground w-12 flex-shrink-0">Subiect:</span>
          <span className="text-foreground font-semibold">Recuperare lecție disponibilă</span>
        </div>
      </div>
      <div className="px-4 py-4">
        <p className="text-sm leading-relaxed">{body}</p>
        <p className="text-xs text-muted-foreground mt-4">— Echipa Lingua School</p>
      </div>
    </div>
  );
}
