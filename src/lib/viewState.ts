/**
 * Memoria de ecran între navigări — „nu redesena pagina de la zero".
 *
 * Fiecare pagină își randează propriul shell, deci o navigare demontează tot arborele: paginile
 * reveneau la starea inițială (liste goale, spinner) și își refăceau toate cererile. Măsurat pe
 * `/business/par`: 11 cereri API la PRIMA vizită și tot 11 la a doua, plus o secundă în care
 * ecranul se compune bucată cu bucată (întâi lista, apoi bannerele „N cereri așteaptă decizia ta").
 *
 * Aici ținem ULTIMA valoare randată, pe cheie. La remontare, pagina pornește de la ea și abia
 * apoi împrospătează în fundal (stale-while-revalidate): omul vede imediat ecranul pe care l-a
 * lăsat, nu unul care se naște din nou.
 *
 * Prospețimea rămâne garantată de aceeași regulă ca la `apiCache`: ORICE mutație golește tot.
 * Nu ține date pe termen lung și nu supraviețuiește unui reload — e memorie de sesiune, atât.
 */
const store = new Map<string, unknown>();

export function hasViewState(key: string): boolean {
  return store.has(key);
}

export function getViewState<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setViewState<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Golit din `clearApiCache()` (deci după orice mutație) și la logout. */
export function clearViewState(): void {
  store.clear();
}
