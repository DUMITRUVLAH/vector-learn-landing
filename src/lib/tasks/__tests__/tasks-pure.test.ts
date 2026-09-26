import { describe, expect, it } from 'vitest';
import { sortTasks } from '../sorting';
import {
  POSITION_STEP,
  needsRebalance,
  positionAtEnd,
  positionBetween,
  positionForDrop,
  rebalancedPositions,
} from '../positions';
import { listIdForStatus, moveStatusPatch, statusFromListName } from '../board-status';
import { dueDay, groupTasksByDue, isOverdue, progressOf, subtaskCounts, todayIso } from '../grouping';
import {
  activeFilterCount,
  filterTasks,
  sanitizeSearchQuery,
  workloadByAssignee,
  type TaskFilterState,
} from '../filters';
import { distinctTags, parseTag, serializeTag } from '../tags';
import type { BoardTask, TaskStatus } from '../types';

const FIXED_NOW = '2026-08-01T10:00:00.000Z';
const now = () => FIXED_NOW;

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    company_id: 'c1',
    board_id: 'b1',
    list_id: null,
    parent_task_id: null,
    title: 'Task',
    description: null,
    status: 'todo',
    priority: 'medium',
    position: 1024,
    assigned_to: null,
    assignees: [],
    assigned_by: null,
    created_by: 'u0',
    start_date: null,
    due_date: null,
    estimated_minutes: null,
    actual_minutes: null,
    source_module: 'manual',
    source_id: null,
    is_private: false,
    is_recurring: false,
    recurrence_rule: null,
    depends_on: null,
    tags: [],
    sort_order: 0,
    completed_at: null,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Poziții fracționate ─────────────────────────────────────────────────────

describe('positions', () => {
  it('inserează la mijloc între doi vecini', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it('tratează capetele listei', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 1024)).toBe(512);
    expect(positionBetween(1024, null)).toBe(1024 + POSITION_STEP);
  });

  it('adaugă la coadă peste maximul existent, nu peste ultimul element', () => {
    // Ordinea din array nu contează — contează valoarea maximă.
    expect(positionAtEnd([1024, 4096, 2048])).toBe(4096 + POSITION_STEP);
    expect(positionAtEnd([])).toBe(POSITION_STEP);
  });

  it('positionForDrop calculează poziția după indexul țintă', () => {
    const col = [1000, 2000, 3000];
    expect(positionForDrop(col, 0)).toBe(500); // deasupra tuturor
    expect(positionForDrop(col, 1)).toBe(1500); // între primul și al doilea
    expect(positionForDrop(col, 3)).toBe(3000 + POSITION_STEP); // la coadă
  });

  it('semnalează epuizarea preciziei și oferă renumerotarea', () => {
    expect(needsRebalance(1024, 2048)).toBe(false);
    const a = 1;
    const b = a + Number.EPSILON;
    expect(needsRebalance(a, b)).toBe(true);
    expect(rebalancedPositions(3)).toEqual([1024, 2048, 3072]);
  });
});

// ─── Sincronizarea status ↔ coloană ──────────────────────────────────────────

describe('statusFromListName', () => {
  it('ignoră diacriticele și majusculele', () => {
    expect(statusFromListName('În lucru')).toBe('in_progress');
    expect(statusFromListName('in lucru')).toBe('in_progress');
    expect(statusFromListName('IN LUCRU')).toBe('in_progress');
    expect(statusFromListName('În așteptare')).toBe('pending');
    expect(statusFromListName('De făcut')).toBe('todo');
    expect(statusFromListName('Gata')).toBe('done');
  });

  it('întoarce null pentru coloane custom', () => {
    expect(statusFromListName('Idei pentru Q4')).toBeNull();
    expect(statusFromListName(null)).toBeNull();
  });
});

