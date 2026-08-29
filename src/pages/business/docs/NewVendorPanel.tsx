/**
 * DG-110 — furnizor nou, fără să ieși din act.
 *
 * Realitatea zilnică: jumătate din acte se fac cu un furnizor care nu e încă în registru. Dacă
 * pentru asta trebuie să pleci în altă pagină, pierzi ciorna și cheful. Aici:
 *  1. lipești blocul de rechizite din e-mail → serverul îl despică în câmpuri (parserul folosit deja
 *     la beneficiarii PAR, acoperit de teste pe formate reale);
 *  2. la cerere, codul fiscal e verificat în registrul de firme → denumirea și adresa vin singure;
 *  3. salvezi, iar actul continuă cu furnizorul selectat.
 *
 * Registrul „indisponibil" NU se scrie „firmă inexistentă": rămâne un avertisment, iar salvarea
 * manuală merge mai departe.
 */
import { useCallback, useState } from "react";
import { Loader2, AlertCircle, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { createVendor, type ParVendor } from "@/lib/api/par";

export interface NewVendorPanelProps {
  onCreated: (vendor: ParVendor) => void;
  onCancel: () => void;
  /** Denumirea tastată deja în căutare — nu o mai scrie omul a doua oară. */
  initialName?: string;
}

interface ParsedRequisites {
  name: string | null;
  bank: string | null;
  bic_swift: string | null;
  idnp: string | null;
  vat_code: string | null;
  iban: string | null;
}

interface RegistryCompany {
  name?: string;
  address?: string;
  status?: string;
  legalForm?: string;
}

export function NewVendorPanel({ onCreated, onCancel, initialName = "" }: NewVendorPanelProps) {
  const [paste, setPaste] = useState("");
  const [name, setName] = useState(initialName);
  const [idnp, setIdnp] = useState("");
  const [iban, setIban] = useState("");
  const [bank, setBank] = useState("");
  const [bic, setBic] = useState("");
  const [address, setAddress] = useState("");
  const [administrator, setAdministrator] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parsePaste = useCallback(async () => {
    if (!paste.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = await api<ParsedRequisites>("/api/par/vendors/actions/parse-requisites", {
        method: "POST",
        body: JSON.stringify({ text: paste }),
      });
      if (parsed.name && !name) setName(parsed.name);
      if (parsed.idnp) setIdnp(parsed.idnp);
      if (parsed.iban) setIban(parsed.iban);
      if (parsed.bank) setBank(parsed.bank);
      if (parsed.bic_swift) setBic(parsed.bic_swift);
      setNotice("Am despicat rechizitele — verifică-le înainte de salvare.");
    } catch {
      setError("Nu am putut citi rechizitele lipite. Completează câmpurile manual.");
    } finally {
      setBusy(false);
    }
  }, [paste, name]);

  const lookupRegistry = useCallback(async () => {
    const code = idnp.trim();
    if (!code) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const company = await api<RegistryCompany>(`/api/registry/companies/${encodeURIComponent(code)}`);
      if (company?.name) setName(company.name);
      if (company?.address) setAddress(company.address);
      setNotice(
        company?.status && company.status.toLowerCase() !== "activ" && company.status.toLowerCase() !== "active"
          ? `Atenție: în registru firma apare cu statutul „${company.status}".`
          : "Firma a fost găsită în registru."
      );
    } catch {
      // Registrul poate fi pur și simplu indisponibil — asta NU înseamnă „firma nu există".
      setNotice("Registrul nu a răspuns acum. Poți completa datele manual.");
    } finally {
      setBusy(false);
    }
  }, [idnp]);

  const save = useCallback(async () => {
    if (!name.trim()) {
      setError("Denumirea furnizorului e obligatorie.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createVendor({
        name: name.trim(),
        idnp: idnp.trim() || null,
        iban: iban.replace(/\s/g, "").toUpperCase() || null,
        bank: bank.trim() || null,
        bic_swift: bic.trim() || null,
        legal_address: address.trim() || null,
        administrator_name: administrator.trim() || null,
      });
      onCreated(created);
    } catch {
      setError("Furnizorul nu a putut fi salvat. Verifică IBAN-ul și codul fiscal.");
    } finally {
      setBusy(false);
    }
  }, [name, idnp, iban, bank, bic, address, administrator, onCreated]);

  const field = (
    id: string,
    label: string,
    value: string,
    setter: (v: string) => void,
    placeholder?: string
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={placeholder}
        className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </div>
  );

  return (
    <section
      aria-label="Furnizor nou"
      className="mt-3 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Furnizor nou</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Lipește rechizitele din e-mail — se despart singure în câmpuri.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Renunță la furnizorul nou"
          className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}

      <div className="mt-3">
        <label htmlFor="vendor-paste" className="block text-sm font-medium text-foreground">
          Rechizite lipite
        </label>
        <textarea
          id="vendor-paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder={'SRL "Tehnica Nouă"\nc.f. 1234567890123\nBC Moldindconbank SA, MOLDMD2X309\nIBAN MD48ML000002259A19498121'}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() => void parsePaste()}
          className="touch-target mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Despica rechizitele
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {field("vendor-name", "Denumirea", name, setName, 'SRL "Tehnica Nouă"')}
        <div>
          <label htmlFor="vendor-idnp" className="block text-sm font-medium text-foreground">
            Cod fiscal (IDNO/IDNP)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="vendor-idnp"
              value={idnp}
              onChange={(e) => setIdnp(e.target.value)}
              placeholder="1234567890123"
              className="touch-target w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              disabled={busy || !idnp.trim()}
              onClick={() => void lookupRegistry()}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Verifică
            </button>
          </div>
        </div>
        {field("vendor-iban", "IBAN", iban, setIban, "MD48ML000002259A19498121")}
        {field("vendor-bank", "Banca", bank, setBank, "BC Moldindconbank SA")}
        {field("vendor-bic", "Cod bancar (BIC/SWIFT)", bic, setBic, "MOLDMD2X309")}
        {field("vendor-address", "Adresa juridică", address, setAddress, "mun. Chișinău, bd. Dacia 45")}
        {field("vendor-admin", "Administrator", administrator, setAdministrator, "Andrei Rusu")}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="touch-target rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
        >
          Renunță
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Salvează furnizorul
        </button>
      </div>
    </section>
  );
}
