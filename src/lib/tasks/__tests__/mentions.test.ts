import { describe, expect, it } from 'vitest';
import {
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  insertMention,
  renderCommentParts,
  renderCommentText,
} from '../mentions';

const ANA = '11111111-1111-1111-1111-111111111111';
const BOGDAN = '22222222-2222-2222-2222-222222222222';
const NAMES = { [ANA]: 'Ana Pop', [BOGDAN]: 'Bogdan Rusu' };

describe('extractMentions', () => {
  it('scoate id-urile în ordinea apariției, fără duplicate', () => {
    const text = `salut @[${BOGDAN}] și @[${ANA}], apoi iar @[${BOGDAN}]`;
    expect(extractMentions(text)).toEqual([BOGDAN, ANA]);
  });

  it('nu găsește nimic într-un text fără tokenuri', () => {
    expect(extractMentions('scrie-i la ana@firma.md, te rog')).toEqual([]);
  });

  it('e sursa coloanei `mentions`: ștergerea tokenului din text scoate omul din listă', () => {
    // Cazul real: scriu „@Ana", mă răzgândesc, șterg — nu trebuie să primească
    // notificare pentru un text în care nu mai apare.
    const scris = `@[${ANA}] verifici tu?`;
    const sters = 'verifici tu?';
    expect(extractMentions(scris)).toEqual([ANA]);
    expect(extractMentions(sters)).toEqual([]);
  });
});

describe('renderCommentParts', () => {
  it('sparge textul în bucăți și rezolvă numele curent', () => {
    expect(renderCommentParts(`ok @[${ANA}] mersi`, NAMES)).toEqual([
      { type: 'text', value: 'ok ' },
      { type: 'mention', value: 'Ana Pop', userId: ANA },
      { type: 'text', value: ' mersi' },
    ]);
  });

  it('un id necunoscut NU se randează ca token brut', () => {
    // Un coleg plecat din companie nu trebuie să lase „@[uuid]" pe ecran —
    // ar arăta ca un bug de randare.
    const parts = renderCommentParts(`@[${ANA}] ping`, {}, 'utilizator');
    expect(parts[0]).toEqual({ type: 'mention', value: 'utilizator', userId: ANA });
    expect(renderCommentText(`@[${ANA}] ping`, {})).toBe('@utilizator ping');
  });

  it('numele redenumit se vede peste tot, fără a rescrie comentariile vechi', () => {
    const text = `@[${ANA}] ai verificat?`;
    expect(renderCommentText(text, { [ANA]: 'Ana Pop' })).toBe('@Ana Pop ai verificat?');
    expect(renderCommentText(text, { [ANA]: 'Ana Ionescu' })).toBe('@Ana Ionescu ai verificat?');
  });

  it('mențiune la început și la sfârșit, fără text în jur', () => {
    expect(renderCommentParts(`@[${ANA}]`, NAMES)).toEqual([
      { type: 'mention', value: 'Ana Pop', userId: ANA },
    ]);
  });
});

describe('findMentionQuery', () => {
  it('prinde `@` proaspăt tastat, cu interogare goală', () => {
    expect(findMentionQuery('salut @', 7)).toEqual({ query: '', start: 6 });
  });

  it('prinde numele parțial tastat', () => {
    expect(findMentionQuery('salut @an', 9)).toEqual({ query: 'an', start: 6 });
  });

  it('acceptă spațiu în interogare (nume din două cuvinte)', () => {
    expect(findMentionQuery('@ana p', 6)).toEqual({ query: 'ana p', start: 0 });
  });

  it('NU declanșează pe o adresă de email', () => {
    // `@` lipit de un cuvânt nu e mențiune — altfel selectorul sare în față
    // de fiecare dată când cineva scrie o adresă în comentariu.
    expect(findMentionQuery('scrie la ana@firma', 18)).toBeNull();
  });

  it('se uită DOAR înaintea cursorului', () => {
    const text = `corectez aici @[${ANA}] restul`;
    // Cursorul la începutul textului: nu suntem în mijlocul unei mențiuni,
    // deși textul conține una mai încolo.
    expect(findMentionQuery(text, 3)).toBeNull();
  });

  it('nu prinde o mențiune deja inserată (tokenul are `[`)', () => {
    const text = `@[${ANA}] `;
    expect(findMentionQuery(text, text.length)).toBeNull();
  });
});

describe('insertMention', () => {
  it('înlocuiește ce s-a tastat cu tokenul și lasă cursorul după spațiu', () => {
    const text = 'salut @an';
    const q = findMentionQuery(text, text.length)!;
    const out = insertMention(text, q, ANA);
    expect(out.text).toBe(`salut @[${ANA}] `);
    expect(out.caret).toBe(out.text.length);
  });

  it('păstrează textul de după cursor', () => {
    const text = 'salut @an, ce faci?';
    const q = findMentionQuery(text, 9)!;
    const out = insertMention(text, q, ANA);
    expect(out.text).toBe(`salut @[${ANA}] , ce faci?`);
  });

  it('spațiul de după token oprește selectorul', () => {
    const text = '@a';
    const q = findMentionQuery(text, 2)!;
    const out = insertMention(text, q, ANA);
    // Dacă n-ar exista spațiul, `findMentionQuery` ar crede că mențiunea
    // continuă și lista ar rămâne deschisă peste tokenul deja ales.
    expect(findMentionQuery(out.text, out.caret)).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  const people = [
    { user_id: ANA, full_name: 'Ana Pop' },
    { user_id: BOGDAN, full_name: 'Bogdan Rusu' },
    { user_id: '3', full_name: 'Ștefan Mocanu' },
    { user_id: '4', full_name: 'Cleaner — Administrative services' },
  ];

  it('găsește pe subșir, nu fuzzy', () => {
    // Cazul din CLAUDE.md: „sales" NU trebuie să scoată
    // „Cleaner — Administrative serviceS" prin litere împrăștiate.
    expect(filterMentionCandidates(people, 'sales')).toEqual([]);
  });

  it('ignoră diacriticele', () => {
    expect(filterMentionCandidates(people, 'stefan').map((p) => p.user_id)).toEqual(['3']);
  });

  it('cere TOATE cuvintele tastate', () => {
    expect(filterMentionCandidates(people, 'ana pop').map((p) => p.user_id)).toEqual([ANA]);
    expect(filterMentionCandidates(people, 'ana rusu')).toEqual([]);
  });

  it('interogare goală = primii din listă, plafonat', () => {
    expect(filterMentionCandidates(people, '', 2)).toHaveLength(2);
  });
});
