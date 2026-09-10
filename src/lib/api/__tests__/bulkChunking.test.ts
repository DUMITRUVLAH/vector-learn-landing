/**
 * „Aprobă toate" / „Respinge toate" pe un inbox mai mare decât un lot.
 *
 * Serverul acceptă cel mult 25 de cereri într-un apel (zod `max(25)`), dar „Selectează tot" bifează
 * toate rândurile din inbox. Un aprobator cu 30 de cereri apăsa butonul și NU se întâmpla nimic:
 * lotul întreg pica pe validare, cu un 400 pe care interfața îl arăta ca eroare generică. Loturile
 * mari se taie acum în bucăți.
 */
import { describe, it, expect } from "vitest";
import { chunkIds, BULK_DECISION_CHUNK } from "../par";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `par-${String(i).padStart(3, "0")}`);

describe("chunkIds()", () => {
  it("un inbox mic rămâne un singur lot", () => {
    expect(chunkIds(ids(10))).toHaveLength(1);
  });

  it("exact cât intră într-un lot nu se taie", () => {
    expect(chunkIds(ids(BULK_DECISION_CHUNK))).toHaveLength(1);
  });

  it("peste limită se taie, fără să piardă nicio cerere", () => {
    const all = ids(63);
    const batches = chunkIds(all);
    expect(batches).toHaveLength(3);
    expect(batches.flat()).toEqual(all);
    expect(batches.every((b) => b.length <= BULK_DECISION_CHUNK)).toBe(true);
  });

  it("elimină duplicatele, ca o cerere să nu fie decisă de două ori", () => {
    const batches = chunkIds(["a", "b", "a", "c", "b"]);
    expect(batches.flat()).toEqual(["a", "b", "c"]);
  });

  it("o listă goală nu produce niciun apel", () => {
    expect(chunkIds([])).toEqual([]);
  });
});
