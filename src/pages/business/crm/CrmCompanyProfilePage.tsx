/**
 * CRM-D04 — „Datele firmei tale": rechizitele scrise o dată, tipărite pe fiecare ofertă și contract.
 *
 * De ce există (lecția din VectorB2B): acolo datele firmei se completează o singură dată și apar pe
 * orice act. La noi, IBAN-ul, banca și semnatarul n-aveau unde fi scrise, așa că fiecare ofertă
 * ieșea cu „IBAN ______" chiar în blocul furnizorului — exact partea pe care clientul o copiază ca
 * să plătească.
 *
 * Cine poate schimba: cine administrează pâlniile (admin / manager). Ceilalți văd datele — trebuie
 * să știe ce pleacă pe actele lor — dar câmpurile sunt blocate.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Input, Label } from "@/components/ds";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";
import {
  getCrmCompanyProfile,
  saveCrmCompanyProfile,
  type CrmCompanyProfile,
} from "@/lib/api/crmCompanyProfile";

const EMPTY: CrmCompanyProfile = {
  legalName: "",
  idno: null,
  vatNumber: null,
  address: null,
  iban: null,
  bankName: null,
  bic: null,
  administratorName: null,
  administratorTitle: null,
  phone: null,
  email: null,
};

type FieldKey = keyof CrmCompanyProfile;

interface FieldDef {
  key: FieldKey;
  label: string;
  placeholder?: string;
  /** Pe acte: câmpul apare în blocul furnizorului, deci lipsa lui se vede pe hârtie. */
  onDocuments?: boolean;
  type?: string;
  wide?: boolean;
}

const SECTIONS: { title: string; hint: string; fields: FieldDef[] }[] = [
  {
    title: "Firma",
    hint: "Cum apare firma în capul fiecărui act.",
    fields: [
      { key: "legalName", label: "Denumirea juridică", placeholder: "Vector Academy SRL", onDocuments: true, wide: true },
      { key: "idno", label: "IDNO", placeholder: "13 cifre", onDocuments: true },
      { key: "vatNumber", label: "Cod TVA", placeholder: "dacă sunteți plătitori de TVA" },
      { key: "address", label: "Adresa juridică", placeholder: "mun. Chișinău, str. …", onDocuments: true, wide: true },
    ],
  },
  {
    title: "Banca",
    hint: "Contul pe care clientul îl copiază din ofertă ca să plătească.",
    fields: [
      { key: "iban", label: "IBAN", placeholder: "MD24AG000225100013104168", onDocuments: true, wide: true },
      { key: "bankName", label: "Banca", placeholder: "BC Moldova-Agroindbank SA", onDocuments: true },
      { key: "bic", label: "Cod bancar (BIC)", placeholder: "AGRNMD2X" },
    ],
  },
  {
    title: "Cine semnează",
    hint: "Numele de pe blocul de semnături și datele de contact din subsolul ofertei.",
    fields: [
      { key: "administratorName", label: "Administratorul", placeholder: "Nume Prenume", onDocuments: true },
      { key: "administratorTitle", label: "Funcția", placeholder: "Director general" },
      { key: "phone", label: "Telefon", placeholder: "+373 22 000 000", type: "tel" },
      { key: "email", label: "E-mail", placeholder: "office@firma.md", type: "email" },
    ],
  },
];

export function CrmCompanyProfilePage() {
  const { can, loading: permsLoading } = useCrmPermissions();
  const canEdit = can("pipelines.manage");
  const [profile, setProfile] = useState<CrmCompanyProfile>(EMPTY);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    getCrmCompanyProfile()
      .then((r) => {
        setProfile(r.profile);
        setMissing(r.missing);
      })
      .catch(() => setError("Nu am putut încărca datele firmei."))
      .finally(() => setLoading(false));
  }, []);

  function set(key: FieldKey, value: string) {
    setSavedAt(null);
    setProfile((p) => ({ ...p, [key]: key === "legalName" ? value : value || null }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await saveCrmCompanyProfile(profile);
      setProfile(r.profile);
      setMissing(r.missing);
      setSavedAt(new Date());
    } catch (err) {
      const body = (err as { body?: { message?: string } }).body;
      setError(body?.message ?? "Nu am putut salva datele firmei.");
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !canEdit || permsLoading;

  return (
    <BusinessShell
      pageTitle="Datele firmei"
      pageDescription="Scrise o dată, apar pe fiecare ofertă și contract trimis clienților."
    >
      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă datele firmei" />
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-3xl space-y-8" aria-label="Datele firmei">
          {missing.length > 0 ? (
            <Alert variant="warning">
              Pe acte ies încă goale: <strong>{missing.join(", ")}</strong>. Completează-le o dată și
              ofertele nu mai pleacă cu linii de completat de mână.
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              Actele ies complete — toate rechizitele firmei sunt aici.
            </p>
          )}
          {!canEdit && !permsLoading && (
            <p className="text-sm text-muted-foreground">Doar un administrator sau un manager poate schimba aceste date.</p>
          )}

          {SECTIONS.map((section) => (
            <Section key={section.title} title={section.title} hint={section.hint}>
              {section.fields.map((f) => (
                <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={`firma-${f.key}`}>
                    {f.label}
                    {f.onDocuments && <span className="sr-only"> (apare pe acte)</span>}
                  </Label>
                  <Input
                    id={`firma-${f.key}`}
                    type={f.type ?? "text"}
                    value={profile[f.key] ?? ""}
                    placeholder={f.placeholder}
                    disabled={readOnly}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="mt-1"
                  />
                </div>
              ))}
            </Section>
          ))}

          {error && <Alert variant="destructive">{error}</Alert>}

          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || !profile.legalName.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Salvează
              </Button>
              {savedAt && (
                <span className="text-sm text-muted-foreground" role="status">
                  Salvat. Actele noi le folosesc de acum.
                </span>
              )}
            </div>
          )}
        </form>
      )}
    </BusinessShell>
  );
}

interface SectionProps {
  title: string;
  hint: string;
  children: ReactNode;
}

function Section({ title, hint, children }: SectionProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-medium">{title}</legend>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
