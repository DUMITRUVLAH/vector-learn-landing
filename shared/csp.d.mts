export declare const SUPABASE_HOST_WILDCARD: string;
export declare function storageOriginFromEnv(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): string;
export declare function cspDirectives(opts?: {
  storageOrigin?: string;
  frameAncestors?: "'none'" | "'self'";
}): string[];
export declare function csp(opts?: {
  storageOrigin?: string;
  frameAncestors?: "'none'" | "'self'";
}): string;
