/**
 * PAR-VENDOR360 — ce știm despre furnizor, ARĂTAT ÎN MOMENTUL ALEGERII.
 *
 * Toată evaluarea din fișă nu valorează nimic dacă omul care completează cererea n-o vede când
 * alege beneficiarul. Aici scoatem exact două lucruri, în ordinea gravității:
 *   1. dacă furnizorul e BLOCAT — cu motivul, roșu, imposibil de ratat;
 *   2. nota medie și câte păreri stau în spatele ei, plus legătura către fișa completă.
 *
 * Nu blocăm trimiterea cererii: decizia rămâne a omului (poate există un motiv întemeiat, iar un
 * blocaj tăcut ar fi mai rău decât un avertisment citit). Semnalăm și mergem mai departe — aceeași
 * regulă ca la validarea IBAN-ului din registru.
 */
import { useEffect, useState } from "react";
import { ShieldAlert, Star } from "lucide-react";
import { Link } from "@/router/HashRouter";
import { StarRating } from "./VendorStars";
import { listVendorDirectory, type VendorDirectoryItem } from "@/lib/api/parVendorProfile";

/** Cache pe durata sesiunii de pagină: lista se cere o dată, nu la fiecare schimbare de beneficiar. */
let cache: Promise<VendorDirectoryItem[]> | null = null;

function loadDirectory(): Promise<VendorDirectoryItem[]> {
  if (!cache) {
    cache = listVendorDirectory({ includeInactive: true })
      .then((r) => r.vendors)
      .catch(() => {
        // O eroare aici nu are voie să blocheze completarea cererii; reîncercăm la următoarea montare.
        cache = null;
        return [];
      });
  }
  return cache;
}

export function VendorSignal({ vendorId }: { vendorId: string }) {
  const [vendor, setVendor] = useState<VendorDirectoryItem | null>(null);

  useEffect(() => {
    if (!vendorId) {
      setVendor(null);
      return;
    }
    let cancelled = false;
    void loadDirectory().then((list) => {
      if (!cancelled) setVendor(list.find((v) => v.id === vendorId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (!vendor) return null;

  const blocked = vendor.relationship === "blocked";

  return (
    <div className="mt-2 flex flex-col gap-2">
      {blocked && (
        <p
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive"
          role="alert"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Furnizor blocat.</strong> {vendor.blockedReason ?? "Fără motiv notat."}
          </span>
        </p>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {vendor.ratingCount > 0 ? (
          <StarRating value={vendor.ratingAvg} count={vendor.ratingCount} />
        ) : (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            Niciun coleg nu l-a evaluat încă
          </span>
        )}
        <span aria-hidden="true">·</span>
        <Link to={`/business/par/vendors/${vendor.id}`} className="text-primary hover:underline">
          Vezi fișa furnizorului
        </Link>
      </p>
    </div>
  );
}
