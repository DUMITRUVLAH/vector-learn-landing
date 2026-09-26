/**
 * CONTPLATA-faza-1 — clientul contului de plată, dintr-o singură căutare.
 *
 * Owner-ul: „nu intră toate datele despre client". Generatorul vechi căuta doar în registrul de
 * stat și păstra trei câmpuri. Aici aceeași căutare întreabă și clienții din CRM (au emailul și
 * telefonul pe care registrul nu le are) și registrul; alegerea completează TOT ce se știe, iar
 * fișa din registru se citește în detaliu (contactele stau acolo, nu în lista de rezultate).
 * Orice câmp rămâne editabil — o alegere greșită se corectează pe loc, nu de la zero.
 */
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Landmark, Loader2, Search } from "lucide-react";
import { Input, Label } from "@/components/ds";
import { cn } from "@/lib/utils";
import { listCrmCompanies, type CrmCompany } from "@/lib/api/crmCompanies";
import {
  getRegistryCompany,
  searchRegistry,
  type PaymentAccountBuyer,
  type RegistryCompany,
} from "@/lib/api/paymentAccounts";

export type BuyerValue = PaymentAccountBuyer & { crmCompanyId: string | null };

export const EMPTY_BUYER: BuyerValue = {
  buyerName: "",
  buyerIdno: null,
  buyerVatCode: null,
  buyerAddress: null,
  buyerCity: null,
  buyerEmail: null,
  buyerPhone: null,
  buyerIban: null,
  buyerBankName: null,
  buyerContact: null,
  crmCompanyId: null,
};

interface BuyerPickerProps {
  value: BuyerValue;
  onChange: (next: BuyerValue) => void;
  disabled?: boolean;
}

type Hit =
  | { kind: "crm"; key: string; company: CrmCompany }
  | { kind: "registry"; key: string; company: RegistryCompany };

const EXTRA_KEYS: (keyof BuyerValue)[] = ["buyerVatCode", "buyerCity", "buyerPhone", "buyerIban", "buyerBankName", "buyerContact"];

