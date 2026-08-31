/**
 * PAR-VENDOR360 — cine ridică popup-ul de evaluare, și când.
 *
 * Montat pe tabloul de bord PAR. La încărcare întreabă serverul ce cereri PLĂTITE de mine nu au
 * încă evaluare de la mine, și deschide dialogul pentru prima dintre ele — dacă regulile din
 * `@/lib/par/ratingPrompt` îi dau voie.
 *
 * De ce așa și nu la momentul plății: cel care apasă „plătit" e finanțistul, iar cel care știe cum
 * a fost prestat serviciul e solicitantul. Întrebarea trebuie să-l prindă pe al doilea, la
 * următoarea lui vizită — nu pe primul, în mijlocul cozii de plăți.
 *
 * Cât de des are voie să apară (o dată per cerere, cel mult una pe zi) și de ce, e explicat în
 * `ratingPrompt.ts`. Aici doar respectăm verdictul lui: marcăm cererea ca „întrebată" ÎN MOMENTUL
 * deschiderii, ca un refresh cu dialogul pe ecran să nu reînceapă aceeași conversație.
 */
import { useEffect, useState } from "react";
import { listPendingRatings, type PendingRating } from "@/lib/api/parVendorProfile";
import {
  chooseNextRating,
  readRatingPromptMemory,
  rememberAsked,
  writeRatingPromptMemory,
} from "@/lib/par/ratingPrompt";
import { VendorRatingDialog } from "./VendorRatingDialog";

export function PendingRatingPrompt({ onRated }: { onRated?: () => void }) {
  const [item, setItem] = useState<PendingRating | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { pending } = await listPendingRatings();
        if (cancelled) return;
        const next = chooseNextRating(pending, readRatingPromptMemory());
        if (!next) return;
        // Întâi urma, apoi ecranul: dacă omul dă refresh cu dialogul deschis, nu-l mai întrebăm.
        writeRatingPromptMemory(rememberAsked(readRatingPromptMemory(), next.parId));
        setItem(next);
        setOpen(true);
      } catch {
        // Un popup de evaluare nu are voie să strice tabloul de bord dacă apelul pică.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!item) return null;

  return (
    <VendorRatingDialog
      open={open}
      onClose={() => setOpen(false)}
      vendorId={item.vendorId}
      vendorName={item.vendorName}
      parId={item.parId}
      requestNo={item.requestNo}
      onSaved={onRated}
    />
  );
}
