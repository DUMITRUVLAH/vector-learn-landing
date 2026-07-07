/**
 * TB-004: Generarea taskurilor dintr-un șablon — logică PURĂ (fără DB).
 *
 * Fiecare rând de șablon devine un task cu dueDate = ancoră + offsetDays:
 *   - ancora = startDate sau endDate a produsului (offsetAnchor)
 *   - offsetDays cu semn: -30 = cu 30 de zile ÎNAINTE de ancoră
 *   - ancoră lipsă → dueDate null (taskul rămâne de programat manual în Tabel)
 *   - defaultListName → lista boardului (case-insensitive), altfel prima listă,
 *     altfel null (lane-ul „Neîncadrate")
 * Ruta (boardTemplates.ts) doar orchestrează DB-ul în jurul acestei funcții.
 */

export interface TemplateItemInput {
  id: string;
  title: string;
  description: string | null;
  assigneeRole: string | null;
  defaultPriority: string;
  offsetAnchor: string; // "start" | "end"
  offsetDays: number;
  defaultListName: string | null;
  position: number;
}

export interface ProductDatesInput {
  startDate: string | null;
  endDate: string | null;
}

export interface ListRef {
  id: string;
  name: string;
  position: number;
}

export interface GeneratedTaskPlan {
  templateItemId: string;
  title: string;
  description: string | null;
  assigneeRole: string | null;
  priority: string;
  dueDate: string | null;
  listId: string | null;
  position: number;
}

/** Adaugă n zile (cu semn) la o dată ISO "YYYY-MM-DD" — UTC-safe, fără librării. */
export function addDaysIso(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Planul de inserare pentru un set de rânduri de șablon.
 * `basePosition` = poziția maximă existentă în listele țintă (pozițiile noi cresc de acolo).
 */
export function planGeneratedTasks(
  items: TemplateItemInput[],
  product: ProductDatesInput | null,
  lists: ListRef[],
  basePosition: number
): { tasks: GeneratedTaskPlan[]; unscheduledCount: number } {
  const sortedLists = [...lists].sort((a, b) => a.position - b.position);
  const firstList = sortedLists[0] ?? null;
  const byName = new Map(sortedLists.map((l) => [l.name.trim().toLowerCase(), l]));

  const sortedItems = [...items].sort((a, b) => a.position - b.position);
  let unscheduledCount = 0;
  const tasks = sortedItems.map((item, i) => {
    const anchor =
      item.offsetAnchor === "end" ? (product?.endDate ?? null) : (product?.startDate ?? null);
    const dueDate = anchor ? addDaysIso(anchor, item.offsetDays) : null;
    if (!dueDate) unscheduledCount++;

    const matched = item.defaultListName
      ? (byName.get(item.defaultListName.trim().toLowerCase()) ?? firstList)
      : firstList;

    return {
      templateItemId: item.id,
      title: item.title,
      description: item.description,
      assigneeRole: item.assigneeRole,
      priority: item.defaultPriority,
      dueDate,
      listId: matched?.id ?? null,
      position: basePosition + (i + 1) * 1024,
    };
  });

  return { tasks, unscheduledCount };
}
