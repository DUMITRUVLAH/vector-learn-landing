/**
 * PLATFORM-001 — cine e proprietarul platformei.
 *
 * Accesul de superadmin stă în tabela `platform_admins`. Dar prod-ul nu aplică fiabil
 * migrările și nu vrem să depindem de un INSERT manual în Supabase ca proprietarul să-și
 * poată deschide propria consolă. Deci: emailurile de mai jos (sau `PLATFORM_ADMIN_EMAILS`,
 * separate prin virgulă) sunt recunoscute direct, iar rândul din `platform_admins` se
 * creează singur la prima accesare.
 *
 * Nu e o portiță: cere tot un cont real, cu parolă, pe emailul respectiv.
 */
const FALLBACK_OWNER_EMAILS = ["vlah.business@gmail.com"];

export function platformOwnerEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS;
  const list = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : FALLBACK_OWNER_EMAILS;
  return list.length > 0 ? list : FALLBACK_OWNER_EMAILS;
}

export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformOwnerEmails().includes(email.trim().toLowerCase());
}

/**
 * SECURITY (audit 2026-08-29) — emailurile de proprietar sunt REZERVATE: nicio cale de creare
 * de cont nu are voie să producă un utilizator cu un asemenea email.
 *
 * De ce: `requirePlatformAdmin` recunoaște proprietarul DUPĂ EMAIL, iar `users` e unic pe
 * `(tenant_id, email)` — deci același email poate exista în alt workspace. Nicăieri în aplicație
 * nu se verifică posesia cutiei poștale. Lanțul complet, patru cereri: signup liber → invitație
 * către emailul proprietarului în workspace-ul propriu (verificarea „userul există deja" e
 * scoped pe tenant) → tokenul brut vine chiar în răspunsul API → accept-invite cu parolă proprie
 * → cont cu emailul proprietarului → `/api/platform/*` + impersonare pe orice client plătitor.
 *
 * Garda asta închide lanțul la sursă. `requirePlatformAdmin` are a doua barieră (fallback-ul pe
 * email moare de îndată ce există un rând real în `platform_admins`).
 */
export function isReservedPlatformEmail(email: string | null | undefined): boolean {
  return isPlatformOwnerEmail(email);
}

/** Răspunsul standard pentru o încercare de a revendica un email rezervat. */
export const RESERVED_EMAIL_ERROR = { error: "email_reserved" } as const;
