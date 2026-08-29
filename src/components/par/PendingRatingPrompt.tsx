/**
 * PAR-VENDOR360 — cine ridică popup-ul de evaluare, și când.
 *
 * Montat pe tabloul de bord PAR. La încărcare întreabă serverul ce cereri PLĂTITE de mine nu au
 * încă evaluare de la mine, și deschide dialogul pentru prima dintre ele.
 *
 * De ce așa și nu la momentul plății: cel care apasă „plătit" e finanțistul, iar cel care știe cum
 * a fost prestat serviciul e solicitantul. Întrebarea trebuie să-l prindă pe al doilea, la
 * următoarea lui vizită — nu pe primul, în mijlocul cozii de plăți.
 *
 * Amânarea („Mai târziu") se ține în `localStorage`, 7 zile, per cerere. E o comoditate strict
 * personală, deci nu merită un tabel în baza de date: dacă omul își schimbă calculatorul, cel mai
 * rău lucru care se poate întâmpla e să fie întrebat încă o dată. Cererile neevaluate rămân
 * oricum vizibile pe fișa furnizorului, deci amânarea nu ascunde nimic definitiv.
 */
import { useEffect, useState } from "react";
import { listPendingRatings, type PendingRating } from "@/lib/api/parVendorProfile";
import { VendorRatingDialog } from "./VendorRatingDialog";

const SNOOZE_KEY = "par:rating-snooze";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function readSnoozed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    // Fereastră privată, stocare blocată, JSON stricat — niciunul nu e motiv să nu meargă pagina.
    return {};
  }
}

function snooze(parId: string): void {
  try {
    const all = readSnoozed();
    all[parId] = Date.now() + SNOOZE_MS;
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(all));
  } catch {
    /* fără stocare, întrebăm din nou data viitoare — acceptabil */
  }
}

export function PendingRatingPrompt({ onRated }: { onRated?: () => void }) {
  const [item, setItem] = useState<PendingRating | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { pending } = await listPendingRatings();
        if (cancelled) return;
        const snoozed = readSnoozed();
        const now = Date.now();
        const next = pending.find((p) => !(snoozed[p.parId] && snoozed[p.parId] > now));
        if (next) {
          setItem(next);
          setOpen(true);
        }
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
      onDismiss={() => snooze(item.parId)}
      onSaved={onRated}
    />
  );
}
