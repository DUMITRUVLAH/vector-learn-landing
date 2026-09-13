import { useEffect, useState } from "react";

/** Sub asta considerăm că suntem pe telefon — același prag ca `md:` din Tailwind. */
const PHONE_QUERY = "(max-width: 767px)";

/**
 * Suntem pe un ecran de telefon?
 *
 * De ce un hook și nu `hidden md:block` pe două variante: ecranele cu tabele late (coada de
 * finanțe) au nevoie de o cu totul altă formă pe telefon — carduri. Ținute amândouă în DOM și
 * ascunse cu CSS, fiecare rând ar exista de două ori pentru cititorul de ecran și pentru orice
 * căutare din pagină, iar testele ar găsi două butoane „Înregistrează plata" pentru aceeași cerere.
 * Randăm doar varianta potrivită.
 *
 * Prima citire se face SINCRON, în inițializatorul de stare: dacă am porni de la `false` și am
 * corecta în `useEffect`, telefonul ar afișa o clipă tabelul lat înainte să sară la carduri.
 * În medii fără `matchMedia` (jsdom, la teste) răspunsul e „nu e telefon", deci testele existente
 * văd tabelul, ca până acum.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isPhone;
}
