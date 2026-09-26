/**
 * CRM — un rând de condiție („Sursă · este unul dintre · Facebook, Instagram"), comun regulilor de
 * automatizare și celor de distribuire.
 *
 * Un singur rând pentru ambele ecrane fiindcă și evaluatorul e unul singur pe server: două editoare
 * „echivalente" ar ajunge să scrie aceeași condiție în două forme diferite.
 *
 * Pentru sursă și etapă, valoarea se ALEGE, nu se tastează: omul nu știe că „Reclamă Facebook" e
 * `facebook_ad` în bază, iar o literă greșită face regula să nu prindă niciodată nimic, în tăcere.
 */
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button, Checkbox, Input, Label, Select } from "@/components/ds";
import {
  CONDITION_OP_LABELS,
  LEAD_SOURCE_LABELS,
  OPS_WITHOUT_VALUE,
  type AutomationCondition,
  type ConditionOp,
} from "@/lib/api/crmAutomations";

export interface ConditionChoice {
  value: string;
  label: string;
}

export interface AutomationConditionRowProps {
  condition: AutomationCondition;
  index: number;
  /** Prefixul id-urilor, ca două editoare pe aceeași pagină să nu-și împartă etichetele. */
  idPrefix: string;
  fields: ConditionChoice[];
  stages: ConditionChoice[];
  onChange: (next: AutomationCondition) => void;
  onRemove: () => void;
}

const SOURCE_CHOICES: ConditionChoice[] = Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({ value, label }));

function splitValues(value: AutomationCondition["value"]): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function AutomationConditionRow({
  condition: c,
  index: i,
  idPrefix,
  fields,
  stages,
  onChange,
  onRemove,
}: AutomationConditionRowProps) {
  const choices = c.field === "source" ? SOURCE_CHOICES : c.field === "stage" ? stages : null;
  const valueId = `${idPrefix}-val-${i}`;

  let valueEditor: ReactNode = null;
  if (!OPS_WITHOUT_VALUE.includes(c.op)) {
    if (choices && (c.op === "eq" || c.op === "neq")) {
      valueEditor = (
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor={valueId}>Valoarea</Label>
          <Select id={valueId} value={String(c.value ?? "")} onChange={(e) => onChange({ ...c, value: e.target.value })}>
            <option value="">Alege…</option>
            {choices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      );
    } else if (choices && c.op === "in") {
      const picked = splitValues(c.value);
      valueEditor = (
        <fieldset className="basis-full space-y-1">
          <legend className="text-sm font-medium">Oricare dintre</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {choices.map((o) => (
              <Checkbox
                key={o.value}
                label={o.label}
                checked={picked.includes(o.value)}
                onChange={(on) =>
                  onChange({
                    ...c,
                    value: (on ? [...picked, o.value] : picked.filter((v) => v !== o.value)).join(","),
                  })
                }
              />
            ))}
          </div>
        </fieldset>
      );
    } else {
      valueEditor = (
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label htmlFor={valueId}>Valoarea</Label>
          <Input
            id={valueId}
            value={String(c.value ?? "")}
            placeholder={c.op === "in" ? "separă prin virgulă: A, B, C" : undefined}
            onChange={(e) => onChange({ ...c, value: e.target.value })}
          />
        </div>
      );
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[9rem] flex-1 space-y-1">
        <Label htmlFor={`${idPrefix}-camp-${i}`}>Câmpul</Label>
        <Select
          id={`${idPrefix}-camp-${i}`}
          value={c.field}
          // Valoarea veche n-are sens pe alt câmp („facebook_ad" ca Firmă) — o golim.
          onChange={(e) => onChange({ ...c, field: e.target.value, value: "" })}
        >
          {fields.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-[9rem] space-y-1">
        <Label htmlFor={`${idPrefix}-op-${i}`}>Compară</Label>
        <Select
          id={`${idPrefix}-op-${i}`}
          value={c.op}
          onChange={(e) => onChange({ ...c, op: e.target.value as ConditionOp })}
        >
          {(Object.keys(CONDITION_OP_LABELS) as ConditionOp[]).map((op) => (
            <option key={op} value={op}>
              {CONDITION_OP_LABELS[op]}
            </option>
          ))}
        </Select>
      </div>
      {valueEditor}
      <Button variant="ghost" size="sm" aria-label={`Șterge condiția ${i + 1}`} onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
