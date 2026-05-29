import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema/index";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), ".pglite");

export const pglite = new PGlite(dbPath);

export const db = drizzle({ client: pglite, schema });

export type DB = typeof db;
