/**
 * PAY-008: AccountingMappingsForm — configure account codes per transaction type.
 */
import { useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listAccountingMappings,
  upsertAccountingMapping,
  type AccountingMapping,
  type AccountingTransactionType,
} from "@/lib/api/accounting";
import { useEffect } from "react";

const TRANSACTION_LABELS: Record<AccountingTransactionType, string> = {
  payment: "Plată client (PL)",
  refund: "Rambursare / notă credit (NC)",
  payout: "Salariu / dispoziție plată (DP)",
};

const DEFAULT_CODES: Record<AccountingTransactionType, string> = {
  payment: "704",
  refund: "704",
  payout: "421",
};

const DEFAULT_TEMPLATES: Record<AccountingTransactionType, string> = {
  payment: "Taxă curs — {description}",
  refund: "Rambursare — {description}",
  payout: "Salariu — {partner}",
};

interface MappingFormRow {
  type: AccountingTransactionType;
  accountCode: string;
  descriptionTemplate: string;
  existingId?: string;
}

export function AccountingMappingsForm() {
  const [rows, setRows] = useState<MappingFormRow[]>([
    { type: "payment", accountCode: DEFAULT_CODES.payment, descriptionTemplate: DEFAULT_TEMPLATES.payment },
    { type: "refund", accountCode: DEFAULT_CODES.refund, descriptionTemplate: DEFAULT_TEMPLATES.refund },
    { type: "payout", accountCode: DEFAULT_CODES.payout, descriptionTemplate: DEFAULT_TEMPLATES.payout },
  ]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccountingMappings()
      .then(({ items }) => {
        setRows((prev) =>
          prev.map((row) => {
            const existing = items.find((m) => m.transactionType === row.type);
            if (existing) {
              return {
                ...row,
                accountCode: existing.accountCode,
                descriptionTemplate: existing.descriptionTemplate,
                existingId: existing.id,
              };
            }
            return row;
          })
        );
      })
      .catch(() => {
        // Fail silently — defaults are fine
      });
  }, []);

  const updateRow = (type: AccountingTransactionType, field: "accountCode" | "descriptionTemplate", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.type === type ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        rows.map((r) =>
          upsertAccountingMapping({
            transactionType: r.type,
            accountCode: r.accountCode.trim(),
            descriptionTemplate: r.descriptionTemplate.trim(),
          })
        )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Nu s-au putut salva configurările.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold">Conturi contabile per tip tranzacție</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Configurează codurile contabile utilizate la exportul SAGA / 1C.
          </p>
        </div>
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.type} className="px-5 py-4 grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {TRANSACTION_LABELS[row.type]}
                </p>
                <div className="space-y-2">
                  <div>
                    <label
                      htmlFor={`acc-code-${row.type}`}
                      className="block text-xs font-semibold mb-1"
                    >
                      Cod cont (e.g. 704)
                    </label>
                    <input
                      id={`acc-code-${row.type}`}
                      type="text"
                      value={row.accountCode}
                      onChange={(e) => updateRow(row.type, "accountCode", e.target.value)}
                      maxLength={30}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
                      placeholder={DEFAULT_CODES[row.type]}
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Template descriere
                </p>
                <label
                  htmlFor={`acc-tmpl-${row.type}`}
                  className="sr-only"
                >
                  Template descriere pentru {TRANSACTION_LABELS[row.type]}
                </label>
                <input
                  id={`acc-tmpl-${row.type}`}
                  type="text"
                  value={row.descriptionTemplate}
                  onChange={(e) => updateRow(row.type, "descriptionTemplate", e.target.value)}
                  maxLength={500}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder={DEFAULT_TEMPLATES[row.type]}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Variabile: {"{description}"}, {"{partner}"}, {"{document}"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors",
            saved
              ? "bg-success/15 text-success border border-success/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {saving ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {saved ? "Salvat!" : saving ? "Se salvează…" : "Salvează configurare"}
        </button>
      </div>
    </div>
  );
}