describe('moveStatusPatch', () => {
  it('mutarea în coloana terminală marchează gata', () => {
    expect(moveStatusPatch('todo', { is_done_list: true, name: 'Gata' }, now)).toEqual({
      status: 'done',
      completed_at: FIXED_NOW,
    });
  });

  it('reordonarea în interiorul coloanei terminale nu rescrie completed_at', () => {
    expect(moveStatusPatch('done', { is_done_list: true, name: 'Gata' }, now)).toEqual({});
  });

  it('scoaterea din Gata resetează completed_at', () => {
    expect(moveStatusPatch('done', { is_done_list: false, name: 'Idei' }, now)).toEqual({
      status: 'in_progress',
      completed_at: null,
    });
  });

  it('coloana cu nume cunoscut impune statusul ei', () => {
    expect(moveStatusPatch('todo', { is_done_list: false, name: 'În lucru' }, now)).toEqual({
      status: 'in_progress',
      completed_at: null,
    });
  });

  it('nu schimbă nimic dacă statusul e deja cel corect', () => {
    expect(moveStatusPatch('in_progress', { is_done_list: false, name: 'În lucru' }, now)).toEqual(
      {},
    );
  });
});

describe('listIdForStatus', () => {
  const lists = [
    { id: 'l1', name: 'De făcut', is_done_list: false },
    { id: 'l2', name: 'În lucru', is_done_list: false },
    { id: 'l3', name: 'Gata', is_done_list: true },
  ];

  it('done trimite cardul în coloana terminală', () => {
    expect(listIdForStatus('done', 'todo', 'l1', lists)).toBe('l3');
  });

  it('nu mută dacă e deja acolo', () => {
    expect(listIdForStatus('done', 'done', 'l3', lists)).toBeUndefined();
  });

  it('un status cu coloană proprie mută cardul acolo', () => {
    expect(listIdForStatus('in_progress', 'todo', 'l1', lists)).toBe('l2');
  });

  it('ieșirea din Gata fără coloană dedicată revine în prima coloană activă', () => {
    expect(listIdForStatus('pending', 'done', 'l3', lists)).toBe('l1');
  });

  it('board fără coloane nu produce mutări', () => {
    expect(listIdForStatus('done', 'todo', null, [])).toBeUndefined();
  });
});

// ─── Grupare pe termene ──────────────────────────────────────────────────────

describe('groupTasksByDue', () => {
  const today = '2026-08-01';

  it('împarte pe secțiunile corecte', () => {
    const groups = groupTasksByDue(
      [
        task({ id: 'restant', due_date: '2026-07-30T00:00:00Z' }),
        task({ id: 'azi', due_date: '2026-08-01T15:00:00Z' }),
        task({ id: 'saptamana', due_date: '2026-08-05T00:00:00Z' }),
        task({ id: 'tarziu', due_date: '2026-09-20T00:00:00Z' }),
        task({ id: 'fara' }),
      ],
      today,
    );
    expect(groups.overdue.map((t) => t.id)).toEqual(['restant']);
    expect(groups.today.map((t) => t.id)).toEqual(['azi']);
    expect(groups.week.map((t) => t.id)).toEqual(['saptamana']);
    expect(groups.later.map((t) => t.id)).toEqual(['tarziu']);
    expect(groups.unscheduled.map((t) => t.id)).toEqual(['fara']);
  });

  it('exclude task-urile gata din toate secțiunile', () => {
    const groups = groupTasksByDue(
      [task({ status: 'done', due_date: '2026-07-01T00:00:00Z' })],
      today,
    );
    expect(Object.values(groups).every((list) => list.length === 0)).toBe(true);
  });

  it('granița de zi nu alunecă din cauza fusului orar', () => {
    // Un termen la 23:00 UTC în ziua curentă rămâne „azi", nu „restant".
    const groups = groupTasksByDue([task({ due_date: '2026-08-01T23:00:00Z' })], today);
    expect(groups.today).toHaveLength(1);
    expect(groups.overdue).toHaveLength(0);
  });

  it('ziua a 7-a intră încă în „săptămâna asta", a 8-a nu', () => {
    const groups = groupTasksByDue(
      [
        task({ id: 'z7', due_date: '2026-08-08T00:00:00Z' }),
        task({ id: 'z8', due_date: '2026-08-09T00:00:00Z' }),
      ],
      today,
    );
    expect(groups.week.map((t) => t.id)).toEqual(['z7']);
    expect(groups.later.map((t) => t.id)).toEqual(['z8']);
  });

  it('todayIso folosește data locală, nu UTC', () => {
    // 1 ianuarie 02:00 ora locală: `toISOString()` ar da 31 decembrie în fusuri
    // cu offset pozitiv. Verificăm că întoarce chiar ziua din obiectul Date.
    const d = new Date(2026, 0, 1, 2, 0, 0);
    expect(todayIso(d)).toBe('2026-01-01');
  });

  it('dueDay extrage partea de dată din timestamp', () => {
    expect(dueDay(task({ due_date: '2026-08-01T23:30:00Z' }))).toBe('2026-08-01');
    expect(dueDay(task())).toBeNull();
  });

  it('isOverdue ignoră task-urile gata', () => {
    expect(isOverdue(task({ due_date: '2026-07-01T00:00:00Z' }), today)).toBe(true);
    expect(isOverdue(task({ due_date: '2026-07-01T00:00:00Z', status: 'done' }), today)).toBe(false);
  });
});

