/**
 * `useState` care supraviețuiește remontării — vezi `src/lib/viewState.ts` pentru DE CE.
 *
 * Se folosește exact ca `useState`, doar că primește o cheie stabilă. La a doua vizită pe
 * aceeași pagină, valoarea revine instantaneu, iar efectul care încarcă datele doar o
 * împrospătează. `hasKeepAlive(key)` spune dacă avem deja ceva, ca pagina să nu mai pornească
 * pe „se încarcă" când n-are ce încărca vizual.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { getViewState, hasViewState, setViewState } from "@/lib/viewState";

export { hasViewState as hasKeepAlive } from "@/lib/viewState";

export function useKeepAliveState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (hasViewState(key)) return getViewState<T>(key) as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        setViewState(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
