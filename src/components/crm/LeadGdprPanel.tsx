/**
 * CRM — drepturile persoanei, pe fișa leadului (cerința 63 din caietul de sarcini).
 *
 * Stă în fila „Detalii", sub formular: sunt acțiuni rare, dar trebuie să fie ACOLO unde se uită
 * omul când primește cererea la telefon — nu într-un ecran de setări pe care nimeni nu-l deschide
 * în timpul unei conversații.
 *
 * Trei drepturi diferite, ținute separat înadins:
 *   · acces/portabilitate → exportul, un fișier pe care i-l poți trimite;
 *   · retragerea consimțământului → „nu mă mai contactați", care NU șterge nimic;
 *   · ștergerea datelor → anonimizare ireversibilă, cu faptele comerciale păstrate.
 *
 * Butoanele apar doar pentru cine are dreptul: ascunse, nu dezactivate — un buton care nu poate
 * reuși e o promisiune falsă.
 */
import { useState } from "react";
import { AlertCircle, Download, Loader2, ShieldOff, UserX } from "lucide-react";
import { Alert, Button } from "@/components/ds";
import { anonymizeCrmLead, crmGdprExportUrl, revokeCrmLeadConsent, type CrmLead } from "@/lib/api/crm";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";

export interface LeadGdprPanelProps {
  lead: CrmLead & { consentRevokedAt?: string | null; consentAt?: string | null };
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
  /** Fișa se reîncarcă după o acțiune care schimbă datele. */
  onChanged: () => void;
}

export function LeadGdprPanel({ lead, onToast, onChanged }: LeadGdprPanelProps) {
  const { can } = useCrmPermissions();
  const [busy, setBusy] = useState<"revoke" | "anonymize" | null>(null);
  const revoked = !!lead.consentRevokedAt;

  async function revoke() {
    setBusy("revoke");
    try {
      await revokeCrmLeadConsent(lead.id);
      onToast({ kind: "success", message: "Consimțământ retras. Leadul nu mai poate fi contactat comercial." });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut retrage consimțământul." });
    } finally {
      setBusy(null);
    }
  }

  async function anonymize() {
    // Dublă confirmare, cu numele scris: acțiunea e ireversibilă, iar un „ești sigur?" simplu se
    // apasă din reflex.
    if (!confirm(`Ștergi datele personale ale „${lead.fullName}”?\n\nNumele, telefonul, emailul, notele și persoanele de contact dispar definitiv. Valoarea, etapa și motivul pierderii rămân — sunt fapte ale firmei, nu date ale persoanei.`)) {
      return;
    }
    setBusy("anonymize");
    try {
      await anonymizeCrmLead(lead.id);
      onToast({ kind: "success", message: "Datele personale au fost șterse." });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge datele." });
    } finally {
      setBusy(null);
    }
  }

  const canExport = can("audit.view");
  const canAnonymize = can("leads.delete");
  const canRevoke = can("leads.edit");
  if (!canExport && !canAnonymize && !canRevoke) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">Date personale (GDPR)</h3>

      {revoked && (
        <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
          Consimțământ retras pe{" "}
          {new Date(lead.consentRevokedAt as string).toLocaleDateString("ro-MD", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
          . Leadul nu mai poate fi contactat comercial.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canExport && (
          // Un `<a>`, nu un buton: serverul trimite un fișier, iar descărcarea are nevoie de
          // navigare reală, nu de o cerere din JavaScript.
          <a
            href={crmGdprExportUrl(lead.id)}
            className="inline-flex h-10 max-sm:h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportă datele
          </a>
        )}

        {canRevoke && !revoked && (
          <Button variant="outline" onClick={() => void revoke()} disabled={busy !== null}>
            {busy === "revoke" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldOff className="h-4 w-4" aria-hidden="true" />
            )}
            Retrage consimțământul
          </Button>
        )}

        {canAnonymize && (
          <Button variant="outline" onClick={() => void anonymize()} disabled={busy !== null}>
            {busy === "anonymize" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserX className="h-4 w-4" aria-hidden="true" />
            )}
            Șterge datele personale
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Ștergerea scoate numele, telefonul, emailul, notele și contactele. Valoarea, etapa și motivul pierderii
        rămân: sunt fapte ale firmei, nu date ale persoanei.
      </p>
    </section>
  );
}
