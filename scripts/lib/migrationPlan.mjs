/**
 * Logica PURĂ a migrărilor în paralel — fără git, fără disc, testabilă.
 *
 * De ce există: ownerul pornește des mai mulți agenți deodată pe același repo. Fiecare branch își
 * numerota migrarea „max de pe main + 1", deci doi agenți primeau același număr (2026-09-26: 0191,
 * apoi 0192 — de două ori într-o oră). Iar `when` (timpul din jurnal) e și mai periculos decât
 * numărul: drizzle aplică o migrare DOAR dacă `when` > ultimul `created_at` aplicat
 * (node_modules/drizzle-orm/pg-core/dialect.js). Două branch-uri cu `when = ultimul + 1` → al
 * doilea livrat e SĂRIT în tăcere pe orice bază care l-a aplicat deja pe primul.
 *
 * Regulile de aici, folosite de scripts/migration-new.mjs și scripts/ship-to-main.mjs:
 *   1. o migrare care nu e încă pe main primește un număr > max(main) și nefolosit;
 *   2. `when`-urile migrărilor proprii sunt strict crescătoare și > orice `when` de pe main;
 *   3. un conflict pe `_journal.json` se rezolvă prin UNIUNE (toate intrările, fără dubluri), nu
 *      prin „a mea" sau „a lor" — altfel se pierde migrarea celuilalt.
 */

export const pad4 = (n) => String(n).padStart(4, "0");

/** „0191_crm_task_ora" → „crm_task_ora". */
export const slugOf = (tag) => tag.replace(/^\d{4}_/, "");

export const retag = (tag, idx) => `${pad4(idx)}_${slugOf(tag)}`;

export function parseJournal(text) {
  const j = JSON.parse(text);
  if (!Array.isArray(j.entries)) throw new Error("_journal.json fără `entries`");
  return j;
}

/** Jurnalul serializat exact cum îl scrie drizzle (2 spații + linie nouă la final). */
export function formatJournal(journal) {
  return `${JSON.stringify(journal, null, 2)}\n`;
}

/**
 * Uniunea a două jurnale: `base` rămâne în ordinea lui, intrările din `incoming` care lipsesc (după
 * `tag`) se adaugă la coadă. Nu renumerotează — asta e treaba lui `planRenumber`, după rebase.
 */
export function unionJournals(base, incoming) {
  const seen = new Set(base.entries.map((e) => e.tag));
  const extra = incoming.entries.filter((e) => !seen.has(e.tag));
  return { ...base, entries: [...base.entries, ...extra.map((e) => ({ ...e }))] };
}

/**
 * Ce migrații proprii trebuie renumerotate și ce `when` primesc.
 *
 * @param mainJournal  jurnalul de pe origin/main
 * @param localJournal jurnalul branch-ului (după rebase: conține main + ale mele)
 * @param taken        numere rezervate de ALȚII (setul de rezervări minus ale mele)
 * @returns { own, changes: [{from, to, idx, when}], journal } — `journal` = jurnalul nou
 */
export function planRenumber(mainJournal, localJournal, taken = new Set()) {
  const mainTags = new Set(mainJournal.entries.map((e) => e.tag));
  const mainIdx = new Set(mainJournal.entries.map((e) => e.idx));
  const mainMaxIdx = Math.max(-1, ...mainJournal.entries.map((e) => e.idx));
  const mainMaxWhen = Math.max(0, ...mainJournal.entries.map((e) => Number(e.when) || 0));

  const mainEntries = localJournal.entries.filter((e) => mainTags.has(e.tag));
  const own = localJournal.entries.filter((e) => !mainTags.has(e.tag));

  const used = new Set([...mainIdx, ...taken]);
  const changes = [];
  let when = mainMaxWhen;
  const renumbered = own
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((e) => {
      // Numărul se păstrează doar dacă e peste main, liber și nefolosit de o altă migrare proprie.
      let idx = e.idx;
      if (idx <= mainMaxIdx || used.has(idx)) {
        idx = Math.max(mainMaxIdx, ...used) + 1;
        while (used.has(idx)) idx += 1;
      }
      used.add(idx);
      when += 1;
      const next = { ...e, idx, tag: retag(e.tag, idx), when };
      if (next.tag !== e.tag || next.when !== e.when) {
        changes.push({ from: e.tag, to: next.tag, idx, when, oldWhen: e.when });
      }
      return next;
    });

  // Ordinea din jurnal = ordinea de aplicare: întâi main (neschimbat), apoi ale mele, crescător.
  return { own: renumbered, changes, journal: { ...localJournal, entries: [...mainEntries, ...renumbered] } };
}

