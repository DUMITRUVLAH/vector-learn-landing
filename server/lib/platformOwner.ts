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
