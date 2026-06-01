/**
 * DIPLOMA-802 — useCertificateTemplate
 *
 * Load and save certificate templates from the DIPLOMA-801 API.
 * Supports global templates + per-course/cohort overrides.
 */
import { useState, useEffect, useCallback } from "react";
import type { FieldsConfig } from "@/lib/api/certificateTemplates";
import {
  listCertificateTemplates,
  createCertificateTemplate,
  patchCertificateTemplate,
} from "@/lib/api/certificateTemplates";

export interface TemplateState {
  globalId: string | null;
  courseId: string | null;
  backgroundUrl: string | null;
  fieldsConfig: FieldsConfig;
  useCourseScopedTemplate: boolean;
}

interface UseCertificateTemplateOptions {
  courseId?: string | null;
  cohortId?: string | null;
}

interface UseCertificateTemplateReturn {
  templateState: TemplateState;
  loading: boolean;
  error: string | null;
  setFieldsConfig: (cfg: FieldsConfig) => void;
  setBackgroundUrl: (url: string | null) => void;
  setUseCourseScopedTemplate: (v: boolean) => void;
  saveGlobal: (name?: string) => Promise<void>;
  saveCourse: (name?: string) => Promise<void>;
  saving: boolean;
}

export const FONT_OPTIONS = [
  "Onest",
  "Playfair Display",
  "Cormorant Garamond",
  "Montserrat",
  "Lora",
];

export const FIELD_LABELS: Record<string, string> = {
  participant_name: "Nume cursant",
  course_name: "Curs",
  edition: "Ediție",
  mentor_name: "Mentor",
  completion_date: "Dată finalizare",
  certificate_id: "ID certificat",
};

export const DEFAULT_FIELDS: FieldsConfig = {
  participant_name: { x: 50, y: 45, fontSize: 36, fontFamily: "Onest", color: "#1a1a1a", maxWidth: 60, align: "center" },
  course_name: { x: 50, y: 55, fontSize: 24, fontFamily: "Onest", color: "#333333", maxWidth: 60, align: "center" },
  mentor_name: { x: 50, y: 65, fontSize: 18, fontFamily: "Onest", color: "#555555", maxWidth: 50, align: "center" },
  completion_date: { x: 20, y: 80, fontSize: 16, fontFamily: "Onest", color: "#555555", maxWidth: 30, align: "left" },
  certificate_id: { x: 80, y: 80, fontSize: 14, fontFamily: "Onest", color: "#888888", maxWidth: 30, align: "right" },
  qr_code: { x: 82, y: 70, size: 80 },
};

export function useCertificateTemplate({
  courseId = null,
  cohortId = null,
}: UseCertificateTemplateOptions = {}): UseCertificateTemplateReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [templateState, setTemplateState] = useState<TemplateState>({
    globalId: null,
    courseId: null,
    backgroundUrl: null,
    fieldsConfig: DEFAULT_FIELDS,
    useCourseScopedTemplate: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { templates } = await listCertificateTemplates({
        courseId: courseId ?? undefined,
        cohortId: cohortId ?? undefined,
      });

      const globalTpl = templates.find((t) => t.isGlobal) ?? null;
      const courseTpl = templates.find((t) => !t.isGlobal && t.courseId === courseId) ?? null;

      const activeTpl = courseTpl ?? globalTpl;

      setTemplateState((prev) => ({
        ...prev,
        globalId: globalTpl?.id ?? null,
        courseId: courseTpl?.id ?? null,
        backgroundUrl: activeTpl?.backgroundUrl ?? null,
        fieldsConfig: (activeTpl?.fieldsConfig as FieldsConfig | null) ?? DEFAULT_FIELDS,
        useCourseScopedTemplate: Boolean(courseTpl),
      }));
    } catch {
      setError("Nu s-a putut încărca template-ul.");
    } finally {
      setLoading(false);
    }
  }, [courseId, cohortId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFieldsConfig = useCallback((cfg: FieldsConfig) => {
    setTemplateState((prev) => ({ ...prev, fieldsConfig: cfg }));
  }, []);

  const setBackgroundUrl = useCallback((url: string | null) => {
    setTemplateState((prev) => ({ ...prev, backgroundUrl: url }));
  }, []);

  const setUseCourseScopedTemplate = useCallback((v: boolean) => {
    setTemplateState((prev) => ({ ...prev, useCourseScopedTemplate: v }));
  }, []);

  const saveGlobal = useCallback(
    async (name = "Global Certificate Template") => {
      setSaving(true);
      try {
        const payload = {
          name,
          fieldsConfig: templateState.fieldsConfig as Record<string, unknown>,
          backgroundUrl: templateState.backgroundUrl,
          isGlobal: true,
          courseId: null as string | null,
          cohortId: cohortId ?? null,
        };
        if (templateState.globalId) {
          await patchCertificateTemplate(templateState.globalId, payload);
        } else {
          const { template } = await createCertificateTemplate(payload);
          setTemplateState((prev) => ({ ...prev, globalId: template.id }));
        }
      } finally {
        setSaving(false);
      }
    },
    [templateState, cohortId]
  );

  const saveCourse = useCallback(
    async (name = "Course Certificate Template") => {
      if (!courseId) return;
      setSaving(true);
      try {
        const payload = {
          name,
          fieldsConfig: templateState.fieldsConfig as Record<string, unknown>,
          backgroundUrl: templateState.backgroundUrl,
          isGlobal: false,
          courseId,
          cohortId: cohortId ?? null,
        };
        if (templateState.courseId) {
          await patchCertificateTemplate(templateState.courseId, payload);
        } else {
          const { template } = await createCertificateTemplate(payload);
          setTemplateState((prev) => ({ ...prev, courseId: template.id }));
        }
      } finally {
        setSaving(false);
      }
    },
    [templateState, courseId, cohortId]
  );

  return {
    templateState,
    loading,
    error,
    setFieldsConfig,
    setBackgroundUrl,
    setUseCourseScopedTemplate,
    saveGlobal,
    saveCourse,
    saving,
  };
}
