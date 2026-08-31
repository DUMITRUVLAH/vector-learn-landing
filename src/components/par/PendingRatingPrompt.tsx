/**
 * PAR-VENDOR360 — cine ridică popup-ul de evaluare, și când.
 *
 * Montat pe tabloul de bord PAR. La încărcare întreabă serverul ce cereri PLĂTITE de mine, recente,
 * nu au încă evaluare de la mine — și despre care nu am mai fost întrebat niciodată.
 *
 * De ce așa și nu la momentul plății: cel care apasă „plătit" e finanțistul, iar cel care știe cum
 * a fost prestat serviciul e solicitantul. Întrebarea trebuie să-l prindă pe al doilea, la
 * următoarea lui vizită — nu pe primul, în mijlocul cozii de plăți.
 *
 * Câte întrebări are voie să pună (una pe sesiune, una singură per cerere, pentru totdeauna) e
 * explicat în `ratingPrompt.ts`. Aici doar respectăm verdictul lui și lăsăm urma în DOUĂ locuri, în
 * ordinea asta: întâi local (instantaneu), apoi pe server (`markRatingAsked` — singurul care
 * supraviețuiește unei autentificări noi pe alt calculator). Ecranul se arată abia după.
 */
import { useEffect, useState } from "react";
import { listPendingRatings, markRatingAsked, type PendingRating } from "@/lib/api/parVendorProfile";
import {
  askedThisSession,
  chooseNextRating,
  markAskedThisSession,
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
    // O întrebare pe sesiune: verificăm ÎNAINTE de apelul la server, ca un refresh să nu mai coste
    // nici măcar o cerere de rețea.
    if (askedThisSession()) return;
    void (async () => {
      try {
        const { pending } = await listPendingRatings();
        if (cancelled) return;
        const next = chooseNextRating(pending, readRatingPromptMemory());
        if (!next) return;
        // Întâi urma, apoi ecranul: dacă omul dă refresh cu dialogul deschis, nu-l mai întrebăm.
        writeRatingPromptMemory(rememberAsked(readRatingPromptMemory(), next.parId));
        markAskedThisSession();
        // Marcajul durabil nu blochează afișarea: dacă apelul pică (offline), garda locală ține
        // până la următoarea sesiune, iar serverul o să afle data viitoare.
        void markRatingAsked(next.parId).catch(() => {});
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