/**
 * Invariantele unui jurnal sănătos. Întoarce lista problemelor (goală = OK).
 *
 * `ownTags` = migrațiile care NU sunt încă pe main. Regula lui `when` se aplică doar lor: istoria de
 * pe main are deja 15 `when`-uri ne-crescătoare (0025, 0031, 0040…) — pe bazele care le aplicaseră
 * pe cele dinainte, drizzle le-a SĂRIT; de aici „migrările nu se aplică fiabil pe prod", pe care îl
 * acoperă sync-schema. Rescrierea `when`-urilor deja aplicate ar fi mai riscantă decât răul, deci
 * istoria doar se raportează (`historicalWhenProblems`), nu blochează.
 */
export function journalProblems(journal, ownTags = new Set()) {
  const problems = [];
  const idx = journal.entries.map((e) => e.idx);
  const dupIdx = idx.filter((x, i) => idx.indexOf(x) !== i);
  if (dupIdx.length) problems.push(`idx duplicat: ${[...new Set(dupIdx)].join(", ")}`);
  const tags = journal.entries.map((e) => e.tag);
  const dupTags = tags.filter((x, i) => tags.indexOf(x) !== i);
  if (dupTags.length) problems.push(`tag duplicat: ${[...new Set(dupTags)].join(", ")}`);
  const prefixes = journal.entries.map((e) => e.tag.slice(0, 4));
  const dupPrefix = prefixes.filter((x, i) => prefixes.indexOf(x) !== i);
  if (dupPrefix.length) problems.push(`prefix de fișier duplicat: ${[...new Set(dupPrefix)].join(", ")}`);
  for (const e of journal.entries) {
    if (ownTags.has(e.tag) && e.tag.slice(0, 4) !== pad4(e.idx)) problems.push(`${e.tag}: prefixul nu corespunde idx ${e.idx}`);
  }
  const others = journal.entries.filter((e) => !ownTags.has(e.tag));
  let floor = Math.max(0, ...others.map((e) => Number(e.when) || 0));
  for (const e of journal.entries.filter((x) => ownTags.has(x.tag))) {
    const w = Number(e.when);
    if (!(w > floor)) {
      problems.push(
        `when ${w} al lui ${e.tag} nu e peste ${floor} — drizzle ar SĂRI migrarea pe orice bază care a aplicat deja migrările de dinainte`
      );
    }
    floor = Math.max(floor, w);
  }
  return problems;
}

/** Doar raport: `when`-urile ne-crescătoare din istorie (migrări sărite pe bazele vechi). */
export function historicalWhenProblems(journal) {
  const out = [];
  for (let i = 1; i < journal.entries.length; i += 1) {
    if (!(Number(journal.entries[i].when) > Number(journal.entries[i - 1].when))) out.push(journal.entries[i].tag);
  }
  return out;
}

/** Numărul următor pentru o migrare nouă: peste main, peste local, peste orice rezervare. */
export function nextNumber(mainJournal, localJournal, reserved = []) {
  const all = [
    ...mainJournal.entries.map((e) => e.idx),
    ...localJournal.entries.map((e) => e.idx),
    ...reserved,
  ];
  return Math.max(-1, ...all) + 1;
}
