/**
 * CRM Faza 9 — câmpurile personalizate ale workspace-ului, pe fișa leadului.
 *
 * Portare din crm-vector (CustomFieldsManagerModal + secțiunea din fișă), comasate: definițiile
 * se administrează CHIAR DE UNDE se completează. Un modal separat, ascuns în setări, e motivul
 * pentru care oamenii scriau „Nr. contract" în notiță — unde nu se poate filtra sau raporta.
 *
 * Valorile se salvează la ieșirea din câmp (blur), nu la fiecare tastă: altfel fiecare literă ar
 * fi o cerere. O valoare golită șterge rândul pe server.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  listCrmCustomFields,
  listCrmLeadFieldValues,
  setCrmLeadFieldValue,
  createCrmCustomField,
  deleteCrmCustomField,
  type CrmCustomField,
  type CrmCustomFieldType,
} from "@/lib/api/crm";

export interface LeadCustomFieldsProps {
  leadId: string;
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
}

export function LeadCustomFields({ leadId, onToast }: LeadCustomFieldsProps) {
  const [fields, setFields] = useState<CrmCustomField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<CrmCustomFieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listCrmCustomFields(), listCrmLeadFieldValues(leadId)])
      .then(([fieldsRes, valuesRes]) => {
        if (cancelled) return;
        setFields(fieldsRes.items);
        setValues(Object.fromEntries(valuesRes.items.map((v) => [v.fieldId, v.value ?? ""])));
      })
      .catch(() => {
        if (cancelled) return;
        setFields([]);
        setValues({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function saveValue(field: CrmCustomField, next: string) {
    setSavingId(field.id);
    try {
      await setCrmLeadFieldValue(leadId, field.id, next);
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut salva câmpul." });
    } finally {
      setSavingId(null);
    }
  }

  async function addField() {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      const options = newType === "select" ? newOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
      const created = await createCrmCustomField({ label, type: newType, ...(options?.length ? { options } : {}) });
      setFields((prev) => [...prev, created]);
      setNewLabel("");
      setNewOptions("");
      setNewType("text");
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "field_key_taken"
          ? "Există deja un câmp cu acest nume."
          : err instanceof Error
            ? err.message
            : "Nu am putut adăuga câmpul.";
      onToast({ kind: "error", message });
    } finally {
      setAdding(false);
    }
  }

  async function removeField(field: CrmCustomField) {
    if (!confirm(`Ștergi câmpul „${field.label}”? Dispare de pe TOATE leadurile, cu valorile lui.`)) return;
    try {
      await deleteCrmCustomField(field.id);
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      setValues((prev) => {
        const next = { ...prev };
        delete next[field.id];
        return next;
      });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge câmpul." });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă câmpurile personalizate..." />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Câmpuri personalizate</h3>
        <Button variant="ghost" size="sm" onClick={() => setManaging((m) => !m)} aria-expanded={managing}>
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {managing ? "Gata" : "Administrează"}
        </Button>
      </div>

      {fields.length === 0 && !managing ? (
        <p className="text-sm text-muted-foreground">
          Niciun câmp personalizat. „Administrează” adaugă unul — de exemplu „Nr. contract” sau „Ediția”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`crm-cf-${field.id}`}>{field.label}</Label>
                {managing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Șterge câmpul ${field.label}`}
                    onClick={() => void removeField(field)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
              {field.type === "select" ? (
                <Select
                  id={`crm-cf-${field.id}`}
                  value={values[field.id] ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    setValues((prev) => ({ ...prev, [field.id]: next }));
                    void saveValue(field, next);
                  }}
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`crm-cf-${field.id}`}
                  type={field.type === "number" ? "number" : "text"}
                  value={values[field.id] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  // Salvare la ieșirea din câmp: o cerere per valoare, nu una per tastă.
                  onBlur={(e) => void saveValue(field, e.target.value)}
                  disabled={savingId === field.id}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {managing && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-cf-new-label">Câmp nou</Label>
              <Input
                id="crm-cf-new-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="ex: Nr. contract"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-cf-new-type">Tip</Label>
              <Select
                id="crm-cf-new-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as CrmCustomFieldType)}
              >
                <option value="text">Text</option>
                <option value="number">Număr</option>
                <option value="select">Listă de opțiuni</option>
              </Select>
            </div>
            {newType === "select" && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="crm-cf-new-options">Opțiuni (separate prin virgulă)</Label>
                <Input
                  id="crm-cf-new-options"
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                  placeholder="ex: Ediția 1, Ediția 2"
                />
              </div>
            )}
          </div>
          <Button className="w-fit" onClick={() => void addField()} disabled={!newLabel.trim() || adding}>
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Adaugă câmp
          </Button>
        </div>
      )}
    </section>
  );
}
