/**
 * Compunerea dicționarelor. Un singur loc de adăugat când apare un modul nou:
 * scrii `dictionaries/<modul>.ts` cu `ro` + `en`, îl adaugi aici, gata.
 *
 * Cheile sunt prefixate pe modul (`par.*`, `landing.*`), deci fuziunea nu poate
 * produce coliziuni tăcute — iar `assertNoOverlap` (test) o verifică oricum.
 */
import type { Dict, Lang } from "../types";
import * as common from "./common";
import * as landing from "./landing";
import * as par from "./par";

/** Dicționarul RO — sursa de adevăr pentru mulțimea de chei. */
export const RO = {
  ...common.ro,
  ...landing.ro,
  ...par.ro,
} as const;

/** Dicționarul EN — aceleași chei, garantat de `Translated<>` în fiecare fișier. */
export const EN: Record<keyof typeof RO, string> = {
  ...common.en,
  ...landing.en,
  ...par.en,
};

/** Uniunea tuturor cheilor valide — ce acceptă `t()`. */
export type TranslationKey = keyof typeof RO;

export const DICTS: Record<Lang, Dict> = { ro: RO, en: EN };

/** Namespace-urile, expuse pentru testele de paritate și pentru `scripts/i18n-check.mjs`. */
export const NAMESPACES = { common, landing, par } as const;
