/**
 * Blocarea derulării paginii cât e deschisă o fereastră (dialog, fișă, vizualizator) — cu CONTOR.
 *
 * De ce nu „salvez valoarea veche și o pun la loc": cu două ferestre deschise una peste alta (fișa
 * leadului + „Act nou"), React le închide de sus în jos la navigare. Fișa punea la loc „" și apoi
 * dialogul punea la loc valoarea salvată de EL — „hidden". Pagina actului rămânea fără derulare
 * (ownerul: „nu pot face scroll pe pagina act"). Cu un contor, ordinea nu mai contează: pagina se
 * deblochează când se închide ULTIMA fereastră.
 */
let locks = 0;
let original = "";

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks === 0) original = document.body.style.overflow;
  locks += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = original === "hidden" ? "" : original;
  };
}

/** Doar pentru teste. */
export function _scrollLocksForTest(): number {
  return locks;
}
