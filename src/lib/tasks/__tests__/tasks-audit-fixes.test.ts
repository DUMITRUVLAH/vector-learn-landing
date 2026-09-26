// Testele remedierilor din auditul modulului (2026-08-22).
//
// Fiecare bloc de aici corespunde unei probleme reale găsite în audit, nu unei
// funcții „pentru acoperire". Dacă un test de aici pică, bug-ul s-a întors.

import { describe, expect, it } from 'vitest';
import { listIdForStatus, moveStatusPatch, DEFAULT_LIST_KEYS, DEFAULT_LISTS } from '../board-status';
import { EMPTY_FILTERS, filterTasks, searchKey, type TaskFilterState } from '../filters';
import { taskErrorMessage } from '../errors';
import type { BoardTask } from '../types';

const now = () => '2026-08-22T10:00:00.000Z';

function task(over: Partial<BoardTask> = {}): BoardTask {
  return {
    id: 't1', company_id: 'c1', board_id: 'b1', list_id: 'l1', parent_task_id: null,
    title: 'Task', description: null, status: 'todo', priority: 'medium', position: 1024,
    assigned_to: null, assignees: [], assigned_by: null, created_by: 'u1',
    start_date: null, due_date: null, estimated_minutes: null, actual_minutes: null,
    source_module: 'manual', source_id: null, is_private: false, is_recurring: false,
    recurrence_rule: null, depends_on: null, tags: [], task_set: null, sort_order: 0,
    completed_at: null, deleted_at: null,
    created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    ...over,
  } as BoardTask;
}

const baseFilters: TaskFilterState = { ...EMPTY_FILTERS, includeDone: true };

