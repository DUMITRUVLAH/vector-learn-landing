/**
 * @vitest-environment node
 * `sync-schema` recreează pe prod indecșii declarați în schema Drizzle. Un index PARȚIAL nu are voie
 * să fie recreat de acolo: instrucțiunea n-ar avea `WHERE`, deci ar deveni un index COMPLET — pentru
 * unul unic, altă regulă de business (ex. `crm_kpi_targets_default_uniq` ar fi interzis țintele pe
 * persoană). Testul rulează pe schema reală, ca un index parțial nou să fie prins automat.
 * Vezi docs/solutions/database-issues/partial-index-rebuilt-without-where.md.
 */
import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { ensureIndexStatement, type IndexConfigLike } from "../db/ensureIndexStatement";

function indexConfigs(): Array<{ table: string; cfg: IndexConfigLike }> {
  const out: Array<{ table: string; cfg: IndexConfigLike }> = [];
  for (const value of Object.values(schema)) {
    const table = value as Record<symbol, unknown>;
    if (!value || typeof value !== "object" || table[Symbol.for("drizzle:IsDrizzleTable")] !== true) continue;
    const extra = table[Symbol.for("drizzle:ExtraConfigBuilder")] as ((self: unknown) => Record<string, unknown>) | undefined;
    if (typeof extra !== "function") continue;
    let config: Record<string, unknown>;
    try {
      config = extra(table[Symbol.for("drizzle:ExtraConfigColumns")] ?? table);
    } catch {
      continue;
    }
    for (const builder of Object.values(config ?? {})) {
      const cfg = (builder as { config?: IndexConfigLike })?.config;
      if (cfg?.name) out.push({ table: getTableName(value as never), cfg });
    }
  }
  return out;
}

describe("ensureIndexStatement", () => {
  it("nu recreează NICIUN index parțial din schemă (i-ar pierde clauza WHERE)", () => {
    const partial = indexConfigs().filter(({ cfg }) => !!cfg.where);
    expect(partial.map((p) => p.cfg.name)).toContain("crm_kpi_targets_default_uniq");
    for (const { table, cfg } of partial) expect(ensureIndexStatement(table, cfg), cfg.name).toBeNull();
  });

  it("recreează corect un index obișnuit și unul unic", () => {
    const all = indexConfigs();
    const plain = all.find((i) => i.cfg.name === "board_tasks_board_list_pos_idx");
    const unique = all.find((i) => i.cfg.name === "task_board_members_board_user_uniq");
    expect(ensureIndexStatement(plain!.table, plain!.cfg)).toBe(
      'CREATE INDEX IF NOT EXISTS "board_tasks_board_list_pos_idx" ON "board_tasks" ("board_id", "list_id", "position")',
    );
    expect(ensureIndexStatement(unique!.table, unique!.cfg)).toBe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "task_board_members_board_user_uniq" ON "task_board_members" ("board_id", "user_id")',
    );
  });

  it("sare peste configurațiile incomplete", () => {
    expect(ensureIndexStatement("t", undefined)).toBeNull();
    expect(ensureIndexStatement("t", { name: "x", columns: [] })).toBeNull();
  });
});
