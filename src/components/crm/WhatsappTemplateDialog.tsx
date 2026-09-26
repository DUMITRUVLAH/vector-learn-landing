/**
 * COMMS-301 — alegerea unui template WhatsApp aprobat (în afara ferestrei de 24h Meta permite
 * doar template-uri). Folosit din inbox și din fișa leadului.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Select } from "@/components/ds";
import { commsErrorText, listTemplates, type WhatsappTemplate } from "@/lib/api/comms";

interface TemplateDialogProps {
  channelId: string;
  defaultParam: string;
  onClose: () => void;
  onSend: (tpl: { name: string; language: string; params: string[] }) => void;
}

export function TemplateDialog({ channelId, defaultParam, onClose, onSend }: TemplateDialogProps) {
  const [templates, setTemplates] = useState<WhatsappTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<WhatsappTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    listTemplates(channelId)
      .then((r) => setTemplates(r.templates))
      .catch((err) => setError(commsErrorText(err, "Nu am putut citi template-urile.")));
  }, [channelId]);

  const pick = (t: WhatsappTemplate) => {
    setChosen(t);
    setParams(Array.from({ length: t.paramCount }, (_, i) => (i === 0 ? defaultParam : "")));
  };

  const preview = chosen?.body
    ? chosen.body.replace(/\{\{([^}]+)\}\}/g, (_m, _k, offset: number) => {
        const idx = (chosen.body ?? "").slice(0, offset).match(/\{\{[^}]+\}\}/g)?.length ?? 0;
        return params[idx] || `{{${idx + 1}}}`;
      })
    : "";

  return (
    <Dialog
      open
      onClose={onClose}
      title="Template WhatsApp"
      description="În afara ferestrei de 24h, WhatsApp permite doar mesaje aprobate de Meta."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button
            disabled={!chosen || params.some((p) => !p.trim())}
            onClick={() => chosen && onSend({ name: chosen.name, language: chosen.language, params })}
          >
            Trimite template
          </Button>
        </>
      }
    >
      {error && <Alert variant="destructive">{error}</Alert>}
      {!templates && !error && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă" />}
      {templates && templates.length === 0 && (
        <p className="text-sm text-muted-foreground">Contul nu are template-uri aprobate. Creează unul în WhatsApp Manager (docs/comms/whatsapp.md).</p>
      )}
      {templates && templates.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tpl-pick">Template</Label>
            <Select
              id="tpl-pick"
              value={chosen ? `${chosen.name}|${chosen.language}` : ""}
              onChange={(e) => {
                const t = templates.find((x) => `${x.name}|${x.language}` === e.target.value);
                if (t) pick(t);
              }}
            >
              <option value="" disabled>
                Alege…
              </option>
              {templates.map((t) => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                  {t.name} ({t.language}{t.category ? ` · ${t.category.toLowerCase()}` : ""})
                </option>
              ))}
            </Select>
          </div>
          {chosen &&
            params.map((p, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`tpl-p-${i}`}>Parametrul {i + 1}</Label>
                <Input id={`tpl-p-${i}`} value={p} onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} />
              </div>
            ))}
          {chosen && preview && <p className="rounded-md bg-muted p-3 text-sm text-foreground">{preview}</p>}
          {chosen && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Template-urile se aprobă în Meta; după aprobare apar automat aici.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
