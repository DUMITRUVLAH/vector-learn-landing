import { api } from "@/lib/api";

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  return api<TeamMember[]>("/api/team/members");
}
