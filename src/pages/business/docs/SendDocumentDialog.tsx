/**
 * CRM-U03 — trimiterea unui act pe e-mail, cu un dialog adevărat în locul lui `window.prompt`.
 *
 * Ownerul: „trebuie să pot trimite email din numele FinFlow documente către client". Dialogul
 * arată cine apare ca expeditor, unde vin răspunsurile și ce primește clientul (butonul „Vezi și
 * acceptă" + PDF-ul), cu adresa, subiectul și mesajul deja completate — omul doar verifică.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Textarea } from "@/components/ds";
import { emailDocument } from "@/lib/api/docs";

export interface SendDocumentDialogProps {
  documentId: string;
  docLabel: string;
  orgName: string | null;
  defaultTo: string;
  /** Actul unui client CRM: pleacă cu linkul de acceptare. */
  forClient: boolean;
  isOffer: boolean;
  senderName: string | null;
  onClose: () => void;
  onSent: (result: { to: string; leadMovedTo: string | null }) => void;
}

export function SendDocumentDialog({
  documentId,
  docLabel,
  orgName,
  defaultTo,
  forClient,
  isOffer,
  senderName,
  onClose,
  onSent,
}: SendDocumentDialogProps) {
  const noun = isOffer ? "oferta" : "documentul";
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(docLabel);
  const [message, setMessage] = useState(
    (forClient
      ? `Bună ziua,\n\nVă transmitem ${noun} ${docLabel}. ${
          isOffer ? "O puteți vedea și accepta direct din butonul de mai jos" : "Îl puteți vedea din butonul de mai jos"
        }; PDF-ul e atașat.\n\nCu respect,\n${senderName ?? ""}`
      : `Bună ziua,\n\nVă transmitem atașat ${docLabel}.\n\nCu respect,\n${senderName ?? ""}`
    ).trim()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim());

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await emailDocument(documentId, to.trim(), message, subject);
      if (res.sent) onSent({ to: res.to, leadMovedTo: res.leadMovedTo ?? null });
      else setError(res.message || "E-mailul nu a plecat.");
    } catch (err) {
      const body = (err as { body?: { message?: string } }).body;
      setError(body?.message ?? "E-mailul nu a putut fi trimis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Trimite ${noun} pe e-mail`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pleacă de la{" "}
          <strong className="text-foreground">{orgName ? `${orgName} · FinFlow Documente` : "FinFlow Documente"}</strong>;
          răspunsurile clientului vin la tine.
          {forClient && ` Clientul primește un buton să vadă ${isOffer ? "și să accepte oferta" : "documentul"}, plus PDF-ul atașat.`}
        </p>
        <div className="space-y-1">
          <Label htmlFor="send-doc-to">Către</Label>
          <Input id="send-doc-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} invalid={!!to && !validTo} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="send-doc-subject">Subiect</Label>
          <Input id="send-doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="send-doc-message">Mesaj</Label>
          <Textarea id="send-doc-message" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Renunță
          </Button>
          <Button onClick={() => void send()} disabled={busy || !validTo || !subject.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Trimite
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
