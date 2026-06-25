/**
 * VM1-03: BNM rate accessor — thin re-export of the FX service at server/lib/fx.ts.
 * The actual implementation (cache, XML parse, fallback) lives there; this module
 * provides the path expected by the VM1-03 spec for clarity and future isolation.
 */
export {
  getMdlRate,
  toMdlCents,
  parseBnmRate,
  bnmDate,
  __resetFxCache,
  type FxFetch,
} from "../fx";