// ─────────────────────────────────────────────────────────────────────
// Căutarea nu era insensibilă la diacritice, într-un produs în română:
// „plata" nu găsea „plată", iar utilizatorii tastează fără diacritice.
// ─────────────────────────────────────────────────────────────────────
describe('căutare fără diacritice', () => {
  it('normalizează diacriticele românești', () => {
    expect(searchKey('Integrare plată online')).toBe('integrare plata online');
    expect(searchKey('ÎNCĂRCĂTURĂ ȘI ȚEAVĂ')).toBe('incarcatura si teava');
  });

  it('„plata" găsește „plată"', () => {
    const rows = [task({ id: 'a', title: 'Integrare plată online' }), task({ id: 'b', title: 'Altceva' })];
    const found = filterTasks(rows, { ...baseFilters, search: 'plata' }, '2026-08-22');
    expect(found.map((r) => r.id)).toEqual(['a']);
  });

  it('merge și invers: „plată" găsește un titlu scris fără diacritice', () => {
    const rows = [task({ id: 'a', title: 'Integrare plata online' })];
    const found = filterTasks(rows, { ...baseFilters, search: 'plată' }, '2026-08-22');
    expect(found.map((r) => r.id)).toEqual(['a']);
  });

  it('rămâne insensibilă la majuscule', () => {
    const rows = [task({ id: 'a', title: 'De revenit la mikrokapital' })];
    expect(filterTasks(rows, { ...baseFilters, search: 'MIKROKAPITAL' }, '2026-08-22')).toHaveLength(1);
  });

  it('nu potrivește ce nu există', () => {
    const rows = [task({ id: 'a', title: 'Integrare plată online' })];
    expect(filterTasks(rows, { ...baseFilters, search: 'zzzz' }, '2026-08-22')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Statusul coloanei se ghicea din NUMELE ei, cu liste fixe RO/EN. O companie
// care lucra în rusă redenumea coloanele și mutarea între ele nu mai schimba
// statusul — tăcut. Sursa de adevăr e acum `maps_to_status`, din DB.
// ─────────────────────────────────────────────────────────────────────
describe('maparea coloană → status', () => {
  it('folosește maps_to_status pentru un nume necunoscut', () => {
    expect(
      moveStatusPatch('todo', { is_done_list: false, name: 'В работе', maps_to_status: 'in_progress' }, now),
    ).toEqual({ status: 'in_progress', completed_at: null });
  });

  it('fără maps_to_status cade pe ghicitul din nume (compatibilitate)', () => {
    expect(moveStatusPatch('todo', { is_done_list: false, name: 'În lucru' }, now)).toEqual({
      status: 'in_progress', completed_at: null,
    });
  });

  it('maps_to_status bate numele când cele două se contrazic', () => {
    expect(
      moveStatusPatch('todo', { is_done_list: false, name: 'În lucru', maps_to_status: 'pending' }, now),
    ).toEqual({ status: 'pending', completed_at: null });
  });

  it('is_done_list rămâne autoritar peste maps_to_status', () => {
    expect(
      moveStatusPatch('todo', { is_done_list: true, name: 'Готово', maps_to_status: 'todo' }, now),
    ).toEqual({ status: 'done', completed_at: now() });
  });

  it('coloana rusească primește cardul la schimbarea statusului din listă', () => {
    const lists = [
      { id: 'l1', name: 'К выполнению', is_done_list: false, maps_to_status: 'todo' as const },
      { id: 'l2', name: 'В работе', is_done_list: false, maps_to_status: 'in_progress' as const },
      { id: 'l3', name: 'Готово', is_done_list: true, maps_to_status: 'done' as const },
    ];
    expect(listIdForStatus('in_progress', 'todo', 'l1', lists)).toBe('l2');
    expect(listIdForStatus('done', 'todo', 'l1', lists)).toBe('l3');
  });

  it('coloanele implicite au status declarat, nu dedus din nume', () => {
    expect(DEFAULT_LISTS.map((l) => l.maps_to_status)).toEqual(['todo', 'in_progress', 'pending', 'done']);
    expect(DEFAULT_LIST_KEYS.map((l) => l.maps_to_status)).toEqual(['todo', 'in_progress', 'pending', 'done']);
    // Cheile de traducere și lista hardcodată trebuie să rămână în pas.
    expect(DEFAULT_LIST_KEYS).toHaveLength(DEFAULT_LISTS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 17 locuri afișau mesajul BRUT al excepției Postgres, în amestec
// româno-englez, indiferent de limba interfeței.
// ─────────────────────────────────────────────────────────────────────
describe('traducerea erorilor din DB', () => {
  const t = (key: string) => key;

  it('recunoaște gardul de aprobare', () => {
    expect(taskErrorMessage({ code: '42501', message: 'Task-ul are nevoie de aprobarea unei persoane autorizate' }, t))
      .toBe('board.errors.needsApproval');
  });

  it('recunoaște blocajul de dependență', () => {
    expect(taskErrorMessage({ message: 'Nu poți finaliza task-ul: are blocatori nefinalizați' }, t))
      .toBe('board.errors.blockedByDependency');
  });

  it('recunoaște mesajele englezești ale RPC-urilor', () => {
    expect(taskErrorMessage({ code: '42501', message: 'Only HR or managers can create boards' }, t))
      .toBe('board.errors.boardCreateForbidden');
    expect(taskErrorMessage({ message: 'Not authenticated' }, t)).toBe('board.errors.notAuthenticated');
  });

  it('cade pe cod când mesajul nu e recunoscut', () => {
    expect(taskErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "hr_tasks"' }, t))
      .toBe('board.errors.forbidden');
    expect(taskErrorMessage({ code: '23514', message: 'ceva neprevăzut din trigger' }, t))
      .toBe('board.errors.invalidData');
  });

  it('nu inventează mesaje pentru erori goale', () => {
    expect(taskErrorMessage({}, t)).toBe('board.toast.saveFailed');
    expect(taskErrorMessage(null, t)).toBe('board.toast.saveFailed');
  });

  it('lasă mesajele scurte și lizibile să treacă neatinse', () => {
    expect(taskErrorMessage({ message: 'Coloana are deja acest nume.' }, t)).toBe('Coloana are deja acest nume.');
  });
});
