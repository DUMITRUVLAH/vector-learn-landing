/**
 * CX-705 — Break-even / projected profit calculation
 *
 * Re-exports the shared pure function from src/lib/cohortBreakeven.ts.
 * Server routes import from here; client components and tests import from @/lib/cohortBreakeven.
 *
 * NOTE: This module intentionally has no server-only dependencies so it can be
 * shared between server and client contexts.
 */
export {
  computeCohortBreakeven,
  type BreakevenInput,
  type BreakevenResult,
} from "../../src/lib/cohortBreakeven";
