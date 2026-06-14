/**
 * BANKLINK-002: Dialog creare conexiune bancară nouă.
 *
 * Design: Vector 365 tokens, light + dark, WCAG AA.
 * Validare client: Nume obligatoriu, IBAN format dacă completat.
 */
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createConnection, type ImportFormat } from "@/lib/api/finBankLink";
import { cn } from "@/lib/utils";

interface BankLinkAddDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

const BANK_CODES = [
  { value: "MAIB", label: "MAIB — Banca de Economii" },
  { value: "MOLDINDCONBANK", label: "Moldindconbank" },
  { value: "VICBANK", label: "Victoriabank" },
  { value: "FINCOMBANK", label: "FinComBank" },
  { value: "MOBIASBANCA", label: "MobiasBancă" },
  { value: "OTHER", label: "Altă bancă" },
];

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: "OFX", label: "OFX — Open Financial Exchange" },
  { value: "MT940", label: "MT940 — SWIFT Statement" },
];

// Minimal IBAN regex for MD + international
const IBAN_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{0,30}$/;

export function BankLinkAddDialog({ onClose, onCreated }: BankLinkAddDialogProps) {
  const [name, setName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountIban, setAccountIban] = useState("");
  const [currency, setCurrency] = useState("MDL");
  const [importFormat, setImportFormat] = useState<ImportFormat>("OFX");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Câmp obligatoriu";
    if (accountIban && !IBAN_REGEX.test(accountIban.replace(/\s/g, "").toUpperCase())) {
      errs.accountIban = "Format IBAN invalid (ex: MD24AGRO0000000025XXXXXXXXXX)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await createConnection({
        name: name.trim(),
        bankCode: bankCode || undefined,
        accountIban: accountIban.replace(/\s/g, "").toUpperCase() || undefined,
        currency,
        importFormat,
      });
      onCreated();
    } catch {
      setErrors({ form: "Eroare la creare. Încearcă din nou." });
    } finally {
      setLoading(false);
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 id="dialog-title" className="text-lg font-semibold text-foreground">
            Adaugă conexiune bancară
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Închide dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Eroare generală */}
          {errors.form && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.form}
            </p>
          )}

          {/* Nume */}
          <div className="mb-4">
            <label htmlFor="conn-name" className="mb-1 block text-sm font-medium text-foreground">
              Nume conexiune <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="conn-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: MAIB — Cont Principal"
              className={cn(
                "h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.name ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.name ? "conn-name-err" : undefined}
              aria-required="true"
            />
            {errors.name && (
              <p id="conn-name-err" className="mt-1 text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Cod bancă */}
          <div className="mb-4">
            <label htmlFor="conn-bank" className="mb-1 block text-sm font-medium text-foreground">
              Bancă
            </label>
            <select
              id="conn-bank"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Selectează banca (opțional)</option>
              {BANK_CODES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* IBAN */}
          <div className="mb-4">
            <label htmlFor="conn-iban" className="mb-1 block text-sm font-medium text-foreground">
              IBAN cont bancar
            </label>
            <input
              id="conn-iban"
              type="text"
              value={accountIban}
              onChange={(e) => setAccountIban(e.target.value)}
              placeholder="MD24AGRO0000000025XXXXXXXXXX"
              className={cn(
                "h-10 w-full rounded-lg border bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.accountIban ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.accountIban ? "conn-iban-err" : undefined}
            />
            {errors.accountIban && (
              <p id="conn-iban-err" className="mt-1 text-xs text-destructive">
                {errors.accountIban}
              </p>
            )}
          </div>

          {/* Monedă + Format */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="conn-currency" className="mb-1 block text-sm font-medium text-foreground">
                Monedă
              </label>
              <select
                id="conn-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="MDL">MDL</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="RON">RON</option>
              </select>
            </div>
            <div>
              <label htmlFor="conn-format" className="mb-1 block text-sm font-medium text-foreground">
                Format import
              </label>
              <select
                id="conn-format"
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as ImportFormat)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-lg border border-input text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se salvează...
                </>
              ) : (
                "Adaugă conexiune"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
