/**
 * CRM — bara de segmentare a bazei de leaduri (cerința 4 din caietul de sarcini).
 *
 * Până acum, „arată-mi firmele din energie, peste 500 MWh consum" se putea face doar din modulul
 * Clienți, iar rezultatul nu se întorcea niciodată în tabla de leaduri — omul vedea firmele, dar
 * nu oportunitățile lor. Bara asta mută filtrarea acolo unde se lucrează.
 *
 * Trei decizii de interfață, toate din același motiv („un filtru ascuns minte"):
 *
 * 1. Opțiunile vin de la server (`GET /api/crm/leads/segments`), nu dintr-o listă de produs.
 *    Nomenclatorul de industrii diferă de la un client la altul, iar un select cu opțiuni care
 *    întorc zero rânduri e mai rău decât niciun select.
 * 2. Filtrele active rămân vizibile ca etichete ȘI cu panoul închis, fiecare cu „×"-ul ei.
 *    Altfel, cineva care a filtrat ieri deschide azi tabla, vede 12 leaduri în loc de 300 și
 *    crede că a pierdut baza.
 * 3. Panoul se deschide sub bară, nu într-un popover: pe telefon un popover cu șase câmpuri e
 *    o fereastră care acoperă exact datele pe care le filtrezi.
 */
import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Badge, Button, Input, Label, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import { getCrmSegmentOptions, type CrmSegmentOptions } from "@/lib/api/crm";
import { cleanCrmSegments, crmSegmentCount, type CrmSegmentFilters } from "@/lib/crm/segmentFilters";

export interface SegmentFilterBarProps {
  value: CrmSegmentFilters;
  onChange: (next: CrmSegmentFilters) => void;
}

const EMPTY_OPTIONS: CrmSegmentOptions = {
  industries: [],
  regions: [],
  sizes: [],
  products: [],
  consumption: null,
};

/** Formatare scurtă pentru praguri: 1 500 000 kWh se citește greu, 1 500 MWh nu. */
function formatKwh(value: number): string {
  if (value >= 1000) return `${(value / 1000).toLocaleString("ro-MD", { maximumFractionDigits: 1 })} MWh`;
  return `${value.toLocaleString("ro-MD")} kWh`;
}

export function SegmentFilterBar({ value, onChange }: SegmentFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CrmSegmentOptions>(EMPTY_OPTIONS);
  const [loaded, setLoaded] = useState(false);

  const activeCount = crmSegmentCount(value);

  // Opțiunile se cer la prima deschidere, nu la montarea paginii: majoritatea intrărilor în
  // pipeline nu ating segmentarea, iar ecranul are deja două cereri la încărcare.
  const loadOptions = useCallback(async () => {
    try {
      setOptions(await getCrmSegmentOptions());
    } catch {
      // Segmentarea e un filtru, nu o funcție critică: fără opțiuni, bara rămâne închisă și
      // restul ecranului funcționează neschimbat.
      setOptions(EMPTY_OPTIONS);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) void loadOptions();
  }, [open, loaded, loadOptions]);

  // O vizualizare salvată poate aplica un segment cu panoul închis; etichetele au nevoie de
  // numele produsului, nu de id-ul lui.
  useEffect(() => {
    if (!loaded && value.productId) void loadOptions();
  }, [loaded, value.productId, loadOptions]);

  function patch(next: Partial<CrmSegmentFilters>) {
    onChange(cleanCrmSegments({ ...value, ...next }));
  }

  const productName = value.productId
    ? options.products.find((p) => p.id === value.productId)?.name ?? "Produs ales"
    : null;

  const chips: { key: keyof CrmSegmentFilters; label: string }[] = [];
  if (value.industry) chips.push({ key: "industry", label: `Industrie: ${value.industry}` });
  if (value.region) chips.push({ key: "region", label: `Regiune: ${value.region}` });
  if (value.companySize) chips.push({ key: "companySize", label: `Mărime: ${value.companySize}` });
  if (productName) chips.push({ key: "productId", label: `Produs: ${productName}` });
  if (value.minConsumptionKwh !== undefined)
    chips.push({ key: "minConsumptionKwh", label: `Consum ≥ ${formatKwh(value.minConsumptionKwh)}` });
  if (value.maxConsumptionKwh !== undefined)
    chips.push({ key: "maxConsumptionKwh", label: `Consum ≤ ${formatKwh(value.maxConsumptionKwh)}` });

  const nothingToSegment =
    loaded &&
    options.industries.length === 0 &&
    options.regions.length === 0 &&
    options.sizes.length === 0 &&
    options.products.length === 0 &&
    options.consumption === null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={activeCount > 0 ? "default" : "outline"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="crm-segment-panel"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Segmentare
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>

        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => patch({ [chip.key]: undefined } as Partial<CrmSegmentFilters>)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Scoate filtrul ${chip.label}`}
          >
            {chip.label}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ))}

        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>
            Golește segmentul
          </Button>
        )}
      </div>

      <div
        id="crm-segment-panel"
        hidden={!open}
        className={cn("rounded-lg border border-border bg-card p-3", !open && "hidden")}
      >
        {nothingToSegment ? (
          <p className="text-sm text-muted-foreground">
            Nicio firmă din bază n-are încă industrie, regiune, mărime sau consum anual, și nu ai produse
            active în catalog. Completează-le din „Clienți &amp; companii" (sau la import) și segmentele
            apar aici singure.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="crm-segment-industry">Industrie</Label>
              <Select
                id="crm-segment-industry"
                value={value.industry ?? "all"}
                onChange={(e) => patch({ industry: e.target.value === "all" ? undefined : e.target.value })}
              >
                <option value="all">Toate industriile</option>
                {options.industries.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="crm-segment-region">Regiune</Label>
              <Select
                id="crm-segment-region"
                value={value.region ?? "all"}
                onChange={(e) => patch({ region: e.target.value === "all" ? undefined : e.target.value })}
              >
                <option value="all">Toate regiunile</option>
                {options.regions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="crm-segment-size">Mărime firmă</Label>
              <Select
                id="crm-segment-size"
                value={value.companySize ?? "all"}
                onChange={(e) => patch({ companySize: e.target.value === "all" ? undefined : e.target.value })}
              >
                <option value="all">Orice mărime</option>
                {options.sizes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="crm-segment-product">Produs</Label>
              <Select
                id="crm-segment-product"
                value={value.productId ?? "all"}
                onChange={(e) => patch({ productId: e.target.value === "all" ? undefined : e.target.value })}
              >
                <option value="all">Toate produsele</option>
                {options.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="crm-segment-min-kwh">Consum anual de la (kWh)</Label>
              <Input
                id="crm-segment-min-kwh"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={options.consumption ? String(options.consumption.min) : "ex: 100000"}
                value={value.minConsumptionKwh ?? ""}
                onChange={(e) =>
                  patch({ minConsumptionKwh: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </div>

            <div>
              <Label htmlFor="crm-segment-max-kwh">până la (kWh)</Label>
              <Input
                id="crm-segment-max-kwh"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={options.consumption ? String(options.consumption.max) : "ex: 500000"}
                value={value.maxConsumptionKwh ?? ""}
                onChange={(e) =>
                  patch({ maxConsumptionKwh: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </div>
          </div>
        )}

        {!nothingToSegment && (
          <p className="mt-3 text-xs text-muted-foreground">
            Industria, regiunea, mărimea și consumul sunt ale FIRMEI leadului. Leadurile fără firmă
            atașată nu intră în aceste filtre.
          </p>
        )}
      </div>
    </div>
  );
}
