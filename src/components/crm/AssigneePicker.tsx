import { useTeamMembers } from "@/hooks/useTeamMembers";
import { cn } from "@/lib/utils";

interface AssigneePickerProps {
  /** The currently selected user UUID (or null/undefined for unassigned). */
  value: string | null | undefined;
  onChange: (userId: string | null) => void;
  /** HTML id for the <select> element — used by external <label>. */
  id?: string;
  /** aria-label when no external <label> is wired up. Defaults to "Responsabil". */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * CRM-137: Dropdown that shows team members by full name instead of UUIDs.
 * Includes an "Neasignat" option that maps to null.
 */
export function AssigneePicker({
  value,
  onChange,
  id,
  ariaLabel = "Responsabil",
  className,
  disabled = false,
}: AssigneePickerProps) {
  const { members, loading } = useTeamMembers();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onChange(v === "" ? null : v);
  };

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={handleChange}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className={cn(
        "rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
    >
      <option value="">Neasignat</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName}
        </option>
      ))}
    </select>
  );
}

/**
 * CRM-137: Resolves a UUID to a display name using the team members list.
 * Falls back gracefully while loading or on no match.
 */
export function useAssigneeName(userId: string | null | undefined): string {
  const { members } = useTeamMembers();
  if (!userId) return "Neasignat";
  const member = members.find((m) => m.id === userId);
  return member ? member.fullName : userId.slice(0, 8) + "…";
}
