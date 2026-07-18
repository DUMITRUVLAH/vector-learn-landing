import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Never let a Vitest worker open the developer's on-disk `.pglite` database. Several server
// modules create the DB client at import time, and parallel workers otherwise compete with the
// running API for the same files. An isolated in-memory database keeps tests deterministic and
// prevents WAL/data-directory corruption during local test runs.
process.env.DATABASE_PATH = process.env.TEST_DATABASE_PATH ?? "memory://";

afterEach(() => {
  cleanup();
});