export function BuyerPicker({ value, onChange, disabled }: BuyerPickerProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(() => EXTRA_KEYS.some((k) => !!value[k]));
  const boxRef = useRef<HTMLDivElement>(null);

  // Detaliile suplimentare se deschid singure când o alegere le-a completat.
  useEffect(() => {
    if (EXTRA_KEYS.some((k) => !!value[k])) setShowMore(true);
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    let alive = true;
    const t = setTimeout(async () => {
      // Cele două surse în paralel; una căzută (ex. fără drept pe CRM) nu o strică pe cealaltă.
      const [crm, reg] = await Promise.all([
        listCrmCompanies(q).then((r) => r.items).catch(() => [] as CrmCompany[]),
        searchRegistry(q).then((r) => r.data).catch(() => [] as RegistryCompany[]),
      ]);
      if (!alive) return;
      const crmIdnos = new Set(crm.map((c) => c.idno).filter(Boolean));
      setHits([
        ...crm.slice(0, 5).map((c): Hit => ({ kind: "crm", key: `crm-${c.id}`, company: c })),
        // Aceeași firmă, deja în CRM, nu apare de două ori: fișa din CRM e mai bogată.
        ...reg
          .filter((r) => !r.idno || !crmIdnos.has(r.idno))
          .slice(0, 6)
          .map((r): Hit => ({ kind: "registry", key: `reg-${r.id}-${r.idno}`, company: r })),
      ]);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(hit: Hit) {
    setOpen(false);
    setQuery("");
    if (hit.kind === "crm") {
      const c = hit.company;
      onChange({
        ...EMPTY_BUYER,
        buyerName: c.name,
        buyerIdno: c.idno,
        buyerAddress: c.address,
        buyerEmail: c.email,
        buyerPhone: c.phone,
        crmCompanyId: c.id,
      });
      return;
    }
    const r = hit.company;
    const base: BuyerValue = {
      ...EMPTY_BUYER,
      buyerName: r.name,
      buyerIdno: r.idno,
      buyerAddress: r.address,
      buyerCity: r.city,
    };
    onChange(base);
    if (!r.idno) return;
    // Contactele (email, telefon) stau în fișa detaliată, nu în rezultatul căutării.
    setPicking(hit.key);
    try {
      const { data } = await getRegistryCompany(r.idno);
      onChange({
        ...base,
        buyerEmail: data.contacts?.emails?.[0] ?? null,
        buyerPhone: data.contacts?.phones?.[0] ?? null,
      });
    } catch {
      // Fără detaliu rămâne ce aveam — numele, IDNO-ul și adresa sunt deja completate.
    } finally {
      setPicking(null);
    }
  }

  const set = (key: keyof BuyerValue) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: key === "buyerName" ? e.target.value : e.target.value || null });

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <Label htmlFor="pa-buyer-search">Caută clientul — în CRM sau în registrul de stat</Label>
        <Input
          id="pa-buyer-search"
          value={query}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder="Nume firmă sau IDNO…"
          icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        />
        {open && query.trim().length >= 2 && (
          <ul
            role="listbox"
            aria-label="Rezultatele căutării clientului"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
          >
            {hits.length === 0 && !loading && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Nicio firmă găsită — completează datele de mână mai jos.
              </li>
            )}
            {hits.map((hit) => (
              <li key={hit.key} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pick(hit)}
                  className="flex min-h-[44px] w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  {hit.kind === "crm" ? (
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{hit.company.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {hit.kind === "crm" ? "Client CRM" : "Registrul de stat"}
                      {hit.company.idno ? ` · IDNO ${hit.company.idno}` : ""}
                      {hit.kind === "registry" && hit.company.city ? ` · ${hit.company.city}` : ""}
                      {hit.kind === "crm" && hit.company.email ? ` · ${hit.company.email}` : ""}
                    </span>
                  </span>
                  {picking === hit.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="pa-buyer-name" required>
            Denumirea clientului
          </Label>
          <Input id="pa-buyer-name" value={value.buyerName} onChange={set("buyerName")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-idno">IDNO / cod fiscal</Label>
          <Input id="pa-buyer-idno" value={value.buyerIdno ?? ""} onChange={set("buyerIdno")} disabled={disabled} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="pa-buyer-email">Email</Label>
          <Input id="pa-buyer-email" type="email" value={value.buyerEmail ?? ""} onChange={set("buyerEmail")} disabled={disabled} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="pa-buyer-address">Adresa</Label>
          <Input id="pa-buyer-address" value={value.buyerAddress ?? ""} onChange={set("buyerAddress")} disabled={disabled} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        aria-expanded={showMore}
        className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {showMore ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        {showMore ? "Mai puține detalii" : "Mai multe detalii (oraș, telefon, cod TVA, IBAN, bancă, persoană de contact)"}
      </button>

      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", !showMore && "hidden")}>
        <div>
          <Label htmlFor="pa-buyer-city">Oraș</Label>
          <Input id="pa-buyer-city" value={value.buyerCity ?? ""} onChange={set("buyerCity")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-phone">Telefon</Label>
          <Input id="pa-buyer-phone" type="tel" value={value.buyerPhone ?? ""} onChange={set("buyerPhone")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-vat">Cod TVA</Label>
          <Input id="pa-buyer-vat" value={value.buyerVatCode ?? ""} onChange={set("buyerVatCode")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-contact">Persoana de contact</Label>
          <Input id="pa-buyer-contact" value={value.buyerContact ?? ""} onChange={set("buyerContact")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-iban">IBAN-ul clientului</Label>
          <Input id="pa-buyer-iban" value={value.buyerIban ?? ""} onChange={set("buyerIban")} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="pa-buyer-bank">Banca clientului</Label>
          <Input id="pa-buyer-bank" value={value.buyerBankName ?? ""} onChange={set("buyerBankName")} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}
