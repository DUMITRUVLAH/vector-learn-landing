/**
 * Plasă de siguranță pentru derularea paginii, la fiecare schimbare de rută.
 *
 * Ownerul: „nu se poate face scroll aici la fel" — pe Automatizări, după ce blocajul lăsat de fișa
 * leadului + „Act nou" (vezi `scrollLock.ts`) îl urmase de pe o pagină pe alta. Stilul lui `body`
 * trăiește în afara React, deci o navigare nu-l curăță: un singur blocaj rămas agățat strică TOATE
 * paginile de după, până la reîncărcare.
 *
 * Contorul repară cauza cunoscută; garda asta prinde orice cauză viitoare: dacă nu mai e deschisă
 * nicio fereastră modală, pagina nu are niciun motiv să rămână blocată.
 */
export function clearOrphanScrollLock(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.style.overflow !== "hidden") return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  document.body.style.overflow = "";
  return true;
}
