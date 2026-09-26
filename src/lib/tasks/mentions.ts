// @mențiuni în comentariile de task — parsare, randare și detecția a ce se tastează.
//
// DE CE UN TOKEN, NU NUMELE. Comentariul stochează `@[<uuid>]`, nu „@Ana Pop".
// Numele e o etichetă care se schimbă (căsătorie, corectarea unui typo din
// import, altă convenție de scriere), iar un comentariu e un act datat: dacă am
// fi scris numele, firul ar fi rămas plin de nume vechi care nu mai trimit la
// nimeni. Identificatorul stabil în date, traducerea la randare — aceeași regulă
// ca la log-ul de activitate (CLAUDE.md #15).
//
// Coloana `hr_task_comments.mentions uuid[]` e sursa STRUCTURATĂ (o citește
// triggerul care trimite notificarea și gardul care validează compania); textul
// e doar reprezentarea ei. Cele două se derivă una din alta cu `extractMentions`,
// ca să nu poată diverge.
//
// REFOLOSIT ȘI DE WIKI. `kb_comments` (comentarii de pagină și inline) folosește exact
// aceste funcții, prin `components/wiki/CommentsPanel` și `InlineCommentComposer`.
// Wiki-ul avusese scurt timp o a doua implementare, care scria NUMELE în text — deci o
// redenumire lăsa nume vechi în firele existente. A fost înlocuită cât `kb_comments` era încă
// goală; mai târziu ar fi cerut o migrație peste textul comentariilor deja scrise.
// Dacă muți fișierul, mută-l într-un loc neutru (`src/lib/mentions.ts`), nu-l duplica.

/**
 * Tokenul unei mențiuni. UUID-ul e prins lax (hex + cratime) intenționat:
 * validarea „e chiar un coleg activ din compania mea" o face DB-ul, în
 * `hr_task_comment_guard`. Aici ne interesează doar unde începe și unde se
 * termină bucata care nu e text obișnuit.
 */
const MENTION_TOKEN = /@\[([0-9a-fA-F-]{36})\]/g;

/** Ce se tastează acum: `@` urmat de litere/spații, imediat înaintea cursorului. */
const MENTION_TYPING = /(^|\s)@([\p{L}\p{M}' -]{0,40})$/u;

export interface MentionPart {
  type: 'text' | 'mention';
  /** Pentru `text`: bucata de text. Pentru `mention`: numele rezolvat. */
  value: string;
  /** Doar pentru `mention`. */
  userId?: string;
}

/**
 * Id-urile menționate în text, în ordinea apariției, fără duplicate.
 *
 * Sursa de adevăr pentru coloana `mentions`: o extragem din text la trimitere,
 * ca cineva care șterge „@Ana" din comentariu înainte să dea Enter să nu-i mai
 * trimită Anei o notificare despre un text în care nu mai apare.
 */
export function extractMentions(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(MENTION_TOKEN)) {
    const id = match[1].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Textul spart în bucăți gata de randat.
 *
 * `names` e un dicționar id → nume curent. Un id necunoscut (coleg plecat din
 * companie, profil șters) NU se randează ca token brut — ar arăta ca un bug —
 * ci cu `fallback`. Rămâne vizibil că a fost o mențiune, fără să pretindem că
 * știm cine.
 */
export function renderCommentParts(
  content: string,
  names: Record<string, string>,
  fallback = 'utilizator',
): MentionPart[] {
  const parts: MentionPart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(MENTION_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ type: 'text', value: content.slice(cursor, start) });
    const id = match[1].toLowerCase();
    parts.push({ type: 'mention', value: names[id] ?? fallback, userId: id });
    cursor = start + match[0].length;
  }

  if (cursor < content.length) parts.push({ type: 'text', value: content.slice(cursor) });
  return parts;
}

/**
 * Varianta plată, pentru locurile unde nu se poate randa un element colorat:
 * extrasul din notificare, `title` nativ, sau numărătoarea de caractere.
 */
export function renderCommentText(
  content: string,
  names: Record<string, string>,
  fallback = 'utilizator',
): string {
  return renderCommentParts(content, names, fallback)
    .map((p) => (p.type === 'mention' ? `@${p.value}` : p.value))
    .join('');
}

export interface MentionQuery {
  /** Ce s-a tastat după `@` (poate fi șir gol, imediat după tastarea lui `@`). */
  query: string;
  /** Indexul lui `@` în text — de aici se va înlocui la alegerea colegului. */
  start: number;
}

/**
 * Detectează dacă utilizatorul e în mijlocul scrierii unei mențiuni.
 *
 * Se uită DOAR la textul dinaintea cursorului: altfel, editarea unui cuvânt de
 * la începutul unui comentariu care conține un „@" mai încolo ar redeschide
 * lista de colegi în mijlocul frazei.
 *
 * `@` trebuie să fie la început de text sau după un spațiu — ca o adresă de
 * email tastată în comentariu („scrie-i la ana@firma.md") să nu declanșeze
 * selectorul.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, Math.max(0, caret));
  const match = before.match(MENTION_TYPING);
  if (!match) return null;
  return {
    query: match[2],
    // `match.index` arată spre spațiul dinaintea lui `@` (grupul 1), nu spre `@`.
    start: (match.index ?? 0) + match[1].length,
  };
}

export interface MentionInsertion {
  text: string;
  /** Unde trebuie repus cursorul după inserare. */
  caret: number;
}

/**
 * Înlocuiește `@ceva-tastat` cu tokenul colegului ales și adaugă un spațiu, ca
 * scrisul să continue firesc. Fără spațiu, următoarea literă s-ar lipi de token
 * și `findMentionQuery` ar crede că mențiunea e încă în curs.
 */
export function insertMention(
  text: string,
  query: MentionQuery,
  userId: string,
): MentionInsertion {
  const token = `@[${userId}] `;
  const head = text.slice(0, query.start);
  const tail = text.slice(query.start + 1 + query.query.length);
  return { text: head + token + tail, caret: head.length + token.length };
}

/**
 * Filtrul listei de colegi din selector.
 *
 * Subșir, nu fuzzy: filtrul implicit al `cmdk` dă scor > 0 pentru litere culese
 * din cuvinte diferite, deci „an" ar scoate jumătate din companie (CLAUDE.md,
 * secțiunea React). Normalizat fără diacritice, ca „Ștefan" să fie găsit
 * scriind „stefan".
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function filterMentionCandidates<T extends { user_id: string; full_name: string | null }>(
  people: T[],
  query: string,
  limit = 8,
): T[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return people.slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);
  return people
    .filter((p) => {
      const hay = normalizeForSearch(p.full_name ?? '');
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}
