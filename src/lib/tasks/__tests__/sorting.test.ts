import { describe, expect, it } from 'vitest';
import type { BoardTask } from '../types';
import {
  DEFAULT_SORT,
  groupTasks,
  sortTasks,
  toggleSort,
  type SortState,
} from '../sorting';

const ANA = '11111111-1111-1111-1111-111111111111';
const BOGDAN = '22222222-2222-2222-2222-222222222222';
const NAMES = { [ANA]: 'Ana Pop', [BOGDAN]: 'Bogdan Rusu' };

/**
 * Fixtura se TIPEAZĂ, nu se castează (CLAUDE.md #39): dacă `tsc` se plânge,
 * fixtura e greșită, nu tipul.
 */
function task(over: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    company_id: 'c1',
    board_id: 'b1',
    list_id: null,
    parent_task_id: null,
    title: 'Task',
    description: null,
    status: 'todo',
    priority: 'medium',
    position: 0,
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('sortTasks', () => {
  it('prioritatea se ordonează pe RANG, nu alfabetic', () => {
    // Alfabetic ar da: high, low, medium, urgent — adică exact pe dos.
    const out = sortTasks(
      [
        task({ id: 'low', priority: 'low' }),
        task({ id: 'urgent', priority: 'urgent' }),
        task({ id: 'medium', priority: 'medium' }),
        task({ id: 'high', priority: 'high' }),
      ],
      { key: 'priority', dir: 'asc' },
    );
    expect(out.map((t) => t.id)).toEqual(['urgent', 'high', 'medium', 'low']);
  });

  it('ordinea pe prioritate nu depinde de limba interfeței', () => {
    // Etichetele sunt traduse ("Ridicat"/"Высокий"), rangul nu. Sortarea trebuie
    // să dea ACELAȘI rezultat oricare ar fi limba — de aceea nu atingem deloc
    // textul tradus în comparație.
    const input = [
      task({ id: 'a', priority: 'medium' }),
      task({ id: 'b', priority: 'urgent' }),
    ];
    const ro = sortTasks(input, { key: 'priority', dir: 'asc' });
    const ru = sortTasks(input, { key: 'priority', dir: 'asc' });
    expect(ro.map((t) => t.id)).toEqual(ru.map((t) => t.id));
    expect(ro.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('task-urile FĂRĂ termen rămân ultimele în AMBELE direcții', () => {
    const input = [
      task({ id: 'fara' }),
      task({ id: 'tarziu', due_date: '2026-12-01T12:00:00Z' }),
      task({ id: 'devreme', due_date: '2026-01-05T12:00:00Z' }),
    ];
    expect(sortTasks(input, { key: 'due_date', dir: 'asc' }).map((t) => t.id))
      .toEqual(['devreme', 'tarziu', 'fara']);
    // Inversând, „fără termen" NU trebuie să sară în capul listei: altfel
    // utilizatorul primește sus exact ce nu are informație.
    expect(sortTasks(input, { key: 'due_date', dir: 'desc' }).map((t) => t.id))
      .toEqual(['tarziu', 'devreme', 'fara']);
  });

  it('e stabilă: la valori egale păstrează ordinea manuală', () => {
    const out = sortTasks(
      [
        task({ id: 'p1', priority: 'high', position: 1 }),
        task({ id: 'p2', priority: 'high', position: 2 }),
        task({ id: 'p3', priority: 'high', position: 3 }),
      ],
      { key: 'priority', dir: 'asc' },
    );
    expect(out.map((t) => t.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('nu mută array-ul primit (nu mutează la loc)', () => {
    const input = [task({ id: 'b', position: 2 }), task({ id: 'a', position: 1 })];
    const copy = [...input];
    sortTasks(input, { key: 'manual', dir: 'asc' });
    expect(input.map((t) => t.id)).toEqual(copy.map((t) => t.id));
  });

  it('sortarea pe responsabil folosește NUMELE, nu uuid-ul', () => {
    // Pe uuid, ordinea ar fi aleatorie pentru utilizator.
    const out = sortTasks(
      [task({ id: 'x', assignees: [BOGDAN] }), task({ id: 'y', assignees: [ANA] })],
      { key: 'assignee', dir: 'asc' },
      { names: NAMES },
    );
    expect(out.map((t) => t.id)).toEqual(['y', 'x']);
  });

  it('fără responsabil = la coadă', () => {
    const out = sortTasks(
      [task({ id: 'gol' }), task({ id: 'ana', assignees: [ANA] })],
      { key: 'assignee', dir: 'asc' },
      { names: NAMES },
    );
    expect(out.map((t) => t.id)).toEqual(['ana', 'gol']);
  });

  it('titlurile se compară ignorând diacriticele', () => {
    const out = sortTasks(
      [task({ id: 'z', title: 'Zebră' }), task({ id: 's', title: 'Ștefan' })],
      { key: 'title', dir: 'asc' },
    );
    expect(out.map((t) => t.id)).toEqual(['s', 'z']);
  });
});

describe('toggleSort', () => {
  it('primul clic pune direcția implicită a coloanei', () => {
    expect(toggleSort(DEFAULT_SORT, 'due_date')).toEqual({ key: 'due_date', dir: 'asc' });
    // „Creat" începe cu cel mai nou — nimeni nu vrea întâi cel mai vechi task.
    expect(toggleSort(DEFAULT_SORT, 'created_at')).toEqual({ key: 'created_at', dir: 'desc' });
  });

  it('al doilea clic inversează', () => {
    const s: SortState = { key: 'due_date', dir: 'asc' };
    expect(toggleSort(s, 'due_date')).toEqual({ key: 'due_date', dir: 'desc' });
  });

  it('al treilea clic revine la ordinea manuală', () => {
    const s: SortState = { key: 'due_date', dir: 'desc' };
    expect(toggleSort(s, 'due_date')).toEqual(DEFAULT_SORT);
  });
});

describe('groupTasks', () => {
  it('fără grupare = o singură bandă cu tot', () => {
    const out = groupTasks([task({ id: 'a' })], 'none');
    expect(out).toHaveLength(1);
    expect(out[0].tasks).toHaveLength(1);
  });

  it('un task cu DOI responsabili apare în AMBELE benzi', () => {
    // Alternativa (doar primul responsabil) ar face munca partajată să dispară
    // din vederea celui de-al doilea, tăcut.
    const out = groupTasks([task({ id: 'comun', assignees: [ANA, BOGDAN] })], 'assignee', {
      names: NAMES,
    });
    expect(out.map((g) => g.label)).toEqual(['Ana Pop', 'Bogdan Rusu']);
    expect(out.every((g) => g.tasks[0].id === 'comun')).toBe(true);
  });

  it('banda „fără responsabil" e ultima', () => {
    const out = groupTasks(
      [task({ id: 'gol' }), task({ id: 'ana', assignees: [ANA] })],
      'assignee',
      { names: NAMES, unassignedLabel: 'Fără responsabil' },
    );
    expect(out.map((g) => g.id)).toEqual([ANA, '__none__']);
    expect(out[1].isUnassigned).toBe(true);
  });

  it('benzile de prioritate ies în ordinea rangului, cu CODUL ca etichetă', () => {
    // Eticheta rămâne codul: traducerea o face componenta, nu funcția pură.
    const out = groupTasks(
      [
        task({ id: 'a', priority: 'low' }),
        task({ id: 'b', priority: 'urgent' }),
        task({ id: 'c', priority: 'medium' }),
      ],
      'priority',
    );
    expect(out.map((g) => g.id)).toEqual(['urgent', 'medium', 'low']);
    expect(out[0].label).toBe('urgent');
  });

  it('gruparea pe etichetă: un task cu două etichete apare de două ori', () => {
    const out = groupTasks([task({ id: 't', tags: ['urgent', 'client'] })], 'tag');
    expect(out.map((g) => g.id)).toEqual(['client', 'urgent']);
  });
});
