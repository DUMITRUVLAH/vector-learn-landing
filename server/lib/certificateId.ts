/**
 * DIPLOMA-801 — Certificate ID builder
 *
 * Re-exports the shared pure function from src/lib/certificateId.ts.
 * Server routes import from here; client components and tests use @/lib/certificateId.
 */
export {
  buildCertificateId,
  buildCoursePrefix,
} from "../../src/lib/certificateId";
