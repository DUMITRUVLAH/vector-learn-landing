/**
 * CRM-U04 — scadența unui task: dată, sau dată + oră.
 *
 * Ownerul: „la taskuri să poți pune și ora". Taskul „toată ziua" se păstrează la prânz (ca data să
 * nu alunece cu o zi la conversia în UTC) și se afișează fără oră; taskul cu oră se afișează cu ea.
 */

/** Data (YYYY-MM-DD) + ora opțională (HH:MM) → ISO. Fără oră = prânz local, ca înainte. */
export function combineDue(date: string, time: string): { dueAt: string | null; dueHasTime: boolean } {
  if (!date) return { dueAt: null, dueHasTime: false };
  const hasTime = /^\d{2}:\d{2}$/.test(time);
  return { dueAt: new Date(`${date}T${hasTime ? time : "12:00"}:00`).toISOString(), dueHasTime: hasTime };
}

/**
 * Restant: taskul cu oră — după ora lui; taskul „toată ziua" — abia după ce i se termină ziua.
 * Înainte, orice task cu dată devenea „restant" la prânz, în chiar ziua în care era scadent.
 */
export function isDueOverdue(dueAt: string | null | undefined, dueHasTime: boolean | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (dueHasTime) return due.getTime() < now.getTime();
  const endOfDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
  return endOfDay.getTime() <= now.getTime();
}

/** „27 sept. 2026" / „27 sept. 2026, 14:30"; `short` = „27.09" / „27.09, 14:30" (pe cartonaș). */
export function formatDue(dueAt: string, dueHasTime: boolean | undefined, style: "long" | "short" = "long"): string {
  const d = new Date(dueAt);
  const date =
    style === "short"
      ? d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit" })
      : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
  if (!dueHasTime) return date;
  return `${date}, ${d.toLocaleTimeString("ro-MD", { hour: "2-digit", minute: "2-digit" })}`;
}
