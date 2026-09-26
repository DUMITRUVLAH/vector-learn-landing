// Traducerea erorilor venite de la server în mesaje pe care le înțelege omul.
//
// Serverul (`/api/tasks`) refuză fluxurile normale cu un COD stabil în corpul
// răspunsului (`{ error: "needs_approval" }`) — acela e primul lucru pe care îl
// citim. Tiparele de text rămân pentru mesajele libere (ex. validări), ca în
// sursa din HR365, unde regulile trăiau în excepții SQL.

type TFunc = (key: string) => string;

interface DbError {
  code?: string;
  status?: number;
  /** Corpul răspunsului (`ApiError.body`): serverul pune în `detail` explicația concretă. */
  body?: { detail?: unknown };
  message?: string;
  details?: string;
  hint?: string;
}

/** Codurile de eroare ale `/api/tasks` → cheia de traducere. */
const CODES: Record<string, string> = {
  forbidden: 'board.errors.forbidden',
  not_found: 'board.errors.forbidden',
  needs_approval: 'board.errors.needsApproval',
  blocked_by_dependency: 'board.errors.blockedByDependency',
  title_length: 'board.errors.titleLength',
  description_length: 'board.errors.descriptionLength',
  board_mismatch: 'board.errors.boardMismatch',
  list_mismatch: 'board.errors.listMismatch',
  parent_invalid: 'board.errors.parentInvalid',
  cycle: 'board.errors.cycle',
  server_managed: 'board.errors.serverManaged',
  reopen_first: 'board.errors.reopenFirst',
  board_create_forbidden: 'board.errors.boardCreateForbidden',
  unauthenticated: 'board.errors.notAuthenticated',
  invalid_session: 'board.errors.notAuthenticated',
  approver_invalid: 'board.errors.approverInvalid',
  too_many: 'board.errors.tooMany',
  bad_sort_key: 'board.errors.badSortKey',
  invalid_data: 'board.errors.invalidData',
  validation_error: 'board.errors.invalidData',
  module_disabled: 'board.errors.forbidden',
  occurrence_exists: 'board.errors.occurrenceExists',
};

/** Fragmente stabile din mesajele DB → cheia de traducere. */
const PATTERNS: Array<{ match: RegExp; key: string }> = [
  { match: /are nevoie de aprobarea/i, key: 'board.errors.needsApproval' },
  { match: /dependen[țt]|blocator|nu poți finaliza/i, key: 'board.errors.blockedByDependency' },
  { match: /titlul task-ului/i, key: 'board.errors.titleLength' },
  { match: /descrierea task-ului/i, key: 'board.errors.descriptionLength' },
  { match: /boardul nu apar[țt]ine/i, key: 'board.errors.boardMismatch' },
  { match: /coloana nu apar[țt]ine/i, key: 'board.errors.listMismatch' },
  { match: /p[ăa]rintele trebuie/i, key: 'board.errors.parentInvalid' },
  { match: /ierarhie circular/i, key: 'board.errors.cycle' },
  { match: /datele finaliz[ăa]rii/i, key: 'board.errors.serverManaged' },
  { match: /redeschide task-ul/i, key: 'board.errors.reopenFirst' },
  { match: /only hr or managers/i, key: 'board.errors.boardCreateForbidden' },
  { match: /not authenticated|sesiune invalid/i, key: 'board.errors.notAuthenticated' },
  { match: /active profile required/i, key: 'board.errors.noActiveProfile' },
  { match: /aprobatorul trebuie/i, key: 'board.errors.approverInvalid' },
  { match: /prea mul[țt]i/i, key: 'board.errors.tooMany' },
  { match: /criteriu de sortare/i, key: 'board.errors.badSortKey' },
  { match: /acelea[șs]i coloane|acela[șs]i board/i, key: 'board.errors.listMismatch' },
];

/**
 * Mesajul de arătat pentru o eroare de scriere din modul.
 *
 * `42501` = refuz de permisiune (RLS sau gard explicit din trigger/RPC), `23514`
 * = încălcare de integritate. Amândouă sunt „așteptate" în fluxurile normale,
 * deci merită un text uman, nu textul brut al excepției.
 */
export function taskErrorMessage(error: unknown, t: TFunc, fallbackKey = 'board.toast.saveFailed'): string {
  const err = (error ?? {}) as DbError;
  const detail = typeof err.body?.detail === 'string' ? err.body.detail.trim() : '';
  // Datele invalide au o explicație concretă de la server („Data de început nu poate fi după
  // termen") — mai utilă decât „date invalide", cât timp e o propoziție scurtă.
  if (err.code === 'invalid_data' && detail && detail.length <= 160) return detail;
  if (err.code && CODES[err.code]) return t(CODES[err.code]);
  // Codurile tehnice (rețea, 5xx, timeout) nu spun nimic omului: mesajul generic al acțiunii.
  if (err.code && /^(http_\d+|server_error|server_timeout|request_timeout|storage_unavailable)$/.test(err.code)) {
    return t(fallbackKey);
  }
  const raw = `${typeof err.message === 'string' ? err.message : ''} ${typeof err.details === 'string' ? err.details : ''}`
    .replace(/\[object Object\]/g, '')
    .trim();

  for (const { match, key } of PATTERNS) {
    if (match.test(raw)) return t(key);
  }

  if (err.code === '42501' || err.status === 403) return t('board.errors.forbidden');
  if (err.code === '23514') return t('board.errors.invalidData');

  // Fără potrivire: mesajul brut e tot mai util decât un „ceva n-a mers", dar
  // doar dacă e scurt și pare o propoziție, nu un stack de Postgres.
  if (raw && raw.length <= 160 && !/^[A-Z_]+:/.test(raw)) return raw;
  return t(fallbackKey);
}
