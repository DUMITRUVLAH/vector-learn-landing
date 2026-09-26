/**
 * Formularul unei firme — același pentru „Firmă nouă" (lista de clienți) și „Editează" (fișa
 * clientului), ca cele două să nu ajungă să ceară câmpuri diferite.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Textarea } from "@/components/ds";
import {
  createCrmCompany,
  updateCrmCompany,
  type CrmCompany,
  type CrmCompanyInput,
} from "@/lib/api/crmCompanies";

export interface CompanyFormDialogProps {
  /** Fișa de editat; lipsă = firmă nouă. */
  company?: CrmCompany | null;
  onClose: () => void;
  onSaved: (company: CrmCompany) => void | Promise<void>;
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function CompanyFormDialog({ company, onClose, onSaved }: CompanyFormDialogProps) {
  const [form, setForm] = useState<CrmCompanyInput>(() => ({
    name: company?.name ?? "",
    idno: company?.idno ?? "",
    industry: company?.industry ?? "",
    region: company?.region ?? "",
    companySize: company?.companySize ?? "",
    website: company?.website ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    address: company?.address ?? "",
    notes: company?.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CrmCompanyInput>(key: K, value: CrmCompanyInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Un câmp golit se trimite ca null — altfel „șterg telefonul" ar lăsa un șir gol în bază.
    const body = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" && k !== "name" ? v.trim() || null : v])
    ) as CrmCompanyInput;
    try {
      const saved = company ? await updateCrmCompany(company.id, body) : await createCrmCompany(body);
      await onSaved(saved);
    } catch (err) {
      setError(errText(err, "Nu am putut salva firma."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={company ? "Editează firma" : "Firmă nouă"} size="lg">
      <div className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="space-y-1">
          <Label htmlFor="f-nume">Denumire</Label>
          <Input id="f-nume" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="f-idno">Cod fiscal (IDNO)</Label>
            <Input id="f-idno" value={form.idno ?? ""} onChange={(e) => set("idno", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-industrie">Industrie</Label>
            <Input id="f-industrie" value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-regiune">Regiune</Label>
            <Input id="f-regiune" value={form.region ?? ""} onChange={(e) => set("region", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-marime">Mărime</Label>
            <Input id="f-marime" value={form.companySize ?? ""} onChange={(e) => set("companySize", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-telefon">Telefon</Label>
            <Input id="f-telefon" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-email">Email</Label>
            <Input id="f-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-site">Site web</Label>
          <Input id="f-site" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-adresa">Adresă</Label>
          <Input id="f-adresa" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-note">Notițe</Label>
          <Textarea id="f-note" rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={() => void save()} disabled={saving || form.name.trim().length < 2}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
