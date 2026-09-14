/**
 * CRM — trimite un email clientului, din aplicație.
 *
 * De ce nu e de ajuns `mailto:`: acela deschide Outlook și nu lasă nicio urmă.
 * Peste o lună cronologia lead-ului arată tăcere acolo unde de fapt au plecat
 * cinci mesaje, iar cine preia clientul nu are de unde ști ce i s-a scris.
 *
 * Ecranul spune deschis când un email NU a plecat, cu motivul. E o situație
 * normală, nu o defecțiune: adresele lead-urilor sunt scrise de mână, iar
 * produsul își apără reputația de expeditor refuzând domeniile nelivrabile.
 * Important e ca agentul să afle ACUM, nu să creadă că a scris.
 */
import { useState } from "react";
import { Mail, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Textarea } from "@/components/ds";
import { sendCrmEmail, EMAIL_STATUS_LABELS, type EmailStatus } from "@/lib/api/crmComms";

export function SendEmailDialog({
  leadId,
  leadName,
  defaultTo,
  onClose,
  onSent,
}: {
  leadId: string;
  leadName: string;
  defaultTo: string | null;
  onClose: () => void;
  onSent?: () => void | Promise<void>;
}) {
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ status: EmailStatus; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await sendCrmEmail({ leadId, subject, body, to: to.trim() || null });
      setResult({ status: res.status, detail: res.detail });
      await onSent?.();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Nu am putut trimite emailul.");
    } finally {
      setSending(false);
    }
  }

  if (result) {
    const ok = result.status === "sent";
    return (
      <Dialog open onClose={onClose} title={ok ? "Email trimis" : "Emailul nu a plecat"}>
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            {ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium">{EMAIL_STATUS_LABELS[result.status]}</p>
              {result.detail && <p className="text-sm text-muted-foreground">{result.detail}</p>}
              <p className="mt-2 text-sm text-muted-foreground">
                Mesajul a rămas în cronologia lead-ului, cu starea de mai sus — ca să se știe ce s-a încercat.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Închide</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Email către ${leadName}`} size="lg">
      <div className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="space-y-1">
          <Label htmlFor="mail-catre">Către</Label>
          <Input
            id="mail-catre"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@exemplu.md"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mail-subiect">Subiect</Label>
          <Input
            id="mail-subiect"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Oferta noastră pentru instalare"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mail-mesaj">Mesaj</Label>
          <Textarea id="mail-mesaj" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={() => void send()} disabled={sending || !to.trim() || !subject.trim() || !body.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
            Trimite
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
