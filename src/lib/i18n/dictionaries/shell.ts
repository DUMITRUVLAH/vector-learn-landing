/**
 * Dicționar `shell.*` — chrome-ul comun `BusinessShell` (sidebar, secțiuni de
 * navigare, rândul de utilitare). Etichetele de status/rol PAR NU se dublează
 * aici — shell-ul le refolosește din `par.status.*` / `par.role.*`.
 */
import type { Dict, Translated } from "../types";

export const ro = {} as const satisfies Dict;

export const en: Translated<typeof ro> = {};
