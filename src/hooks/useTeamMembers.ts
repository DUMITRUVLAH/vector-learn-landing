import { useState, useEffect } from "react";
import { fetchTeamMembers, type TeamMember } from "@/lib/api/team";

/** Simple session-scoped cache — re-fetched once per page load. */
let _cache: TeamMember[] | null = null;
let _promise: Promise<TeamMember[]> | null = null;

export interface UseTeamMembersResult {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
}

export function useTeamMembers(): UseTeamMembersResult {
  const [members, setMembers] = useState<TeamMember[]>(_cache ?? []);
  const [loading, setLoading] = useState(_cache === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache !== null) {
      setMembers(_cache);
      setLoading(false);
      return;
    }
    if (!_promise) {
      _promise = fetchTeamMembers();
    }
    let cancelled = false;
    _promise
      .then((data) => {
        if (!cancelled) {
          _cache = data;
          setMembers(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Eroare la încărcarea echipei");
          setLoading(false);
        }
        // reset promise so next mount can retry
        _promise = null;
      });
    return () => { cancelled = true; };
  }, []);

  return { members, loading, error };
}

/** Clear the session cache (for testing or logout). */
export function clearTeamMembersCache(): void {
  _cache = null;
  _promise = null;
}
