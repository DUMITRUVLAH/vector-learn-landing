import { describe, expect, it } from 'vitest';
import {
  POSITION_STEP,
  needsRenumberAtStart,
  positionAtEnd,
  positionAtStart,
  positionBetween,
  positionForDrop,
  positionForNewTask,
} from '../positions';

describe('positionAtStart — adăugarea în capul coloanei', () => {
  it('lista goală primește pasul standard, nu zero', () => {
    // `0` înseamnă „calculează tu" pentru triggerul din DB, care pune
    // `MAX + 1024` — adică exact la coadă, ce reparăm aici.
    expect(positionAtStart([])).toBe(1024);
  });

  it('intră ÎNAINTEA celui mai de sus card', () => {
    const p = positionAtStart([1024, 2048, 3072]);
    expect(p).toBeLessThan(1024);
    expect(p).toBeGreaterThan(0);
  });

  it('nu depinde de ordinea în care primește pozițiile', () => {
    expect(positionAtStart([3072, 1024, 2048])).toBe(positionAtStart([1024, 2048, 3072]));
  });

  it('adăugări repetate păstrează ordinea inversă a inserării', () => {
    let pozitii = [1024, 2048];
    const noi: number[] = [];
    for (let i = 0; i < 5; i++) {
      const p = positionAtStart(pozitii);
      noi.push(p);
      pozitii = [p, ...pozitii];
    }
    // fiecare nou-venit stă deasupra precedentului
    expect(noi).toEqual([...noi].sort((a, b) => b - a));
    expect(pozitii).toEqual([...pozitii].sort((a, b) => a - b));
  });

  it('semnalează epuizarea mantisei în loc să producă poziții egale', () => {
    expect(needsRenumberAtStart([])).toBe(false);
    expect(needsRenumberAtStart([1024])).toBe(false);
    expect(needsRenumberAtStart([Number.MIN_VALUE])).toBe(true);
    expect(needsRenumberAtStart([0])).toBe(true);
  });

  it('câte inserții curate încap — măsurat, nu presupus (CLAUDE.md #45)', () => {
    let pozitii = [1024];
    let n = 0;
    while (!needsRenumberAtStart(pozitii) && n < 5000) {
      pozitii = [positionAtStart(pozitii)];
      n++;
    }
    // Fără număr magic: verificăm doar că marja e cu mult peste uzul real.
    expect(n).toBeGreaterThan(1000);
  });
});

describe('celelalte poziții rămân simetrice', () => {
  it('positionAtEnd pune după cel mai de jos', () => {
    expect(positionAtEnd([1024, 2048])).toBe(2048 + 1024);
    expect(positionAtEnd([])).toBe(1024);
  });

  it('positionBetween ține mijlocul, iar capetele lipsă se comportă predictibil', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(512);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(null, null)).toBe(1024);
  });

  it('positionForDrop pe primul loc coincide cu adăugarea în cap', () => {
    const pozitii = [1024, 2048, 3072];
    expect(positionForDrop(pozitii, 0)).toBe(positionAtStart(pozitii));
  });
});

describe('positionForNewTask — taskul nou intră SUS', () => {
  it('coloană goală ⇒ prima poziție', () => {
    expect(positionForNewTask([])).toBe(POSITION_STEP);
  });

  it('se așază ÎNAINTEA celui mai de sus card', () => {
    const surori = [1024, 2048, 3072];
    const nou = positionForNewTask(surori);
    expect(nou).toBeLessThan(Math.min(...surori));
    expect(nou).toBeGreaterThan(0);
  });

  it('rămâne primul și după adăugări repetate în același loc', () => {
    let surori = [1024, 2048];
    for (let i = 0; i < 30; i++) {
      const nou = positionForNewTask(surori);
      expect(nou).toBeGreaterThan(0);            // n-am căzut pe „calculează tu"
      expect(nou).toBeLessThan(Math.min(...surori));
      surori = [nou, ...surori];
    }
  });

  it('când capul listei și-a epuizat precizia, cedează poziția DB-ului', () => {
    // Un interval imposibil de înjumătățit: cel mai mic număr subnormal.
    expect(positionForNewTask([Number.MIN_VALUE])).toBe(0);
  });
});