describe('progressOf', () => {
  it('calculează procentul și distribuția pe status', () => {
    const p = progressOf([
      task({ status: 'done' }),
      task({ status: 'done' }),
      task({ status: 'todo' }),
      task({ status: 'in_progress' }),
    ]);
    expect(p).toMatchObject({ total: 4, done: 2, pct: 50 });
    expect(p.byStatus).toEqual({ done: 2, todo: 1, in_progress: 1 });
  });

  it('lista goală nu dă NaN', () => {
    expect(progressOf([])).toMatchObject({ total: 0, done: 0, pct: 0 });
  });
});

// ─── Filtre ──────────────────────────────────────────────────────────────────

describe('filterTasks', () => {
  const today = '2026-08-01';
  const base: TaskFilterState = { period: 'all' };

  const dataset = [
    task({ id: 'a', status: 'todo', priority: 'urgent', assignees: ['u1'], assigned_to: 'u1' }),
    task({ id: 'b', status: 'in_progress', priority: 'low', assignees: ['u1', 'u2'], assigned_to: 'u1' }),
    task({ id: 'c', status: 'done', priority: 'medium' }),
    task({ id: 'sub', parent_task_id: 'a', status: 'todo' }),
  ];

  it('ascunde implicit sub-taskurile și task-urile gata', () => {
    expect(filterTasks(dataset, base, today).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('includeSubtasks / includeDone le readuc', () => {
    const ids = filterTasks(dataset, { ...base, includeSubtasks: true, includeDone: true }, today)
      .map((t) => t.id);
    expect(ids).toEqual(['a', 'b', 'c', 'sub']);
  });

  it('filtrul de persoană prinde și co-responsabilii', () => {
    // u2 e doar în `assignees`, nu în `assigned_to` — exact cazul care lipsea.
    expect(filterTasks(dataset, { ...base, person: 'u2' }, today).map((t) => t.id)).toEqual(['b']);
  });

  it('filtrul de status „done" nu mai e anulat de includeDone', () => {
    expect(filterTasks(dataset, { ...base, status: 'done' }, today).map((t) => t.id)).toEqual(['c']);
  });

  it('caută în titlu și descriere, case-insensitive', () => {
    const items = [
      task({ id: 'x', title: 'Pregătește Raportul' }),
      task({ id: 'y', title: 'Altceva', description: 'conține raportul lunar' }),
      task({ id: 'z', title: 'Nimic' }),
    ];
    expect(filterTasks(items, { ...base, search: 'raportul' }, today).map((t) => t.id)).toEqual([
      'x',
      'y',
    ]);
  });

  it('perioadele se raportează la ziua dată, nu la ceasul mașinii', () => {
    const items = [
      task({ id: 'restant', due_date: '2026-07-20T00:00:00Z' }),
      task({ id: 'azi', due_date: '2026-08-01T08:00:00Z' }),
      task({ id: 'maine', due_date: '2026-08-02T08:00:00Z' }),
      task({ id: 'luna', due_date: '2026-08-28T08:00:00Z' }),
      task({ id: 'fara' }),
    ];
    const ids = (f: TaskFilterState) => filterTasks(items, { ...base, ...f }, today).map((t) => t.id);
    expect(ids({ period: 'overdue' })).toEqual(['restant']);
    expect(ids({ period: 'today' })).toEqual(['azi']);
    expect(ids({ period: 'tomorrow' })).toEqual(['maine']);
    expect(ids({ period: 'month' })).toEqual(['azi', 'maine', 'luna']);
    expect(ids({ period: 'nodate' })).toEqual(['fara']);
    expect(ids({ period: 'custom', from: '2026-08-01', to: '2026-08-02' })).toEqual(['azi', 'maine']);
  });

  it('filtrul de etichetă compară doar label-ul, nu culoarea', () => {
    const items = [
      task({ id: 'cu', tags: ['Urgent|red'] }),
      task({ id: 'fara', tags: ['Altceva'] }),
    ];
    expect(filterTasks(items, { ...base, tag: 'urgent' }, today).map((t) => t.id)).toEqual(['cu']);
    expect(filterTasks(items, { ...base, tag: 'Urgent|blue' }, today).map((t) => t.id)).toEqual([
      'cu',
    ]);
  });

  it('numără filtrele active pentru badge', () => {
    expect(activeFilterCount({ period: 'all' })).toBe(0);
    expect(activeFilterCount({ period: 'today', person: 'u1', search: '  ' })).toBe(2);
  });
});

describe('sortTasks', () => {
  it('termenul lipsă merge la coadă', () => {
    const items = [
      task({ id: 'fara' }),
      task({ id: 'tarziu', due_date: '2026-09-01T00:00:00Z' }),
      task({ id: 'devreme', due_date: '2026-08-02T00:00:00Z' }),
    ];
    expect(sortTasks(items, { key: 'due_date', dir: 'asc' }).map((t) => t.id)).toEqual(['devreme', 'tarziu', 'fara']);
  });

  it('prioritatea urgentă e prima', () => {
    const items = [
      task({ id: 'low', priority: 'low' }),
      task({ id: 'urgent', priority: 'urgent' }),
      task({ id: 'medium', priority: 'medium' }),
    ];
    expect(sortTasks(items, { key: 'priority', dir: 'asc' }).map((t) => t.id)).toEqual(['urgent', 'medium', 'low']);
  });

  it('sortarea manuală respectă pozițiile fracționate', () => {
    const items = [
      task({ id: 'c', position: 3000 }),
      task({ id: 'a', position: 1000 }),
      task({ id: 'b', position: 1500 }),
    ];
    expect(sortTasks(items, { key: 'manual', dir: 'asc' }).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('nu mută array-ul original', () => {
    const items = [task({ id: 'b', position: 2000 }), task({ id: 'a', position: 1000 })];
    sortTasks(items, { key: 'manual', dir: 'asc' });
    expect(items.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('workloadByAssignee', () => {
  it('numără per persoană, inclusiv co-responsabilii, și ignoră ce e gata', () => {
    const load = workloadByAssignee([
      task({ assignees: ['u1'], assigned_to: 'u1' }),
      task({ assignees: ['u1', 'u2'], assigned_to: 'u1' }),
      task({ assignees: ['u2'], assigned_to: 'u2', status: 'done' }),
      task({}),
    ]);
    expect(load).toEqual({ u1: 2, u2: 1, __unassigned: 1 });
  });
});

// ─── Etichete ────────────────────────────────────────────────────────────────

describe('tags', () => {
  it('parsează formatul label|culoare și tolerează label-uri cu bară', () => {
    expect(parseTag('Urgent|red')).toEqual({ label: 'Urgent', color: 'red' });
    expect(parseTag('Simplu')).toEqual({ label: 'Simplu', color: 'gray' });
    expect(parseTag('A/B|test|blue')).toEqual({ label: 'A/B|test', color: 'blue' });
  });

  it('culoarea necunoscută cade pe gri', () => {
    expect(parseTag('X|chartreuse')).toEqual({ label: 'X', color: 'gray' });
  });

  it('serializarea e inversa parsării', () => {
    for (const raw of ['Urgent|red', 'Simplu', 'A/B|test|blue']) {
      expect(serializeTag(parseTag(raw))).toBe(raw);
    }
  });

  it('distinctTags deduplică fără să țină cont de majuscule', () => {
    const tags = distinctTags([
      { tags: ['Urgent|red', 'Client'] },
      { tags: ['urgent|red', 'Client'] },
      { tags: null },
    ]);
    expect(tags.map((t) => t.label)).toEqual(['Client', 'Urgent']);
  });
});

// ─── Contract de tipuri ──────────────────────────────────────────────────────

describe('statusuri', () => {
  it('fiecare status are meta vizual', async () => {
    const { STATUS_META } = await import('./meta');
    const statuses: TaskStatus[] = ['todo', 'in_progress', 'pending', 'done'];
    for (const s of statuses) expect(STATUS_META[s]).toBeTruthy();
  });
});

describe('sanitizeSearchQuery', () => {
  it('scoate caracterele care au înțeles în sintaxa de filtru PostgREST', () => {
    // Fără curățare, asta ar produce o eroare 400, nu „niciun rezultat".
    expect(sanitizeSearchQuery('raport (Q3), final')).toBe('raport Q3 final');
  });

  it('refuză interogările prea scurte', () => {
    expect(sanitizeSearchQuery('a')).toBeNull();
    expect(sanitizeSearchQuery('   ')).toBeNull();
    expect(sanitizeSearchQuery('(')).toBeNull();
    expect(sanitizeSearchQuery('ab')).toBe('ab');
  });

  it('normalizează spațiile rămase după curățare', () => {
    expect(sanitizeSearchQuery('  plan   anual  ')).toBe('plan anual');
  });

  it('păstrează diacriticele — căutarea nu trebuie să piardă cuvinte românești', () => {
    expect(sanitizeSearchQuery('ședință')).toBe('ședință');
  });
});

describe('subtaskCounts', () => {
  const t = (id: string, parent: string | null, status: TaskStatus) =>
    ({ id, parent_task_id: parent, status }) as unknown as BoardTask;

  it('numără subtaskurile pe părinte, cu câte sunt gata', () => {
    const counts = subtaskCounts([
      t('p1', null, 'todo'),
      t('a', 'p1', 'done'),
      t('b', 'p1', 'in_progress'),
      t('c', 'p1', 'done'),
      t('p2', null, 'todo'),
      t('d', 'p2', 'todo'),
    ]);
    expect(counts.p1).toEqual({ done: 2, total: 3 });
    expect(counts.p2).toEqual({ done: 0, total: 1 });
  });

  it('un task fără subtaskuri NU primește cheie — indicatorul nu trebuie afișat', () => {
    const counts = subtaskCounts([t('p1', null, 'todo')]);
    expect(counts.p1).toBeUndefined();
    expect(Object.keys(counts)).toHaveLength(0);
  });

  it('numără și subtaskurile ai căror părinți nu sunt în set (listă filtrată)', () => {
    // Pe „Toate task-urile" contorul se calculează peste setul NEFILTRAT;
    // dacă cineva îl calculează peste unul filtrat, cheia tot există.
    expect(subtaskCounts([t('a', 'absent', 'done')]).absent).toEqual({ done: 1, total: 1 });
  });
});
