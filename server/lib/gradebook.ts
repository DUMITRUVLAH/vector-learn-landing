/**
 * SCHOOL-002 — Funcții pure pentru gradebook
 * Nu au dependențe de DB — sunt testabile unitar direct.
 */

export interface GradeInput {
  value: number | null;
  weight: number;
}

export interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  average: number | null;
  count: number;
  min: number | null;
  max: number | null;
}

export interface ReportCardEntry {
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  average: number | null;
  grades: {
    title: string | null;
    value: number;
    weight: number;
    type: string;
    gradedAt: string;
  }[];
}

export interface ReportCardData {
  studentId: string;
  studentName: string;
  className: string;
  termName: string;
  subjects: ReportCardEntry[];
  overallAverage: number | null;
}

/**
 * Medie ponderată a notelor. Notele null (absent/nenotat) sunt ignorate.
 * Dacă toate sunt null → returnează null.
 */
export function weightedAverage(entries: GradeInput[]): number | null {
  const valid = entries.filter((e) => e.value !== null) as {
    value: number;
    weight: number;
  }[];
  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return null;

  const weightedSum = valid.reduce((s, e) => s + e.value * e.weight, 0);
  const avg = weightedSum / totalWeight;
  // 2 zecimale
  return Math.round(avg * 100) / 100;
}

/**
 * Sumar per materie pentru un termen și un elev.
 */
export function termSummary(
  entries: {
    subjectId: string;
    subjectName: string;
    value: number | null;
    weight: number;
  }[]
): SubjectSummary[] {
  // Grupăm pe subjectId
  const bySubject = new Map<
    string,
    { name: string; inputs: GradeInput[]; values: number[] }
  >();

  for (const e of entries) {
    if (!bySubject.has(e.subjectId)) {
      bySubject.set(e.subjectId, {
        name: e.subjectName,
        inputs: [],
        values: [],
      });
    }
    const g = bySubject.get(e.subjectId)!;
    g.inputs.push({ value: e.value, weight: e.weight });
    if (e.value !== null) g.values.push(e.value);
  }

  return Array.from(bySubject.entries()).map(([subjectId, g]) => ({
    subjectId,
    subjectName: g.name,
    average: weightedAverage(g.inputs),
    count: g.values.length,
    min: g.values.length > 0 ? Math.min(...g.values) : null,
    max: g.values.length > 0 ? Math.max(...g.values) : null,
  }));
}

/**
 * Construiește datele pentru fișa individuală (report card).
 */
export function buildReportCardData(params: {
  studentId: string;
  studentName: string;
  className: string;
  termName: string;
  entries: {
    subjectId: string;
    subjectName: string;
    teacherName: string | null;
    title: string | null;
    value: number;
    weight: number;
    type: string;
    gradedAt: string;
  }[];
}): ReportCardData {
  const { studentId, studentName, className, termName, entries } = params;

  // Grupăm pe subiect
  const bySubject = new Map<
    string,
    {
      subjectName: string;
      teacherName: string | null;
      grades: ReportCardEntry["grades"];
      inputs: GradeInput[];
    }
  >();

  for (const e of entries) {
    if (!bySubject.has(e.subjectId)) {
      bySubject.set(e.subjectId, {
        subjectName: e.subjectName,
        teacherName: e.teacherName,
        grades: [],
        inputs: [],
      });
    }
    const s = bySubject.get(e.subjectId)!;
    s.grades.push({
      title: e.title,
      value: e.value,
      weight: e.weight,
      type: e.type,
      gradedAt: e.gradedAt,
    });
    s.inputs.push({ value: e.value, weight: e.weight });
  }

  const subjects: ReportCardEntry[] = Array.from(bySubject.entries()).map(
    ([subjectId, s]) => ({
      subjectId,
      subjectName: s.subjectName,
      teacherName: s.teacherName,
      average: weightedAverage(s.inputs),
      grades: s.grades,
    })
  );

  // Media generală = media aritmetică a mediilor per materie (doar non-null)
  const subjectAverages = subjects
    .map((s) => s.average)
    .filter((a): a is number => a !== null);

  const overallAverage =
    subjectAverages.length > 0
      ? Math.round(
          (subjectAverages.reduce((s, a) => s + a, 0) / subjectAverages.length) * 100
        ) / 100
      : null;

  return { studentId, studentName, className, termName, subjects, overallAverage };
}
