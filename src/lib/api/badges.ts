/**
 * GAP-019 / GAP-020 — Badges API client
 */
import { api } from "../api";

export const BADGE_TYPES = [
  "first_lesson",
  "ten_lessons",
  "hundred_lessons",
  "first_homework",
  "five_homework",
  "thirty_day_streak",
  "perfect_week",
] as const;

export type BadgeType = (typeof BADGE_TYPES)[number];

export interface StudentBadge {
  id: string;
  badgeType: BadgeType;
  awardedAt: string;
  awardedReason: string | null;
}

export interface CheckBadgesResult {
  awarded: BadgeType[];
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  badgeCount: number;
  changeFromLastMonth: number;
}

export interface BadgeStats {
  totalBadges: number;
  studentsWithBadges: number;
  topBadgeType: BadgeType | null;
}

/** Fetch badges for a student */
export function getStudentBadges(studentId: string): Promise<StudentBadge[]> {
  return api<StudentBadge[]>(`/api/badges/students/${studentId}`);
}

/** Trigger badge awarding check for a student */
export function checkBadges(studentId: string): Promise<CheckBadgesResult> {
  return api<CheckBadgesResult>(`/api/badges/check/${studentId}`, { method: "POST" });
}

/** Fetch leaderboard (top students by badge count) */
export function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  return api<LeaderboardEntry[]>(`/api/badges/leaderboard?limit=${limit}`);
}

/** Fetch global badge stats */
export function getBadgeStats(): Promise<BadgeStats> {
  return api<BadgeStats>(`/api/badges/stats`);
}

/** Human-readable labels for each badge type (Romanian) */
export const BADGE_LABELS: Record<BadgeType, { title: string; description: string; emoji: string }> = {
  first_lesson: { title: "Prima Lecție", description: "A participat la prima lecție", emoji: "🎯" },
  ten_lessons: { title: "10 Lecții", description: "A participat la 10 lecții", emoji: "🔟" },
  hundred_lessons: { title: "100 Lecții", description: "A participat la 100 de lecții", emoji: "💯" },
  first_homework: { title: "Prima Temă", description: "A predat prima temă", emoji: "📝" },
  five_homework: { title: "5 Teme", description: "A predat 5 teme", emoji: "📚" },
  thirty_day_streak: { title: "30 Zile Consecutiv", description: "Prezență în 30 de zile consecutive", emoji: "🔥" },
  perfect_week: { title: "Săptămână Perfectă", description: "Prezență în 5 zile dintr-o săptămână", emoji: "⭐" },
};
